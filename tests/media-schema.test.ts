import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {describePortalMedia, MEDIA_LIMITS, type PortalMedia} from '../packages/portal/src/media.ts';
import {createPostgresMediaStore} from '../examples/postgres/media-store.ts';

const modulePath=process.env.OLR_PGLITE_MODULE;
test('private PostgreSQL media functions enforce permissions, publication and quotas',{skip:!modulePath},async t=>{
  const {PGlite}=await import(pathToFileURL(modulePath!).href);
  const db=new PGlite();
  const admin='10000000-0000-0000-0000-000000000001',learner='10000000-0000-0000-0000-000000000002';
  const outsider='10000000-0000-0000-0000-000000000003',unverified='10000000-0000-0000-0000-000000000004';
  const group='20000000-0000-0000-0000-000000000001',course='30000000-0000-0000-0000-000000000001';
  const data=new TextEncoder().encode('%PDF-1.7\nOriginal lesson');
  const media=await describePortalMedia('lesson.pdf',data);
  const draft=await describePortalMedia('draft.pdf',data);
  const store=createPostgresMediaStore(db);
  async function as(role:'anon'|'authenticated'|'library_media_service'|'owner'){
    await db.exec('reset role');if(role!=='owner')await db.exec(`set role ${role}`);
  }
  async function put(actor:string,value:unknown,bytes=data){return db.query('select portal_private.put_media($1::uuid,$2::jsonb,$3::bytea)',[actor,JSON.stringify(value),bytes]);}
  async function get(actor:string,id:string){return (await db.query('select media,bytes from portal_private.get_media($1::uuid,$2::uuid)',[actor,id])).rows;}
  const lesson=(attachment:PortalMedia)=>[{id:crypto.randomUUID(),title:'Original lesson',text:'Study this file.',sourceUrl:'',credit:'Original author',rights:'Owned original',mediaType:attachment.mediaType,attachment}];
  try{
    await db.exec('create role anon nologin noinherit; create role authenticated nologin noinherit;');
    for(const file of ['course-portal-schema.sql','group-workspace-schema.sql','media-schema.sql'])await db.exec(await readFile(new URL(`../examples/postgres/${file}`,import.meta.url),'utf8'));
    await db.query(`insert into portal_private.accounts(id,email,verified) values ($1,'admin@example.org',true),($2,'learner@example.org',true),($3,'other@example.org',true),($4,'unverified@example.org',false)`,[admin,learner,outsider,unverified]);
    await db.query('insert into portal_private.administrators(user_id) values($1),($2)',[admin,unverified]);
    await db.query("insert into public.portal_groups(id,title,description,kind,facilitator_id) values($1,'Study circle','','group',$2)",[group,admin]);
    await db.query('insert into public.portal_group_members(group_id,user_id) values($1,$2),($1,$3)',[group,learner,unverified]);
    await t.test('browser roles cannot call private media functions or directly mutate bytes',async()=>{
      for(const role of ['anon','authenticated'] as const){
        await as(role);
        await assert.rejects(put(admin,media),/permission denied/u);
        await assert.rejects(get(admin,media.id),/permission denied/u);
        await assert.rejects(db.query('insert into portal_private.media_blobs(id,media,bytes,uploaded_by) values($1,$2,$3,$4)',[media.id,JSON.stringify(media),data,admin]),/permission denied/u);
        await assert.rejects(db.query('delete from portal_private.media_blobs'),/permission denied/u);
      }
      await as('owner');
      const role=(await db.query("select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='library_media_service'")).rows[0];
      assert.deepEqual(role,{rolcanlogin:false,rolsuper:false,rolbypassrls:false});
    });
    await t.test('the server role rechecks verified administrator identity and cannot read raw storage',async()=>{
      await as('library_media_service');
      await assert.rejects(db.query('select * from portal_private.media_blobs'),/permission denied/u);
      await assert.rejects(db.query('update portal_private.media_blobs set bytes=$1',[data]),/permission denied/u);
      await assert.rejects(db.query('delete from portal_private.media_blobs'),/permission denied/u);
      await assert.rejects(db.query('select portal_private.attachment_available($1)',[JSON.stringify(media)]),/permission denied/u);
      await assert.rejects(put(learner,media),/Administrator permission/u);
      await assert.rejects(put(unverified,media),/Administrator permission/u);
      await assert.rejects(put(crypto.randomUUID(),media),/Administrator permission/u);
      await store.put(admin,media,data);await store.put(admin,draft,data);
      assert.deepEqual(await store.get(admin,media.id),{media,bytes:data});
      for(const actor of [learner,outsider,unverified])assert.deepEqual(await get(actor,media.id),[]);
    });
    await t.test('byte lengths, digests, signatures and metadata must agree even on direct function calls',async()=>{
      await as('library_media_service');
      for(const value of [{...media,id:crypto.randomUUID(),size:data.byteLength+1},{...media,id:crypto.randomUUID(),sha256:'0'.repeat(64)},{...media,id:crypto.randomUUID(),mime:'text/html'},{...media,id:crypto.randomUUID(),name:'../lesson.pdf'},{...media,id:crypto.randomUUID(),extra:'value'}])await assert.rejects(put(admin,value),/Invalid media/u);
      const wrong=new TextEncoder().encode('x'.repeat(data.length));
      const wrongHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wrong)),v=>v.toString(16).padStart(2,'0')).join('');
      await assert.rejects(put(admin,{...media,id:crypto.randomUUID(),sha256:wrongHash},wrong),/Invalid media/u);
      await as('owner');
      for(const value of [{...media,id:crypto.randomUUID(),size:data.byteLength+1},{...media,id:crypto.randomUUID(),sha256:'0'.repeat(64)},{...media,id:crypto.randomUUID(),mime:'text/html'}]){
        await assert.rejects(db.query('insert into portal_private.media_blobs(id,media,bytes,uploaded_by) values($1,$2,$3,$4)',[value.id,JSON.stringify(value),data,admin]),/check constraint/u);
      }
    });
    await t.test('only a current member can read exact media referenced by a published course',async()=>{
      await as('owner');
      await db.query("insert into public.portal_courses(id,title,summary,language,status) values($1,'Study','Learn something.','en','published')",[course]);
      await db.query('insert into public.portal_course_materials(course_id,lessons) values($1,$2)',[course,JSON.stringify(lesson(media))]);
      const draftCourse=crypto.randomUUID();
      await db.query("insert into public.portal_courses(id,title,summary,language,status) values($1,'Draft','In progress.','en','draft')",[draftCourse]);
      await db.query('insert into public.portal_course_materials(course_id,lessons) values($1,$2)',[draftCourse,JSON.stringify(lesson(draft))]);
      await assert.rejects(db.query('update public.portal_course_materials set lessons=$1 where course_id=$2',[JSON.stringify(lesson({...media,name:'forged.pdf'})),course]),/check constraint/u);
      await as('library_media_service');
      assert.deepEqual(await store.get(learner,media.id),{media,bytes:data});
      assert.equal(await store.get(learner,draft.id),null);assert.equal(await store.get(outsider,media.id),null);assert.equal(await store.get(unverified,media.id),null);
      await as('owner');await db.query("update public.portal_courses set status='draft' where id=$1",[course]);
      await as('library_media_service');assert.equal(await store.get(learner,media.id),null);
      await as('owner');await db.query("update public.portal_courses set status='published' where id=$1",[course]);await db.query('delete from public.portal_group_members where user_id=$1',[learner]);
      await as('library_media_service');assert.equal(await store.get(learner,media.id),null);assert.ok(await store.get(admin,draft.id));
    });
    await t.test('a fixed one hundred file quota applies to administrators collectively',async()=>{
      await as('owner');await db.exec('delete from public.portal_course_materials; delete from portal_private.media_blobs;');
      await as('library_media_service');
      for(let i=0;i<MEDIA_LIMITS.files;i++)await put(admin,{...media,id:crypto.randomUUID()});
      await assert.rejects(put(admin,{...media,id:crypto.randomUUID()}),/Media storage limit/u);
      await as('owner');assert.equal((await db.query('select count(*)::integer count from portal_private.media_blobs')).rows[0].count,100);
    });
    await t.test('the aggregate byte quota is one hundred MiB, independent of file count',async()=>{
      await as('owner');await db.exec('delete from portal_private.media_blobs');
      const full=new Uint8Array(MEDIA_LIMITS.fileBytes);full.set(data);
      const fullMedia=await describePortalMedia('full.pdf',full);
      await as('library_media_service');
      for(let i=0;i<10;i++)await put(admin,{...fullMedia,id:crypto.randomUUID()},full);
      await assert.rejects(put(admin,{...media,id:crypto.randomUUID()}),/Media storage limit/u);
      await as('owner');const totals=(await db.query('select count(*)::integer count,sum(octet_length(bytes))::integer size from portal_private.media_blobs')).rows[0];
      assert.deepEqual(totals,{count:10,size:MEDIA_LIMITS.totalBytes});
    });
  }finally{await db.close();}
});
