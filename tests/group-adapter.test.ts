import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseGroupWorkspace} from '../examples/supabase/group-workspace.ts';
import {rpcGroupWorkspace} from '../examples/postgres/group-workspace.ts';
import {PortalConflict} from '../packages/portal/src/index.ts';

const id='10000000-0000-0000-0000-000000000001';
const other='10000000-0000-0000-0000-000000000002';
const group={id,revision:id,title:'Reading circle',description:'Shared study',kind:'group' as const,facilitatorId:other};
const session={id,revision:id,groupId:id,title:'Discussion',description:'Bring a question',startsAt:'2026-11-01T00:00:00.000Z',durationMinutes:60};
const post={id,groupId:id,authorId:other,authorRole:'learner' as const,body:'A question',createdAt:'2026-10-22T00:00:00.000Z'};
const invite={id,groupId:id,email:'learner@example.org',expiresAt:'2026-10-29T00:00:00.000Z',status:'pending' as const};
const request={id,learnerId:other,subject:'Study support',message:'Help me practice',status:'open' as const};
function fixture(){
  const calls:{name:string;parameters?:Record<string,unknown>}[]=[];
  let data:unknown=[];let error:unknown=null;
  const groups=rpcGroupWorkspace({async rpc(name,parameters){calls.push({name,parameters});return {data,error};}});
  return {groups,calls,result(value:unknown,failure:unknown=null){data=value;error=failure;}};
}
test('group adapter maps bounded reads and validates response records',async()=>{
  const f=fixture();
  const methods=[
    [()=>f.groups.listGroups(),'portal_groups',[group]],
    [()=>f.groups.listSessions(id),'portal_group_sessions',[session]],
    [()=>f.groups.listPosts(id),'portal_group_posts',[post]],
    [()=>f.groups.listInvitations(id),'portal_group_invitations',[invite]],
    [()=>f.groups.listMembers(id),'portal_group_members',[{userId:other,email:'learner@example.org'}]],
    [()=>f.groups.listTeacherRequests(),'portal_teacher_requests',[request]],
  ] as const;
  for(const [run,name,records]of methods){
    f.result(records);assert.deepEqual(await run(),records);assert.equal(f.calls.at(-1)?.name,name);
    f.result([{...records[0],unexpected:'provider data'}]);await assert.rejects(run(),/Invalid or oversized/);
  }
  f.result(Array(101).fill(post));await assert.rejects(f.groups.listPosts(id),/Invalid or oversized/);
});
test('group writes transmit validated input and preserve optimistic concurrency',async()=>{
  const f=fixture();f.result(group);
  assert.deepEqual(await f.groups.saveGroup(group,null),group);
  assert.deepEqual(f.calls.at(-1),{name:'portal_save_group',parameters:{p_group:group,p_expected_revision:null}});
  f.result(session);assert.deepEqual(await f.groups.saveSession(session,id),session);
  assert.deepEqual(f.calls.at(-1),{name:'portal_save_group_session',parameters:{p_session:session,p_expected_revision:id}});
  f.result(null,{code:'40001',message:'PRIVATE SQL DETAILS'});
  await assert.rejects(f.groups.saveGroup(group,id),PortalConflict);
  f.result(null,{code:'42501',message:'PRIVATE SQL DETAILS'});
  await assert.rejects(f.groups.addPost(id,'Question'),error=>error instanceof Error&&!error.message.includes('PRIVATE SQL DETAILS')&&error.message.includes('permissions'));
});
test('group adapter rejects malformed commands before making an RPC',async()=>{
  const f=fixture();
  for(const run of [()=>f.groups.listSessions('bad'),()=>f.groups.saveGroup({...group,title:' '},null),
    ()=>f.groups.saveSession({...session,durationMinutes:0},null),()=>f.groups.addPost(id,'\u00a0'),
    ()=>f.groups.removePost(id,'bad'),()=>f.groups.revokeInvitation('bad',id),()=>f.groups.removeMember(id,'bad'),
    ()=>f.groups.requestTeacher({subject:'Help',message:''}),()=>f.groups.createPrivateRoom(id,'',''),
    ()=>f.groups.acceptInvitation('bad')])await assert.rejects(run());
  assert.equal(f.calls.length,0);
});
test('group moderation, teaching requests and room creation use caller-bound RPCs',async()=>{
  const f=fixture();f.result(null);
  await f.groups.addPost(id,'Question');await f.groups.removePost(id,other);
  await f.groups.revokeInvitation(id,other);await f.groups.removeMember(id,other);
  await f.groups.requestTeacher({subject:request.subject,message:request.message});
  f.result({...group,kind:'private'});await f.groups.createPrivateRoom(id,'Private study','Practice together');
  assert.deepEqual(f.calls,[
    {name:'portal_add_group_post',parameters:{p_group_id:id,p_body:'Question'}},
    {name:'portal_remove_group_post',parameters:{p_group_id:id,p_id:other}},
    {name:'portal_revoke_group_invitation',parameters:{p_group_id:id,p_id:other}},
    {name:'portal_remove_group_member',parameters:{p_group_id:id,p_user_id:other}},
    {name:'portal_request_teacher',parameters:{p_request:{subject:request.subject,message:request.message}}},
    {name:'portal_create_private_room',parameters:{p_request_id:id,p_title:'Private study',p_description:'Practice together'}},
  ]);
  assert.equal(JSON.stringify(f.calls).includes('learnerId'),false);
});
test('invitations require configured email delivery and never silently simulate sending',async()=>{
  const f=fixture();await assert.rejects(f.groups.inviteLearner(id,'learner@example.org'),/not configured/);assert.equal(f.calls.length,0);
  const sent:unknown[]=[];
  const groups=supabaseGroupWorkspace({async rpc(){return {data:group,error:null};}},{async inviteLearner(groupId,email){sent.push({groupId,email});return invite;}});
  assert.deepEqual(await groups.inviteLearner(id,'learner@example.org'),invite);
  assert.deepEqual(sent,[{groupId:id,email:'learner@example.org'}]);
  assert.deepEqual(await groups.acceptInvitation('a'.repeat(64)),group);
  assert.equal(supabaseGroupWorkspace,rpcGroupWorkspace);
});
