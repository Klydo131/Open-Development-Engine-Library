import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPortal} from '../apps/web/src/portal-demo.ts';
import type {Course} from '../packages/portal/src/index.ts';

const originalCourse=():Course=>({id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'A teacher-created course',summary:'Notice and explain one idea.',language:'en',status:'draft',lessons:[{id:crypto.randomUUID(),title:'Observe',text:'Choose an example. Describe it in your own words.',sourceUrl:'',credit:'Original author',rights:'CC BY 4.0'}]});

test('demo is visibly identified and never accepts email credentials or recovery',async()=>{
  const portal=createDemoPortal();
  assert.equal(portal.kind,'demo');
  assert.deepEqual(await portal.account(),{user:null,recovery:false});
  for(const action of [()=>portal.signIn('test@example.org','a sufficiently long password'),()=>portal.signUp('test@example.org','a sufficiently long password'),()=>portal.requestPasswordReset('test@example.org'),()=>portal.updatePassword('a sufficiently long password')])await assert.rejects(action,/not configured/);
  assert.deepEqual(await portal.account(),{user:null,recovery:false});
});

test('demo has original public samples, detached account/catalog snapshots and no persistence',async()=>{
  const portal=createDemoPortal(),first=await portal.listCourses();
  assert.equal(first.length,2);assert.ok(first.every(course=>course.status==='published'));
  assert.equal(first[0].title,'Notice motion');assert.equal(first[1].title,'Find a steady pulse');assert.ok(first.every(course=>course.lessons.length===0));
  portal.setDemoRole('learner');const materials=await portal.listCourses();
  assert.ok(materials.flatMap(course=>course.lessons).every(lesson=>lesson.rights.includes('Original Open Learning Rooms sample')));
  (first[0] as {title:string}).title='Mutated caller';
  assert.equal((await portal.listCourses())[0].title,'Notice motion');
  const account=await portal.account();
  (account.user as {role:string}).role='admin';
  assert.equal((await portal.account()).user?.role,'learner');
  assert.equal((await createDemoPortal().account()).user,null);
});

test('demo account listeners can unsubscribe and sign-out drops the simulated identity',async()=>{
  const portal=createDemoPortal();let count=0;const unsubscribe=portal.onAccountChange(()=>count++);
  portal.setDemoRole('learner');assert.equal(count,1);
  const learner=(await portal.account()).user;
  portal.setDemoRole('admin');assert.equal(count,2);assert.notEqual((await portal.account()).user?.id,learner?.id);
  portal.setDemoRole('learner');assert.equal((await portal.account()).user?.id,learner?.id);
  unsubscribe();await portal.signOut();assert.equal(count,3);assert.equal((await portal.account()).user,null);
});

test('demo denies anonymous and learner course writes even when they request published status',async()=>{
  const portal=createDemoPortal(),course=originalCourse();
  await assert.rejects(()=>portal.saveCourse(course,null),/preview first/);
  portal.setDemoRole('learner');
  await assert.rejects(()=>portal.saveCourse({...course,status:'published'},null),/Only an assigned admin/);
  assert.equal((await portal.listCourses()).length,2);
});

test('admin can draft, publish and update with revision compare-and-swap; learners never see drafts',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('admin');
  const draft=await portal.saveCourse(originalCourse(),null);
  assert.notEqual(draft.revision,originalCourse().revision);
  assert.equal((await portal.listCourses()).length,3);
  portal.setDemoRole('learner');assert.equal((await portal.listCourses()).length,2);
  portal.setDemoRole('admin');const published=await portal.saveCourse({...draft,status:'published'},draft.revision);
  assert.notEqual(published.revision,draft.revision);
  await assert.rejects(()=>portal.saveCourse({...draft,title:'Stale edit'},draft.revision),/changed elsewhere/);
  await assert.rejects(()=>portal.saveCourse(published,null),/changed elsewhere/);
  await assert.rejects(()=>portal.saveCourse(originalCourse(),crypto.randomUUID()),/changed elsewhere/);
  portal.setDemoRole('learner');assert.equal((await portal.listCourses()).find(course=>course.id===draft.id)?.title,draft.title);
});

