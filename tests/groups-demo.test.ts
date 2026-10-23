import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoGroups} from '../apps/web/src/portal-demo-groups.ts';
import {createDemoPortal} from '../apps/web/src/portal-demo.ts';
import {PortalConflict,type PortalUser,type StudyGroup} from '../packages/portal/src/index.ts';
const learner:PortalUser={id:'10000000-0000-0000-0000-000000000001',email:'learner@example.invalid',role:'learner'};
const admin:PortalUser={id:'10000000-0000-0000-0000-000000000002',email:'admin@example.invalid',role:'admin'};
const outsider:PortalUser={id:'10000000-0000-0000-0000-000000000003',email:'outsider@example.invalid',role:'learner'};
const otherAdmin:PortalUser={id:'10000000-0000-0000-0000-000000000004',email:'another-admin@example.invalid',role:'admin'};

test('removing the final demo membership removes published lesson access on the next read',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('learner');
  const learnerId=(await portal.account()).user!.id;assert.ok((await portal.listCourses()).some(course=>course.lessons.length));
  portal.setDemoRole('admin');const groups=await portal.groups!.listGroups();
  for(const group of groups)await portal.groups!.removeMember(group.id,learnerId);
  portal.setDemoRole('learner');assert.deepEqual(await portal.groups!.listGroups(),[]);
  assert.ok((await portal.listCourses()).every(course=>!course.lessons.length));
});
function setup(){let account:PortalUser|null=learner;let time=Date.parse('2026-10-22T00:00:00Z');const demo=createDemoGroups(()=>{if(!account)throw new Error('Sign in first.');return account;},{learnerId:learner.id,adminId:admin.id,now:()=>time});return {...demo,use(value:PortalUser|null){account=value;},advance(ms:number){time+=ms;}};}
function draft(owner=admin.id):StudyGroup{return {id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'A new study group',description:'',kind:'group',facilitatorId:owner};}
test('group membership filters discussion access and learners cannot administer groups or rosters',async()=>{
  const demo=setup(),api=demo.workspace,[group]=await api.listGroups();
  await api.addPost(group.id,'My first observation.');assert.equal((await api.listPosts(group.id))[0].authorId,learner.id);
  await assert.rejects(api.saveGroup(draft(),null));await assert.rejects(api.listMembers(group.id));await assert.rejects(api.inviteLearner(group.id,outsider.email));
  demo.use(outsider);assert.deepEqual(await api.listGroups(),[]);await assert.rejects(api.listPosts(group.id));await assert.rejects(api.addPost(group.id,'Cannot post here.'));
  demo.use(admin);assert.equal((await api.listMembers(group.id))[0].userId,learner.id);await api.removeMember(group.id,learner.id);
  demo.use(learner);assert.deepEqual(await api.listGroups(),[]);await assert.rejects(api.listSessions(group.id));await assert.rejects(api.listPosts(group.id));
  demo.use(null);await assert.rejects(api.listGroups());
});
test('administrators save schedules with optimistic revisions and cannot move sessions across groups',async()=>{
  const demo=setup(),api=demo.workspace;demo.use(admin);const [group]=await api.listGroups();
  const created=await api.saveGroup(draft(),null);assert.notEqual(created.revision,group.revision);
  await assert.rejects(api.saveGroup({...created,title:'Wrong revision'},group.revision),PortalConflict);
  const updated=await api.saveGroup({...created,title:'Revised title'},created.revision);assert.equal(updated.title,'Revised title');
  const [session]=await api.listSessions(group.id);await assert.rejects(api.saveSession({...session,title:'Stale'},created.revision),PortalConflict);
  await assert.rejects(api.saveSession({...session,groupId:created.id},session.revision));
  const next=await api.saveSession({...session,title:'Read, question, practice'},session.revision);assert.notEqual(next.revision,session.revision);
  demo.use(learner);await assert.rejects(api.saveSession({...session,title:'Learner overwrite'},session.revision));
});
test('simulated invitations are email-bound, expire, revoke and can be accepted only once',async()=>{
  const demo=setup(),api=demo.workspace;demo.use(admin);const [group]=await api.listGroups();
  const invitation=await api.inviteLearner(group.id,outsider.email),preview=demo.previewInvitation(invitation.id);assert.equal(preview.email,outsider.email);assert.ok(!('token'in invitation));assert.match(preview.token,/^[a-f0-9]{64}$/u);
  await assert.rejects(api.inviteLearner(group.id,outsider.email));
  demo.use(learner);assert.throws(()=>demo.previewInvitation(invitation.id));await assert.rejects(api.acceptInvitation(preview.token));
  demo.use(outsider);assert.equal((await api.acceptInvitation(preview.token)).id,group.id);await assert.rejects(api.acceptInvitation(preview.token));
  await api.addPost(group.id,'I joined from my invitation.');
  demo.use(admin);assert.equal((await api.listInvitations(group.id))[0].status,'accepted');
  const revoked=await api.inviteLearner(group.id,'revoked@example.invalid'),revokedToken=demo.previewInvitation(revoked.id).token;await api.revokeInvitation(group.id,revoked.id);
  demo.use({...outsider,email:revoked.email});await assert.rejects(api.acceptInvitation(revokedToken));
  demo.use(admin);const expired=await api.inviteLearner(group.id,'expired@example.invalid'),expiredToken=demo.previewInvitation(expired.id).token;demo.advance(7*86400000);
  demo.use({...outsider,email:expired.email});await assert.rejects(api.acceptInvitation(expiredToken));
  demo.use(admin);await assert.rejects(api.acceptInvitation(preview.token));
});
test('teacher requests create private rooms atomically for only their learner and assigned administrator',async()=>{
  const demo=setup(),api=demo.workspace;await api.requestTeacher({subject:'Music practice',message:'Can someone help with counting?'});const [request]=await api.listTeacherRequests();
  demo.use(outsider);assert.deepEqual(await api.listTeacherRequests(),[]);await assert.rejects(api.createPrivateRoom(request.id,'Private help',''));
  demo.use(admin);await assert.rejects(api.createPrivateRoom(request.id,' ',''));assert.equal((await api.listTeacherRequests())[0].status,'open');assert.equal((await api.listGroups()).length,1);
  const room=await api.createPrivateRoom(request.id,'Practice with a teacher','A private study space.');assert.equal(room.kind,'private');assert.equal(room.facilitatorId,admin.id);
  assert.equal((await api.listMembers(room.id))[0].userId,learner.id);await assert.rejects(api.createPrivateRoom(request.id,'Duplicate room',''));
  await api.addPost(room.id,'Let us start with one question.');await assert.rejects(api.inviteLearner(room.id,outsider.email));
  demo.use(otherAdmin);assert.ok(!(await api.listGroups()).some(v=>v.id===room.id));assert.deepEqual(await api.listTeacherRequests(),[]);await assert.rejects(api.listPosts(room.id));await assert.rejects(api.listMembers(room.id));await assert.rejects(api.saveGroup({...room,title:'Another admin edit'},room.revision));
  demo.use(outsider);await assert.rejects(api.listPosts(room.id));
  demo.use(learner);assert.equal((await api.listTeacherRequests())[0].roomId,room.id);assert.equal((await api.listPosts(room.id)).length,1);await api.addPost(room.id,'My private follow-up.');
  assert.ok((await api.listGroups()).some(v=>v.id===room.id));
  demo.use(admin);await assert.rejects(api.saveGroup({...room,kind:'group'},room.revision));await assert.rejects(api.saveGroup({...draft(),kind:'private'},null));
});
test('post deletion is limited to its author or an authorized administrator',async()=>{
  const demo=setup(),api=demo.workspace,[group]=await api.listGroups();await api.addPost(group.id,'Learner question');
  demo.use(admin);await api.addPost(group.id,'Admin answer');const [first,second]=await api.listPosts(group.id);
  demo.use(learner);await assert.rejects(api.removePost(group.id,second.id));await api.removePost(group.id,first.id);
  demo.use(admin);await api.removePost(group.id,second.id);assert.deepEqual(await api.listPosts(group.id),[]);
});
test('group API returns immutable snapshots and is attached only as an optional portal capability',async()=>{
  const demo=setup(),[group]=await demo.workspace.listGroups();assert.ok(Object.isFrozen(group));assert.ok(Object.isFrozen(await demo.workspace.listGroups()));
  const portal=createDemoPortal();assert.ok(portal.groups);await assert.rejects(portal.groups.listGroups());portal.setDemoRole('learner');assert.equal((await portal.groups.listGroups()).length,1);
  portal.setDemoRole(null);await assert.rejects(portal.groups.listGroups());
});
test('discussion limits reject oversized input and overflow without dropping previous posts',async()=>{
  const demo=setup(),api=demo.workspace,[group]=await api.listGroups();
  await assert.rejects(api.addPost(group.id,'x'.repeat(2001)));assert.deepEqual(await api.listPosts(group.id),[]);
  for(let i=0;i<100;i++)await api.addPost(group.id,`Observation ${i+1}`);
  await assert.rejects(api.addPost(group.id,'One too many'));const posts=await api.listPosts(group.id);
  assert.equal(posts.length,100);assert.equal(posts[0].body,'Observation 1');assert.equal(posts[99].body,'Observation 100');
});
