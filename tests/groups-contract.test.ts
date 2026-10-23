import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUP_LIMITS,groupInstant,validateStudyGroup,validateStudyGroupList,validateStudySession,validateGroupPost,validateGroupPostBody,validateGroupInvitation,validateGroupMemberList,validateTeacherRequest,validateTeacherRequestInput,validateCourse} from '../packages/portal/src/index.ts';
const id='10000000-0000-0000-0000-000000000001',revision='10000000-0000-0000-0000-000000000002';
const group=()=>({id,revision,title:'Study together',description:'An original discussion.',kind:'group' as const,facilitatorId:id});
test('group contracts reject unknown fields and produce detached immutable records',()=>{
  const input=group(),value=validateStudyGroup(input);input.title='Changed';assert.equal(value.title,'Study together');assert.ok(Object.isFrozen(value));
  assert.throws(()=>validateStudyGroup({...group(),privateJournal:'SECRET'}));
  assert.throws(()=>validateStudyGroup({...group(),title:' '}));
  assert.throws(()=>validateStudyGroup({...group(),kind:'public'}));
  assert.throws(()=>validateStudyGroup({...group(),facilitatorId:'arbitrary-account'}));
  assert.throws(()=>validateStudyGroupList([group(),group()]));
  assert.throws(()=>validateStudyGroupList(Array.from({length:GROUP_LIMITS.groups+1},()=>group())));
  assert.throws(()=>validateStudyGroup(Object.assign(Object.create(null),group())));
});
test('session contracts accept UTC instants and reject rollover, local timestamps and unbounded durations',()=>{
  const session={id,revision,groupId:id,title:'Practice',description:'',startsAt:'2026-10-23T05:00:00Z',durationMinutes:30};
  assert.equal(validateStudySession(session).startsAt,'2026-10-23T05:00:00.000Z');
  assert.equal(groupInstant('2028-02-29T00:00:00.1Z'),'2028-02-29T00:00:00.100Z');
  for(const startsAt of ['2026-02-29T00:00:00Z','2026-10-23T05:00:00+08:00','2026-10-23T05:00','2026-10-23T25:00:00Z','2026-10-23T05:00:00Z\n'])assert.throws(()=>validateStudySession({...session,startsAt}));
  for(const durationMinutes of [0,1.5,1441,NaN,'30'])assert.throws(()=>validateStudySession({...session,durationMinutes}));
});
test('discussion, invitation, membership and teacher-request boundaries cannot carry extra identity data',()=>{
  assert.equal(validateGroupPostBody('A question\nAnd an observation'),'A question\nAnd an observation');
  assert.throws(()=>validateGroupPostBody('x'.repeat(2001)));assert.throws(()=>validateGroupPostBody('\u0000bad'));assert.throws(()=>validateGroupPostBody(' '));
  const post={id,groupId:id,authorId:id,authorRole:'learner',body:'Question',createdAt:'2026-10-23T00:00:00Z'};
  assert.throws(()=>validateGroupPost({...post,authorRole:'teacher'}));assert.throws(()=>validateGroupPost({...post,email:'private@example.org'}));
  const invitation={id,groupId:id,email:'member@example.org',expiresAt:'2026-10-23T00:00:00Z',status:'pending'};
  assert.throws(()=>validateGroupInvitation({...invitation,token:'private-token'}));assert.throws(()=>validateGroupInvitation({...invitation,status:'expired'}));
  assert.throws(()=>validateGroupMemberList([{userId:id,email:'member@example.org'},{userId:id,email:'another@example.org'}]));
  const request={id,learnerId:id,subject:'Practice',message:'Can someone help?',status:'open'};
  assert.ok(Object.isFrozen(validateTeacherRequest(request)));assert.throws(()=>validateTeacherRequest({...request,roomId:id}));
  assert.throws(()=>validateTeacherRequest({...request,status:'assigned'}));assert.equal(validateTeacherRequest({...request,status:'assigned',roomId:id}).roomId,id);
  assert.throws(()=>validateTeacherRequestInput({subject:'Practice',message:'Help',learnerId:id}));
});
test('media type metadata is additive and preserves existing course records',()=>{
  const material={id,title:'Original text',text:'Read and practice.',sourceUrl:'',credit:'Author',rights:'CC BY 4.0'};
  const course={id,revision,title:'A lesson',summary:'Practice',language:'en',status:'published',lessons:[material]};
  assert.deepEqual(validateCourse(course).lessons[0],material);
  for(const mediaType of ['text','document','audio','video','link','image']as const)assert.equal(validateCourse({...course,lessons:[{...material,mediaType}]}).lessons[0].mediaType,mediaType);
  assert.throws(()=>validateCourse({...course,lessons:[{...material,mediaType:'executable'}]}));
  assert.throws(()=>validateCourse({...course,lessons:[{...material,mediaType:undefined}]}));
});
test('course attachments accept bounded metadata without retaining uploaded bytes or mutable references',()=>{
  const attachment={id,name:'Practice.pdf',mime:'application/pdf',size:64,sha256:'a'.repeat(64),mediaType:'document'};
  const lesson={id,title:'Practice',text:'',sourceUrl:'',credit:'Original author',rights:'CC BY 4.0',attachment};
  const course={id,revision,title:'A lesson',summary:'Practice',language:'en',status:'published',lessons:[lesson]};
  const checked=validateCourse(course);attachment.name='Changed.pdf';
  assert.equal(checked.lessons[0].attachment?.name,'Practice.pdf');assert.ok(Object.isFrozen(checked.lessons[0].attachment));
  assert.throws(()=>validateCourse({...course,lessons:[{...lesson,attachment:{...attachment,bytes:new Uint8Array([1])}}]}));
  assert.throws(()=>validateCourse({...course,lessons:[{...lesson,attachment:{...attachment,size:10*1024*1024+1}}]}));
  assert.throws(()=>validateCourse({...course,lessons:[{...lesson,attachment:{...attachment,mime:'text/html'}}]}));
});
