import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCourse, validateCourseList, validateSupportThread, validateSupportQuestion, portalSourceUrl, portalPassword, portalEmail, type Course} from '../packages/portal/src/index.ts';
const id = '20000000-0000-0000-0000-000000000001';
const revision = '40000000-0000-0000-0000-000000000001';
const materialId = '30000000-0000-0000-0000-000000000001';
const course = (): Course => ({id,revision,title:'Try an experiment',summary:'A small original learning task.',language:'en',status:'published',lessons:[{id:materialId,title:'First task',text:'Try, explain, then check.',sourceUrl:'https://example.org',credit:'Original author',rights:'CC BY 4.0'}]});
test('course validator creates detached immutable text-only snapshots', () => {
  const input = structuredClone(course()) as {lessons: {text: string}[]} & Course;
  const result = validateCourse(input);
  input.lessons[0].text = 'Changed after save';
  assert.equal(result.lessons[0].text,'Try, explain, then check.');
  assert.equal(result.lessons[0].sourceUrl,'https://example.org/');
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.lessons)); assert.ok(Object.isFrozen(result.lessons[0]));
});
test('course validator rejects additional private fields, duplicate lessons and invalid IDs', () => {
  assert.throws(()=>validateCourse({...course(),privateJournal:'SECRET'}));
  assert.throws(()=>validateCourse({...course(),id:`${id}\n`}));
  assert.throws(()=>validateCourse({...course(),revision:'{'+revision+'}'}));
  assert.throws(()=>validateCourse({...course(),lessons:[course().lessons[0],course().lessons[0]]}));
  assert.throws(()=>validateCourse({...course(),lessons:[{...course().lessons[0],privateFiles:[]}]}));
});
test('course content has bounded bytes, lesson counts, titles and language tags', () => {
  assert.throws(()=>validateCourse({...course(),title:'x'.repeat(161)}));
  assert.throws(()=>validateCourse({...course(),language:'en\n'}));
  assert.throws(()=>validateCourse({...course(),language:'<script>'}));
  assert.throws(()=>validateCourse({...course(),lessons:[{...course().lessons[0],text:'x'.repeat(20001)}]}));
  const lessons = Array.from({length:15},(_,i)=>({...course().lessons[0],id:`30000000-0000-0000-0000-${String(i).padStart(12,'0')}`,text:'x'.repeat(20000)}));
  assert.throws(()=>validateCourse({...course(),lessons}));
  assert.throws(()=>validateCourseList(Array.from({length:101},()=>course())));
  assert.throws(()=>validateCourseList([course(),course()]));
});
test('external material links allow only credential-free HTTP(S) URLs', () => {
  assert.equal(portalSourceUrl(''),'');
  assert.equal(portalSourceUrl('https://example.org'),'https://example.org/');
  for (const url of ['javascript:alert(1)','data:text/html,secret','file:///tmp/private','https://u:p@example.org/','https://example.org/\n',' https://example.org/','https://example.org/hello world']) assert.throws(()=>portalSourceUrl(url));
});
test('account validators support paste and long passwords without identity metadata', () => {
  assert.equal(portalEmail(' learner@example.org '),'learner@example.org');
  assert.equal(portalPassword('A phrase with spaces and unicode 音楽'),'A phrase with spaces and unicode 音楽');
  assert.throws(()=>portalEmail('learner@example.org\nBcc:secret@example.org'));
  assert.throws(()=>portalPassword('short'));
  assert.throws(()=>portalPassword('x'.repeat(129)));
});
test('support requests cannot choose their owner or inject extra private data', () => {
  assert.deepEqual(validateSupportQuestion({courseId:id,subject:'First question',message:'How can I practice?'}),{courseId:id,subject:'First question',message:'How can I practice?'});
  assert.throws(()=>validateSupportQuestion({subject:'Question',message:'Text',learnerId:id}));
  assert.throws(()=>validateSupportQuestion({subject:'Question',message:'x'.repeat(5001)}));
  const thread={id,learnerId:materialId,subject:'Question',message:'Text',reply:'',status:'open',revision};
  assert.ok(Object.isFrozen(validateSupportThread(thread)));
  assert.throws(()=>validateSupportThread({...thread,status:'answered'}));
  assert.throws(()=>validateSupportThread({...thread,email:'private@example.org'}));
});
