import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateCourse, validateSupportQuestion, validateSupportReply, validateSupportThread} from '../packages/portal/src/index.ts';

// Run against real PostgreSQL in WASM with a task-local, exact-pinned PGlite.
// Auth JWT functions below are fixtures only, not a Supabase Auth integration.
const modulePath = process.env.OLR_PGLITE_MODULE;
test('course portal PostgreSQL row policies and transactional mutations', {skip: !modulePath}, async t => {
  const {PGlite} = await import(pathToFileURL(modulePath!).href);
  const db = new PGlite();
  const owner = '10000000-0000-0000-0000-000000000001';
  const learner = '10000000-0000-0000-0000-000000000002';
  const other = '10000000-0000-0000-0000-000000000003';
  const courseId = '20000000-0000-0000-0000-000000000001';
  const draftId = '20000000-0000-0000-0000-000000000002';
  const lessonId = '30000000-0000-0000-0000-000000000001';
  const revision = '40000000-0000-0000-0000-000000000001';
  async function as(role: 'anon'|'authenticated', uid: string | null, anonymous = false) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [uid ?? '',JSON.stringify({sub:uid,is_anonymous:anonymous})]);
    await db.exec(`set role ${role}`);
  }
  async function call(name: string, values: unknown[] = []) {
    const result = await db.query(`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) value`, values);
    return result.rows[0].value;
  }
  function course(id = courseId, status = 'published') {
    return {id,revision,title:'Original learning course',summary:'A plain and accessible practice task.',language:'en',status,
      lessons:[{id:lessonId,title:'Try a small experiment',text:'MEMBER_ONLY_LESSON',sourceUrl:'https://example.org/source',credit:'Original author',rights:'CC BY 4.0'}]};
  }
  await db.exec(`
    create role anon nologin noinherit; create role authenticated nologin noinherit;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
    insert into auth.users(id) values ('${owner}'),('${learner}'),('${other}');
  `);
  await db.exec(await readFile(new URL('../examples/supabase/course-portal-schema.sql', import.meta.url),'utf8'));
  await db.query('insert into portal_private.administrators(user_id) values ($1)',[owner]);
  let published: any;
  let draft: any;
  let support: any;
  try {
    await t.test('only an offline-provisioned administrator can create courses', async () => {
      await as('authenticated', learner);
      assert.equal(await call('portal_role'),'learner');
      await assert.rejects(call('portal_save_course',[course(),null]), /Administrator permission/);
      await assert.rejects(db.query('insert into portal_private.administrators(user_id) values ($1)',[learner]),/permission denied/);
      await as('authenticated', owner);
      assert.equal(await call('portal_role'),'admin');
      published = await call('portal_save_course',[course(),null]);
      draft = await call('portal_save_course',[course(draftId,'draft'),null]);
      assert.notEqual(published.revision, revision);
    });
    await t.test('public catalog exposes published metadata without member materials or drafts', async () => {
      await as('anon', null);
      const catalog = await call('portal_list_courses');
      assert.equal(catalog.length,1); assert.equal(catalog[0].id,courseId); assert.deepEqual(catalog[0].lessons,[]);
      assert.equal(JSON.stringify(catalog).includes('MEMBER_ONLY_LESSON'),false);
      assert.equal((await db.query('select * from public.portal_course_materials')).rows.length,0);
      await assert.rejects(call('portal_save_course',[course(),null]),/permission denied/);
      await assert.rejects(db.query('select * from public.portal_support_threads'),/permission denied/);
    });
    await t.test('confirmed learner context can read published materials but cannot mutate courses or see drafts', async () => {
      await as('authenticated', learner);
      const catalog = await call('portal_list_courses');
      assert.equal(catalog.length,1); assert.equal(catalog[0].lessons[0].text,'MEMBER_ONLY_LESSON');
      assert.equal((await db.query('select * from public.portal_courses where id=$1',[draftId])).rows.length,0);
      await assert.rejects(call('portal_save_course',[published,published.revision]),/Administrator permission/);
      await assert.rejects(db.query('update public.portal_courses set title=$1 where id=$2',['Bypassed RPC',courseId]),/permission denied/);
      await assert.rejects(db.query('delete from public.portal_course_materials where course_id=$1',[courseId]),/permission denied/);
    });
    await t.test('admin sees drafts and stale course saves do not overwrite newer material', async () => {
      await as('authenticated', owner);
      assert.equal((await call('portal_list_courses')).length,2);
      const next = await call('portal_save_course',[{...published,title:'Newer title'},published.revision]);
      await assert.rejects(call('portal_save_course',[{...published,title:'Stale title'},published.revision]), /Course changed/);
      published = next;
      assert.equal((await call('portal_list_courses')).find((row:any)=>row.id===courseId).title,'Newer title');
      await assert.rejects(call('portal_save_course',[{...draft,lessons:[],status:'published'},draft.revision]),/Invalid or oversized/);
    });
    await t.test('support inserts are bound to the verified caller and cross-learner reads are denied', async () => {
      await as('authenticated', learner);
      await call('portal_ask_support',[{courseId,subject:'A useful question',message:'Please clarify the first task.'}]);
      const mine = await call('portal_support'); assert.equal(mine.length,1); support=mine[0];
      assert.equal(support.learnerId,learner);
      await assert.rejects(call('portal_ask_support',[{subject:'Spoof',message:'Spoof',learnerId:other}]),/Invalid support/);
      await assert.rejects(call('portal_ask_support',[{courseId:draftId,subject:'Draft',message:'Show me the draft'}]),/Course unavailable/);
      await as('authenticated', other);
      assert.deepEqual(await call('portal_support'),[]);
      assert.equal((await db.query('select * from public.portal_support_threads where id=$1',[support.id])).rows.length,0);
      await assert.rejects(call('portal_reply_support',[support.id,'Forged reply',support.revision]),/Administrator permission/);
    });
    await t.test('only admins reply and stale replies preserve the current answer', async () => {
      await as('authenticated', owner);
      assert.equal((await call('portal_support')).length,1);
      await call('portal_reply_support',[support.id,'Try one example, then tell us which step is unclear.',support.revision]);
      await assert.rejects(call('portal_reply_support',[support.id,'Stale overwrite',support.revision]),/Support request changed/);
      await as('authenticated', learner);
      const current = (await call('portal_support'))[0];
      assert.equal(current.status,'answered'); assert.notEqual(current.revision,support.revision);
      assert.ok(current.reply.startsWith('Try one example'));
      await assert.rejects(db.query('update public.portal_support_threads set learner_id=$1 where id=$2',[other,support.id]),/permission denied/);
    });
    await t.test('null and anonymous-sign-in contexts cannot read materials or use account mutations', async () => {
      for (const [uid,anonymous] of [[null,false],[learner,true]] as const) {
        await as('authenticated',uid,anonymous);
        assert.equal(await call('portal_role'),'anonymous');
        assert.equal((await call('portal_list_courses'))[0].lessons.length,0);
        assert.deepEqual(await call('portal_support'),[]);
        await assert.rejects(call('portal_ask_support',[{subject:'No account',message:'No session'}]),/Sign in required/);
      }
    });
    await t.test('direct RPC payloads reject extra data, oversized text and unsafe links atomically', async () => {
      await as('authenticated',owner);
      for (const changes of [{privateJournal:'DO_NOT_ACCEPT'}, {id:'{'+courseId+'}'}, {title:'x'.repeat(161)}, {lessons:[{...course().lessons[0],sourceUrl:'javascript:alert(1)'}]}, {lessons:[{...course().lessons[0],sourceUrl:'https://user:password@example.org/'}]}, {lessons:[{...course().lessons[0],text:'x'.repeat(20001)}]}, {lessons:[{...course().lessons[0],credit:''}]}, {lessons:[{...course().lessons[0],rights:''}]}]) {
        await assert.rejects(call('portal_save_course',[{...published,...changes},published.revision]));
      }
      const current = (await call('portal_list_courses')).find((row:any)=>row.id===courseId);
      assert.equal(current.revision,published.revision); assert.equal(current.title,published.title);
    });
    await t.test('course and material UTF-16 limits accept the boundary and reject one extra code unit', async () => {
      await as('authenticated',owner);
      const boundary = {...published,title:'🧭'.repeat(80),summary:'🧭'.repeat(1000),lessons:[{
        ...course().lessons[0],title:'🧭'.repeat(80),text:'🧭'.repeat(10000),credit:'🧭'.repeat(250),rights:'🧭'.repeat(250)
      }]};
      published = await call('portal_save_course',[boundary,published.revision]);
      assert.deepEqual(validateCourse(published),published);
      for (const field of ['title','summary'] as const) {
        const invalid = {...published,[field]:published[field]+'x'};
        assert.throws(()=>validateCourse(invalid));
        await assert.rejects(call('portal_save_course',[invalid,published.revision]),/Invalid or oversized/);
      }
      for (const field of ['title','text','credit','rights'] as const) {
        const invalid = {...published,lessons:[{...published.lessons[0],[field]:published.lessons[0][field]+'x'}]};
        assert.throws(()=>validateCourse(invalid));
        await assert.rejects(call('portal_save_course',[invalid,published.revision]),/Invalid or oversized/);
      }
      const current = (await call('portal_list_courses')).find((row:any)=>row.id===courseId);
      assert.deepEqual(validateCourse(current),published);
    });
    await t.test('support UTF-16 limits accept the boundary and reject one extra code unit', async () => {
      await as('authenticated',learner);
      const question = {subject:'🧭'.repeat(80),message:'🧭'.repeat(2500)};
      await call('portal_ask_support',[validateSupportQuestion(question)]);
      const thread = (await call('portal_support')).find((row:any)=>row.subject===question.subject);
      assert.deepEqual(validateSupportThread(thread),thread);
      for (const field of ['subject','message'] as const) {
        const invalid = {...question,[field]:question[field]+'x'};
        assert.throws(()=>validateSupportQuestion(invalid));
        await assert.rejects(call('portal_ask_support',[invalid]),/Invalid support/);
      }
      await as('authenticated',owner);
      const reply = '🧭'.repeat(2500);
      await call('portal_reply_support',[thread.id,validateSupportReply(reply),thread.revision]);
      const answered = (await call('portal_support')).find((row:any)=>row.id===thread.id);
      assert.deepEqual(validateSupportThread(answered),answered);
      assert.equal(answered.reply,reply);
      assert.throws(()=>validateSupportReply(reply+'x'));
      await assert.rejects(call('portal_reply_support',[thread.id,reply+'x',answered.revision]),/Invalid support reply/);
    });
    await t.test('ECMAScript whitespace-only required text cannot poison course or support records', async () => {
      const whitespace = '\t\n\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
      await as('authenticated',learner);
      for (const blank of whitespace) {
        assert.equal(blank.trim(),'');
        for (const question of [{subject:blank,message:'A question'},{subject:'A question',message:blank}]) {
          assert.throws(()=>validateSupportQuestion(question));
          await assert.rejects(call('portal_ask_support',[question]),/Invalid support/);
        }
      }
      await as('authenticated',owner);
      for (const changes of [{title:whitespace},{summary:whitespace},{lessons:[{...published.lessons[0],title:whitespace}]}]) {
        assert.throws(()=>validateCourse({...published,...changes}));
        await assert.rejects(call('portal_save_course',[{...published,...changes},published.revision]),/Invalid or oversized/);
      }
      for (const blank of whitespace) {
        assert.throws(()=>validateSupportReply(blank));
        await assert.rejects(call('portal_reply_support',[support.id,blank,support.revision]),/Invalid support reply/);
      }
      assert.ok((await call('portal_support')).every((row:any)=>validateSupportThread(row)));
    });
    await t.test('administrator revocation takes effect on the next call without refreshing JWT claims', async () => {
      await db.exec('reset role');
      await db.query('delete from portal_private.administrators where user_id=$1',[owner]);
      await as('authenticated',owner);
      assert.equal(await call('portal_role'),'learner');
      assert.equal((await call('portal_list_courses')).length,1);
      await assert.rejects(call('portal_save_course',[published,published.revision]),/Administrator permission/);
      await assert.rejects(call('portal_reply_support',[support.id,'Revoked administrator',support.revision]),/Administrator permission/);
    });
  } finally { await db.close(); }
});