test('published demo courses require material text, credit and rights; malformed content cannot be saved',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('admin');const course=originalCourse();
  for(const lessons of [[],[{...course.lessons[0],text:''}],[{...course.lessons[0],credit:''}],[{...course.lessons[0],rights:''}]])await assert.rejects(()=>portal.saveCourse({...course,status:'published',lessons},null),/before publishing/);
  await assert.rejects(()=>portal.saveCourse({...course,lessons:[{...course.lessons[0],sourceUrl:'javascript:alert(1)'}]},null),/Invalid/);
  await assert.rejects(()=>portal.saveCourse({...course,title:'x'.repeat(161)},null),/Invalid/);
  assert.equal((await portal.listCourses()).length,2);
  const linked=await portal.saveCourse({...course,status:'published',lessons:[{...course.lessons[0],text:'',sourceUrl:'https://example.org/lesson'}]},null);
  assert.equal(linked.lessons[0].sourceUrl,'https://example.org/lesson');
});

test('support accepts only explicit learner text and protects snapshots and role boundaries',async()=>{
  const portal=createDemoPortal();
  await assert.rejects(()=>portal.getSupport(),/preview first/);
  await assert.rejects(()=>portal.askSupport({subject:'Question',message:'Help'}),/preview first/);
  portal.setDemoRole('admin');await assert.rejects(()=>portal.askSupport({subject:'Question',message:'Help'}),/learner preview/);
  portal.setDemoRole('learner');const course=(await portal.listCourses())[0];
  await portal.askSupport({courseId:course.id,subject:'A selected question',message:'I chose to share only this text.'});
  const own=await portal.getSupport();assert.equal(own.length,1);assert.equal(own[0].learnerId,(await portal.account()).user?.id);
  assert.deepEqual(Object.keys(own[0]).sort(),['courseId','id','learnerId','message','reply','revision','status','subject']);
  (own[0] as {message:string;learnerId:string}).message='Caller mutation';
  (own[0] as {message:string;learnerId:string}).learnerId=crypto.randomUUID();
  assert.equal((await portal.getSupport())[0].message,'I chose to share only this text.');
  await assert.rejects(()=>portal.replySupport(own[0].id,'Unassigned reply',own[0].revision),/Only an assigned admin/);
  await portal.signOut();await assert.rejects(()=>portal.getSupport(),/preview first/);
  portal.setDemoRole('admin');assert.equal((await portal.getSupport())[0].subject,'A selected question');
});

test('demo support validates selected course, unknown fields and bounded messages',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('admin');const draft=await portal.saveCourse(originalCourse(),null);
  portal.setDemoRole('learner');
  for(const courseId of [draft.id,crypto.randomUUID()])await assert.rejects(()=>portal.askSupport({courseId,subject:'Question',message:'Help'}),/available published/);
  await assert.rejects(()=>portal.askSupport({subject:'Question',message:'x'.repeat(5001)}),/Invalid/);
  await assert.rejects(()=>portal.askSupport({subject:'',message:'Help'}),/Invalid/);
  await assert.rejects(()=>portal.askSupport({subject:'Question',message:'Help',journal:'PRIVATE'} as unknown as {subject:string;message:string}),/Invalid/);
  assert.equal((await portal.getSupport()).length,0);
});

test('admin replies use current request revision; answer snapshots survive stale or invalid updates',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('learner');await portal.askSupport({subject:'Question',message:'I need help.'});
  const initial=(await portal.getSupport())[0];portal.setDemoRole('admin');
  await portal.replySupport(initial.id,'Try naming one observation.',initial.revision);
  const answer=(await portal.getSupport())[0];assert.equal(answer.status,'answered');assert.notEqual(answer.revision,initial.revision);
  await assert.rejects(()=>portal.replySupport(initial.id,'Stale answer',initial.revision),/changed elsewhere/);
  await assert.rejects(()=>portal.replySupport(initial.id,'x'.repeat(5001),answer.revision),/Invalid/);
  await assert.rejects(()=>portal.replySupport(crypto.randomUUID(),'Unknown',answer.revision),/changed elsewhere/);
  portal.setDemoRole('learner');assert.equal((await portal.getSupport())[0].reply,'Try naming one observation.');
  const detached=(await portal.getSupport())[0] as unknown as {reply:string};detached.reply='Mutation';
  assert.equal((await portal.getSupport())[0].reply,'Try naming one observation.');
});

test('demo support is bounded at one hundred requests and fresh demos contain no prior message',async()=>{
  const portal=createDemoPortal();portal.setDemoRole('learner');
  for(let i=0;i<100;i++)await portal.askSupport({subject:`Question ${i}`,message:'Selected message'});
  await assert.rejects(()=>portal.askSupport({subject:'Extra',message:'Selected message'}),/up to 100/);
  const clean=createDemoPortal();clean.setDemoRole('learner');assert.deepEqual(await clean.getSupport(),[]);
});
