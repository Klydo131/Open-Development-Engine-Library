import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateStudyGroup,validateStudySession,validateGroupPost,validateGroupInvitation,validateTeacherRequest} from '../packages/portal/src/index.ts';

const modulePath=process.env.OLR_PGLITE_MODULE;
test('portable PostgreSQL group workspace policies and transactions',{skip:!modulePath},async t=>{
  const {PGlite}=await import(pathToFileURL(modulePath!).href);
  const db=new PGlite();
  const admin='10000000-0000-0000-0000-000000000001';
  const learner='10000000-0000-0000-0000-000000000002';
  const other='10000000-0000-0000-0000-000000000003';
  const secondAdmin='10000000-0000-0000-0000-000000000004';
  const unverified='10000000-0000-0000-0000-000000000005';
  const groupId='20000000-0000-0000-0000-000000000001';
  const otherGroup='20000000-0000-0000-0000-000000000002';
  const sessionId='30000000-0000-0000-0000-000000000001';
  const revision='40000000-0000-0000-0000-000000000001';
  const token='a'.repeat(64);
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  async function as(role:'anon'|'authenticated',id:string|null){
    await db.exec('reset role');
    await db.query("select set_config('library.actor_id',$1,false)",[id??'']);
    await db.exec(`set role ${role}`);
  }
  async function call(name:string,values:unknown[]=[]){
    const result=await db.query(`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) value`,values);
    return result.rows[0].value;
  }
  const group=(id=groupId)=>({id,revision,title:'Study circle',description:'Discuss the current reading.',kind:'group',facilitatorId:admin});
  let saved:any;let invitation:any;let request:any;let privateRoom:any;let session:any;
  try{
    await db.exec('create role anon nologin noinherit; create role authenticated nologin noinherit;');
    for(const file of ['course-portal-schema.sql','group-workspace-schema.sql'])await db.exec(await readFile(new URL(`../examples/postgres/${file}`,import.meta.url),'utf8'));
    await db.query(`insert into portal_private.accounts(id,email,verified) values
      ($1,'admin@example.org',true),($2,'learner@example.org',true),($3,'other@example.org',true),
      ($4,'second-admin@example.org',true),($5,'unverified@example.org',false)`,[admin,learner,other,secondAdmin,unverified]);
    await db.query('insert into portal_private.administrators(user_id) values($1),($2)',[admin,secondAdmin]);
    await t.test('portable schema has no hosted auth dependency and trusted accounts fail closed',async()=>{
      assert.equal((await db.query("select count(*)::integer count from information_schema.schemata where schema_name='auth'")).rows[0].count,0);
      for(const id of [null,unverified,'10000000-0000-0000-0000-000000000099']){
        await as('authenticated',id);
        assert.deepEqual(await call('portal_groups'),[]);
        await assert.rejects(call('portal_request_teacher',[{subject:'Help',message:'A study question'}]),/Confirmed learner/);
        assert.equal(await call('portal_role'),'anonymous');
      }
      await as('anon',null);
      await assert.rejects(call('portal_groups'),/permission denied/);
      await as('authenticated',learner);
      await assert.rejects(db.query('update portal_private.accounts set verified=true where id=$1',[learner]),/permission denied/);
    });
    await t.test('administrator group creation binds facilitator and preserves revision checks',async()=>{
      await as('authenticated',learner);
      await assert.rejects(call('portal_save_group',[group(),null]),/Administrator permission/);
      await as('authenticated',admin);
      for(const bad of [{...group(),facilitatorId:secondAdmin},{...group(),kind:'private'}])await assert.rejects(call('portal_save_group',[bad,null]),/Private rooms/);
      saved=await call('portal_save_group',[group(),null]);
      assert.deepEqual(validateStudyGroup(saved),saved);
      await call('portal_save_group',[group(otherGroup),null]);
      const next=await call('portal_save_group',[{...saved,title:'Updated circle'},saved.revision]);
      await assert.rejects(call('portal_save_group',[saved,saved.revision]),/Group changed/);
      await assert.rejects(call('portal_save_group',[{...next,facilitatorId:secondAdmin},next.revision]),/immutable/);
      for(const bad of [{...next,revision:null},{...next,title:'x'.repeat(161)},{...next,privateNotes:'extra'}])await assert.rejects(call('portal_save_group',[bad,next.revision]),/Invalid group/);
      saved=next;
    });
    await t.test('invitations expose no tokens and bind one verified learner email',async()=>{
      await as('authenticated',admin);
      invitation=await call('portal_create_group_invitation',[groupId,'Learner@Example.org',hash(token)]);
      assert.deepEqual(validateGroupInvitation(invitation),invitation);
      assert.equal(invitation.email,'learner@example.org');
      assert.equal(JSON.stringify(invitation).includes(hash(token)),false);
      await as('authenticated',other);
      await assert.rejects(call('portal_accept_group_invitation',[token]),/Invitation unavailable/);
      await assert.rejects(call('portal_group_invitations',[groupId]),/Administrator permission/);
      await assert.rejects(db.query('select * from portal_private.group_invitations'),/permission denied/);
      await as('authenticated',admin);
      await assert.rejects(call('portal_accept_group_invitation',[token]),/Confirmed learner/);
      await as('authenticated',learner);
      assert.deepEqual(await call('portal_groups'),[]);
      const joined=await call('portal_accept_group_invitation',[token]);
      assert.equal(joined.id,groupId);
      await assert.rejects(call('portal_accept_group_invitation',[token]),/Invitation unavailable/);
      assert.equal((await call('portal_groups')).length,1);
      assert.deepEqual(await call('portal_group_posts',[otherGroup]),[]);
      await assert.rejects(call('portal_add_group_post',[otherGroup,'Wrong group']),/Group unavailable/);
      await assert.rejects(call('portal_group_members',[groupId]),/Administrator permission/);
    });
    await t.test('expired and revoked invitation links do not grant membership',async()=>{
      await as('authenticated',admin);
      const expired=await call('portal_create_group_invitation',[otherGroup,'other@example.org',hash('b'.repeat(64))]);
      await assert.rejects(call('portal_create_group_invitation',[otherGroup,'other@example.org',hash('e'.repeat(64))]),/pending invitation/u);
      await db.exec('reset role');
      await db.query("update portal_private.group_invitations set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);
      await as('authenticated',admin);
      const revoked=await call('portal_create_group_invitation',[otherGroup,'other@example.org',hash('c'.repeat(64))]);
      await call('portal_revoke_group_invitation',[otherGroup,revoked.id]);
      await db.exec('reset role');
      await db.query("update portal_private.group_invitations set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);
      await as('authenticated',other);
      for(const value of ['b'.repeat(64),'c'.repeat(64),'bad'])await assert.rejects(call('portal_accept_group_invitation',[value]),/Invitation unavailable/);
      assert.deepEqual(await call('portal_groups'),[]);
    });
    await t.test('sessions remain UTC and only administrators schedule or replace them',async()=>{
      const input={id:sessionId,revision,groupId,title:'Reading together',description:'Bring one question.',startsAt:'2026-11-01T01:30:00.000Z',durationMinutes:45};
      await as('authenticated',learner);
      await assert.rejects(call('portal_save_group_session',[input,null]),/Administrator permission/);
      await as('authenticated',admin);
      await db.exec("set timezone='Pacific/Auckland'");
      session=await call('portal_save_group_session',[input,null]);
      assert.deepEqual(validateStudySession(session),session);assert.equal(session.startsAt,input.startsAt);
      session=await call('portal_save_group_session',[{...session,durationMinutes:60},session.revision]);
      await assert.rejects(call('portal_save_group_session',[input,revision]),/Session changed/);
      for(const bad of [{...session,startsAt:'2026-11-01T01:30:00+01:00'},{...session,durationMinutes:0},{...session,durationMinutes:1.5}])await assert.rejects(call('portal_save_group_session',[bad,session.revision]),/Invalid study session/);
      await as('authenticated',learner);
      assert.equal((await call('portal_group_sessions',[groupId]))[0].durationMinutes,60);
      assert.deepEqual(await call('portal_group_sessions',[otherGroup]),[]);
    });
    await t.test('discussion authors cannot be impersonated and moderators cannot cross private boundaries',async()=>{
      await as('authenticated',learner);
      await call('portal_add_group_post',[groupId,'What does this passage mean?']);
      let post=(await call('portal_group_posts',[groupId]))[0];
      assert.deepEqual(validateGroupPost(post),post);assert.equal(post.authorId,learner);assert.equal(post.authorRole,'learner');
      await assert.rejects(db.query("insert into public.portal_group_posts(group_id,author_id,author_role,body) values($1,$2,'admin','Spoof')",[groupId,admin]),/permission denied/);
      await assert.rejects(call('portal_add_group_post',[groupId,'\u00a0']),/Invalid discussion/);
      await as('authenticated',other);
      await assert.rejects(call('portal_remove_group_post',[groupId,post.id]),/Group unavailable/);
      await as('authenticated',admin);
      await call('portal_add_group_post',[groupId,'A helpful reference.']);
      post=(await call('portal_group_posts',[groupId])).find((p:any)=>p.authorId===admin);
      await as('authenticated',learner);
      await assert.rejects(call('portal_remove_group_post',[groupId,post.id]),/Discussion post unavailable/);
      await as('authenticated',admin);
      for(const row of await call('portal_group_posts',[groupId]))await call('portal_remove_group_post',[groupId,row.id]);
      assert.deepEqual(await call('portal_group_posts',[groupId]),[]);
    });
    await t.test('a learner requests teaching and only an administrator can create the private room',async()=>{
      await as('authenticated',learner);
      await call('portal_request_teacher',[{subject:'Physics practice',message:'Help me work through the exercise.'}]);
      request=(await call('portal_teacher_requests'))[0];assert.deepEqual(validateTeacherRequest(request),request);
      assert.equal(request.learnerId,learner);
      await assert.rejects(call('portal_request_teacher',[{subject:'Spoof',message:'No',learnerId:other}]),/Invalid teacher request/);
      await assert.rejects(call('portal_create_private_room',[request.id,'Private study','One learner and facilitator.']),/Administrator permission/);
      await as('authenticated',other);assert.deepEqual(await call('portal_teacher_requests'),[]);
      await as('authenticated',admin);
      privateRoom=await call('portal_create_private_room',[request.id,'Private study','One learner and facilitator.']);
      assert.equal(privateRoom.kind,'private');assert.equal(privateRoom.facilitatorId,admin);
      await assert.rejects(call('portal_create_private_room',[request.id,'Duplicate','']),/Teacher request changed/);
      await assert.rejects(call('portal_create_group_invitation',[privateRoom.id,'other@example.org',hash('d'.repeat(64))]),/Private rooms/);
      await call('portal_add_group_post',[privateRoom.id,'Private teaching material.']);
    });
    await t.test('private rooms exclude another administrator as well as unrelated learners',async()=>{
      await as('authenticated',secondAdmin);
      assert.equal((await call('portal_groups')).some((g:any)=>g.id===privateRoom.id),false);
      assert.deepEqual(await call('portal_group_posts',[privateRoom.id]),[]);
      assert.deepEqual(await call('portal_teacher_requests'),[]);
      await assert.rejects(call('portal_group_members',[privateRoom.id]),/Administrator permission/);
      await assert.rejects(call('portal_add_group_post',[privateRoom.id,'Not assigned']),/Group unavailable/);
      await as('authenticated',learner);
      assert.equal((await call('portal_groups')).some((g:any)=>g.id===privateRoom.id),true);
      assert.equal((await call('portal_group_posts',[privateRoom.id]))[0].body,'Private teaching material.');
      assert.equal((await call('portal_teacher_requests'))[0].roomId,privateRoom.id);
    });
    await t.test('membership revocation and administrator revocation apply on the next query',async()=>{
      await as('authenticated',admin);
      assert.equal((await call('portal_group_members',[groupId]))[0].email,'learner@example.org');
      await call('portal_create_group_invitation',[groupId,'learner@example.org',hash('f'.repeat(64))]);
      await call('portal_remove_group_member',[groupId,learner]);
      await as('authenticated',learner);
      await assert.rejects(call('portal_accept_group_invitation',['f'.repeat(64)]),/Invitation unavailable/u);
      assert.equal((await call('portal_groups')).some((g:any)=>g.id===groupId),false);
      await assert.rejects(call('portal_add_group_post',[groupId,'After removal']),/Group unavailable/);
      await db.exec('reset role');await db.query('delete from portal_private.administrators where user_id=$1',[admin]);
      await as('authenticated',admin);
      assert.deepEqual(await call('portal_groups'),[]);
      assert.deepEqual(await call('portal_group_posts',[privateRoom.id]),[]);
      await assert.rejects(call('portal_save_group',[saved,saved.revision]),/Administrator permission/);
    });
  }finally{await db.close();}
});
