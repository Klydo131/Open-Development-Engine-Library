import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,emptyLibrary,fromBase64,inspectFile,MAX_FILE_BYTES,recommend,safeURL,seal,startPractice,toBase64,unseal,validateEnvelope,validateLibrary,type Lesson} from '../packages/core/src/index.ts';
const lesson:Lesson={id:'one',title:'Physics and motion',kind:'note',url:'',tags:['Physics'],notes:'Observe a rolling ball.',question:'What changes motion?',answer:'A net force.',learned:true,createdAt:'2026-09-14T00:00:00Z'};
test('encrypted vault round trip includes Unicode, files, notes and plans without plaintext',async()=>{
  const library=emptyLibrary();library.lessons=[{...lesson,title:'Physics 物理 علم',attachment:undefined}];library.practices=[startPractice(recommend(library)[0],'practice')];
  const key=await createSession('a long test passphrase');const encrypted=await seal(library,key);const twice=await seal(library,key);
  assert.notEqual(encrypted.iv,twice.iv);assert.notEqual(encrypted.ciphertext,twice.ciphertext);
  assert.equal(JSON.stringify(encrypted).includes('Physics'),false);assert.equal(key.key.extractable,false);
  const opened=await unseal(encrypted,'a long test passphrase');assert.deepEqual(opened.library,JSON.parse(JSON.stringify(library)));
  await assert.rejects(()=>unseal(encrypted,'wrong password'),/Could not unlock/);
  const bytes=fromBase64(encrypted.ciphertext);bytes[0]^=1;
  await assert.rejects(()=>unseal({...encrypted,ciphertext:toBase64(bytes)},'a long test passphrase'),/Could not unlock/);
});
test('envelopes reject unsupported and excessive KDF work before derivation',()=>{
  assert.throws(()=>validateEnvelope({iterations:9999999999}),/Unsupported/);
});
test('unsafe URL schemes and credentials cannot become source links',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','file:///secret','https://user:pass@example.com'])assert.throws(()=>safeURL(url));
  assert.equal(safeURL(' https://example.org/test?q=learning '),'https://example.org/test?q=learning');
});
test('file signatures, extension mismatch, unsupported active files and size bounds',()=>{
  const pdf=new TextEncoder().encode('%PDF-1.7\n%%EOF');
  assert.deepEqual(inspectFile('physics.pdf',pdf),{kind:'pdf',mime:'application/pdf'});
  assert.throws(()=>inspectFile('physics.exe',pdf));assert.throws(()=>inspectFile('fake.pdf',new TextEncoder().encode('<script>evil</script>')));
  assert.throws(()=>inspectFile('large.pdf',new Uint8Array(MAX_FILE_BYTES+1)));
  assert.deepEqual(inspectFile('lesson.wav',new TextEncoder().encode('RIFF0000WAVEfmt ')),{kind:'audio',mime:'audio/wav'});
});
test('malformed restored lessons, missing files, duplicate IDs and dangling practices fail closed',()=>{
  const library={...emptyLibrary(),lessons:[lesson]};
  assert.throws(()=>validateLibrary({...library,lessons:[lesson,lesson]}));
  assert.throws(()=>validateLibrary({...library,lessons:[{...lesson,kind:'pdf'}]}));
  assert.throws(()=>validateLibrary({...library,lessons:[{...lesson,tags:[1]}]}));
  assert.throws(()=>validateLibrary({...library,practices:[{id:'p',lessonId:'missing',title:'Plan',steps:['a'],completed:[false],reflection:''}]}));
  assert.throws(()=>validateLibrary({...library,lessons:[{...lesson,kind:'link',url:'javascript:alert(1)'}]}));
});
test('only lesson text drives recommendations; URLs and identity-shaped extras are excluded',()=>{
  const library={...emptyLibrary(),lessons:[{...lesson,title:'An idea',tags:[],notes:'',url:'https://example.org/music',email:'piano@example.org'}]};
  const result=recommend(library);assert.equal(result[0].category,'Make it your own');
  assert.equal(recommend({...library,recommendations:false}).length,0);
  assert.equal(recommend({...library,practices:[startPractice(result[0],'p')]}).length,0);
  assert.equal('email' in validateLibrary(library).lessons[0],false);
});
test('suggestions do not mutate the library; decisions remain reversible',()=>{
  const library={...emptyLibrary(),lessons:[lesson]};const before=JSON.stringify(library);
  const result=recommend(library);assert.equal(result[0].category,'Test an idea');assert.equal(JSON.stringify(library),before);
  const practice=startPractice(result[0],'p');practice.steps[0]='Edited';assert.notEqual(result[0].steps[0],'Edited');
});
test('short passphrases are rejected',async()=>{await assert.rejects(()=>createSession('short'),/12 and 512/);});
