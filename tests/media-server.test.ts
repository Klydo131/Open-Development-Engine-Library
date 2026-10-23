import test from 'node:test';
import assert from 'node:assert/strict';
import {createLibraryMediaHandler} from '../examples/http/library-media.ts';
import {createPostgresMediaStore} from '../examples/postgres/media-store.ts';
import {describePortalMedia, MEDIA_LIMITS, type PortalMedia} from '../packages/portal/src/media.ts';

const admin = {id:'10000000-0000-0000-0000-000000000001',role:'admin' as const};
const learner = {...admin,role:'learner' as const};
const bytes = new TextEncoder().encode('%PDF-1.7\nOriginal lesson');
const portalUrl = 'https://library.example.org';
function upload(body: BodyInit = bytes, headers: Record<string,string> = {}) {
  return new Request('https://media.example.org/',{method:'POST',headers:{origin:portalUrl,'content-type':'application/octet-stream','x-file-name':encodeURIComponent('lesson.pdf'),...headers},body});
}
function fixture(user: typeof admin | typeof learner | null = admin, scan?: (bytes: Uint8Array,name:string)=>Promise<'clean'|'blocked'|'unavailable'>) {
  const stored = new Map<string,{media:PortalMedia;bytes:Uint8Array}>();
  const store = {async put(_actor:string,media:PortalMedia,data:Uint8Array){stored.set(media.id,{media,bytes:new Uint8Array(data)});},async get(_actor:string,id:string){return stored.get(id)??null;}};
  return {stored,store,handler:createLibraryMediaHandler({portalUrl,authenticate:async()=>user,store,scan})};
}
test('anonymous and learner uploads are denied before reading the body',async()=>{
  for(const [user,status] of [[null,401],[learner,403]] as const){
    let read = false;
    const request = upload();
    Object.defineProperty(request,'body',{get(){read=true;throw new Error('Must not read unauthorized bytes.');}});
    assert.equal((await fixture(user,async()=> 'clean').handler(request)).status,status);
    assert.equal(read,false);
  }
});
test('uploads fail closed unless an actual scanner reports clean',async()=>{
  for(const [scan,status] of [[undefined,503],[async()=> 'blocked' as const,422],[async()=> 'unavailable' as const,503],[async()=>{throw new Error('private scanner details');},503]] as const){
    const {handler,stored}=fixture(admin,scan);
    const response=await handler(upload());
    assert.equal(response.status,status);assert.equal(stored.size,0);
    assert.equal((await response.text()).includes('private scanner details'),false);
  }
});
test('clean uploads and downloads use private attachment responses and exact metadata',async()=>{
  const {handler,stored}=fixture(admin,async(data,name)=>{assert.deepEqual(data,bytes);assert.equal(name,'lesson.pdf');return 'clean';});
  const response=await handler(upload());assert.equal(response.status,201);
  const media=await response.json() as PortalMedia;assert.deepEqual(media,await describePortalMedia('lesson.pdf',bytes,media.id));assert.equal(stored.size,1);
  const download=await handler(new Request('https://media.example.org/',{headers:{origin:portalUrl,'x-media-id':media.id}}));
  assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/octet-stream');
  assert.equal(download.headers.get('cache-control'),'no-store');assert.equal(download.headers.get('x-content-type-options'),'nosniff');
  assert.match(download.headers.get('content-disposition')!,/^attachment; filename\*=UTF-8''lesson.pdf$/u);
  assert.deepEqual(JSON.parse(decodeURIComponent(download.headers.get('x-library-media')!)),media);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),bytes);
});
test('CORS permits only the configured portal origin including media metadata headers',async()=>{
  const {handler}=fixture(admin,async()=> 'clean');
  const response=await handler(new Request('https://media.example.org/',{method:'OPTIONS',headers:{origin:portalUrl}}));
  assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),portalUrl);
  for(const header of ['authorization','apikey','content-type','x-client-info','x-file-name','x-media-id'])assert.ok(response.headers.get('access-control-allow-headers')!.includes(header));
  assert.equal(response.headers.get('access-control-expose-headers'),'X-Library-Media');
  const denied=await handler(upload(bytes,{origin:'https://unrelated.example.org'}));
  assert.equal(denied.status,403);assert.equal(denied.headers.has('access-control-allow-origin'),false);
});
test('actual upload stream limit is checked before copying an oversized chunk',async()=>{
  const {handler,stored}=fixture(admin,async()=> 'clean');
  let canceled=false;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(MEDIA_LIMITS.fileBytes+1));},cancel(){canceled=true;return new Promise(()=>{});}});
  const request=new Request('https://media.example.org/',{method:'POST',headers:{'content-type':'application/octet-stream','x-file-name':'lesson.pdf'},body:stream,duplex:'half'} as RequestInit);
  assert.equal((await handler(request)).status,413);assert.equal(stored.size,0);assert.equal(canceled,true);
});
test('a stalled body has a total deadline and uncooperative cancellation cannot block it',async()=>{
  let canceled=false;
  const stream=new ReadableStream<Uint8Array>({pull(){return new Promise(()=>{});},cancel(){canceled=true;return new Promise(()=>{});}});
  const handler=createLibraryMediaHandler({portalUrl,authenticate:async()=>admin,store:fixture().store,scan:async()=> 'clean',bodyTimeoutMs:10});
  const request=new Request('https://media.example.org/',{method:'POST',headers:{'content-type':'application/octet-stream','x-file-name':'lesson.pdf'},body:stream,duplex:'half'} as RequestInit);
  const response=await handler(request);assert.equal(response.status,408);assert.equal(canceled,true);
});
test('immediately resolved empty chunks cannot starve the body deadline',async()=>{
  let canceled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(0));},cancel(){canceled=true;}});
  const handler=createLibraryMediaHandler({portalUrl,authenticate:async()=>admin,store:fixture().store,scan:async()=> 'clean',bodyTimeoutMs:10});
  const request=new Request('https://media.example.org/',{method:'POST',headers:{'content-type':'application/octet-stream','x-file-name':'lesson.pdf'},body:stream,duplex:'half'} as RequestInit);
  assert.equal((await handler(request)).status,408);assert.equal(canceled,true);
});
test('scanner deadline rejects a scanner that never settles',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let entered!:()=>void;
  const scanning=new Promise<void>(resolve=>{entered=resolve;});
  const handler=createLibraryMediaHandler({portalUrl,authenticate:async()=>admin,store:fixture().store,scan:()=>{entered();return new Promise(()=>{});}});
  const pending=handler(upload());
  await scanning;
  t.mock.timers.tick(15000);
  assert.equal((await pending).status,503);
  t.mock.timers.reset();
});
test('scanner byte mutation cannot alter the stored original and completed timers stay cleared',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let canceled=false;
  const {handler,stored}=fixture(admin,async scanned=>{scanned.fill(0);return 'clean';});
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(bytes));controller.close();},cancel(){canceled=true;}});
  const request=new Request('https://media.example.org/',{method:'POST',headers:{'content-type':'application/octet-stream','x-file-name':'lesson.pdf'},body:stream,duplex:'half'} as RequestInit);
  const response=await handler(request);assert.equal(response.status,201);
  const result=await response.json() as PortalMedia;
  assert.deepEqual(stored.get(result.id)?.bytes,bytes);
  t.mock.timers.tick(20000);assert.equal(canceled,false);assert.equal(stored.size,1);
  t.mock.timers.reset();
});
test('download identity, byte integrity and backend errors fail closed',async()=>{
  const media=await describePortalMedia('lesson.pdf',bytes);
  const request=()=>new Request('https://media.example.org/',{headers:{'x-media-id':media.id}});
  assert.equal((await fixture(null).handler(request())).status,401);
  assert.equal((await fixture().handler(request())).status,404);
  for(const data of [{media:{...media,sha256:'0'.repeat(64)},bytes},{media,bytes:new Uint8Array([1])},{media:{...media,id:crypto.randomUUID()},bytes}]){
    const handler=createLibraryMediaHandler({portalUrl,authenticate:async()=>admin,store:{...fixture().store,async get(){return data;}}});
    const response=await handler(request());assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const handler=createLibraryMediaHandler({portalUrl,authenticate:async()=>admin,store:{...fixture().store,async get(){throw new Error('secret database password');}}});
  assert.equal((await (await handler(request())).text()).includes('password'),false);
});
test('invalid file names, signatures, metadata and backend failures return safe errors',async()=>{
  const {handler}=fixture(admin,async()=> 'clean');
  for(const request of [upload(bytes,{'x-file-name':'%zz'}),upload(bytes,{'x-file-name':encodeURIComponent('../lesson.pdf')}),upload(new TextEncoder().encode('script'))]){
    assert.equal((await handler(request)).status,400);
  }
  const broken=createLibraryMediaHandler({portalUrl,authenticate:async()=>{throw new Error('secret bearer token');},store:fixture().store});
  const response=await broken(upload());assert.equal(response.status,503);assert.equal((await response.text()).includes('secret bearer'),false);
});
test('PostgreSQL adapter validates byte and metadata integrity in both directions',async()=>{
  const media=await describePortalMedia('lesson.pdf',bytes);
  let calls=0;
  const store=createPostgresMediaStore({async query(sql,values){calls++;assert.equal(values[0],admin.id);return sql.includes('get_media')?{rows:[{media,bytes}]}:{rows:[]};}});
  await store.put(admin.id,media,bytes);assert.deepEqual(await store.get(admin.id,media.id),{media,bytes});assert.equal(calls,2);
  await assert.rejects(store.put(admin.id,{...media,sha256:'0'.repeat(64)},bytes),/Invalid media/u);assert.equal(calls,2);
  const forged=createPostgresMediaStore({async query(){return {rows:[{media,bytes:new Uint8Array([1])}]};}});
  await assert.rejects(forged.get(admin.id,media.id),/Invalid media/u);
});
