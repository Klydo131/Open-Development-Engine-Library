import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createLibraryMediaHandler,type LibraryMediaOptions} from '../examples/http/library-media.ts';

const actor={id:'10000000-0000-0000-0000-000000000001',role:'admin' as const};
const bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic original material');
const upload=(body:BodyInit=bytes)=>new Request('https://service.example/media',{method:'POST',headers:{'content-type':'application/octet-stream','x-file-name':'lesson.pdf'},body});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const store=()=>({async put(){},async get(){return null;}});
const options=(extra:Partial<LibraryMediaOptions>={}):LibraryMediaOptions=>({portalUrl:'https://library.example',authenticate:async()=>actor,store:store(),scan:async()=> 'clean',...extra});

test('upload admission rejects invalid concurrency and scan deadline configuration',()=>{
  for(const limit of [0,-1,1.5,17,NaN,Infinity])assert.throws(()=>createLibraryMediaHandler(options({maxConcurrentUploads:limit})),/concurrent/i);
  for(const deadline of [0,-1,1.5,15001,NaN,Infinity])assert.throws(()=>createLibraryMediaHandler(options({scanTimeoutMs:deadline})),/deadline/i);
});

test('default capacity retains timed-out scanner work and rejects new bodies until actual settlement',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});t.after(()=>t.mock.timers.reset());
  const started=[deferred<void>(),deferred<void>()],scans=[deferred<'clean'>(),deferred<'clean'>()];
  let calls=0,writes=0,touched=false;
  const handle=createLibraryMediaHandler(options({store:{...store(),async put(){writes++;}},scan:()=>{const index=calls++;if(index<2){started[index].resolve();return scans[index].promise;}return Promise.resolve('clean');}}));
  for(let index=0;index<2;index++){const pending=handle(upload());await started[index].promise;t.mock.timers.tick(15000);assert.equal((await pending).status,503);}
  const blocked=upload();Object.defineProperty(blocked,'body',{get(){touched=true;throw Error('A saturated handler must not inspect this body.');}});
  const response=await handle(blocked);
  assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'1');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(touched,false);assert.equal(calls,2);assert.equal(writes,0);
  scans[0].resolve('clean');await nextTurn();assert.equal(writes,0);
  assert.equal((await handle(upload())).status,201);assert.equal(calls,3);assert.equal(writes,1);
  scans[1].reject(Error('PRIVATE_SCANNER_ERROR'));await nextTurn();assert.equal(writes,1);
});

test('one shared upload limit covers different staff identities and waits for storage completion',async()=>{
  const storing=deferred<void>(),finish=deferred<void>();let writes=0;
  const handle=createLibraryMediaHandler(options({maxConcurrentUploads:1,authenticate:async request=>({...actor,id:request.headers.get('x-staff')??actor.id}),store:{...store(),async put(){if(++writes===1){storing.resolve();await finish.promise;}}}}));
  const first=handle(upload());await storing.promise;
  const second=upload();second.headers.set('x-staff','20000000-0000-0000-0000-000000000001');
  assert.equal((await handle(second)).status,503);assert.equal(writes,1);
  finish.resolve();assert.equal((await first).status,201);
  assert.equal((await handle(upload())).status,201);assert.equal(writes,2);
});

test('pre-scan rejection and scanner failure restore capacity without exposing callback errors',async()=>{
  let scans=0;
  const handle=createLibraryMediaHandler(options({maxConcurrentUploads:1,scan:async()=>{if(++scans===1)throw Error('PRIVATE_CALLBACK_DETAILS');return 'clean';}}));
  assert.equal((await handle(upload(new Uint8Array([1])))).status,400);
  const rejected=await handle(upload());assert.equal(rejected.status,503);assert.equal((await rejected.text()).includes('PRIVATE_CALLBACK'),false);
  assert.equal((await handle(upload())).status,201);assert.equal(scans,2);
});

test('a scanner returning clean after the monotonic deadline cannot persist an upload',async t=>{
  let clock=0,writes=0;t.mock.method(performance,'now',()=>clock);
  const handle=createLibraryMediaHandler(options({scanTimeoutMs:15,store:{...store(),async put(){writes++;}},scan:async()=>{clock=16;return 'clean';}}));
  assert.equal((await handle(upload())).status,503);assert.equal(writes,0);
});

test('scan saturation leaves authenticated downloads and preflight available',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});t.after(()=>t.mock.timers.reset());
  const started=deferred<void>(),scan=deferred<'clean'>();
  const handle=createLibraryMediaHandler(options({maxConcurrentUploads:1,scan:()=>{started.resolve();return scan.promise;}}));
  const pending=handle(upload());await started.promise;
  const get=new Request('https://service.example/media',{headers:{'x-media-id':actor.id}});
  assert.equal((await handle(get)).status,404);
  assert.equal((await handle(new Request('https://service.example/media',{method:'OPTIONS'}))).status,204);
  t.mock.timers.tick(15000);assert.equal((await pending).status,503);scan.resolve('clean');await nextTurn();
});
