import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createCatalog,createSession,sealCatalog,MemoryCatalogStore,type CatalogStore} from '../packages/core/src/index.ts';
import {createIndexedDBCatalogStore,localStore} from '../apps/web/src/storage.ts';
import {emptyLibrary,seal} from '../packages/core/src/index.ts';
import {openLearningVault,sealLearningVault} from '../apps/web/src/learning-vault.ts';
const session=await createSession('synthetic adapter test passphrase');
const envelope=()=>sealCatalog({catalog:createCatalog(),content:new Map()},session);
for(const [name,factory] of [['memory',()=>new MemoryCatalogStore()],['indexeddb',()=>createIndexedDBCatalogStore(`test-${crypto.randomUUID()}`)]] as const){
 test(`${name}: atomic create, detached reads and conditional replacement/removal`,async()=>{
  const store:CatalogStore=factory();const first=await envelope();assert.equal(await store.read(),null);await store.write(first,null);
  const copy=(await store.read())!;copy.ciphertext='changed';assert.equal((await store.read())!.ciphertext,first.ciphertext);
  await assert.rejects(()=>store.write(awaitable(first),null));const next=await envelope();await store.write(next,first.revision);assert.deepEqual(await store.read(),next);
  await assert.rejects(()=>store.remove(first.revision));assert.deepEqual(await store.read(),next);await store.remove(next.revision);assert.equal(await store.read(),null);
 });
 test(`${name}: invalid expected revisions and reused current revisions fail closed`,async()=>{
  const store:CatalogStore=factory();const first=await envelope();await store.write(first,null);
  for(const bad of ['',undefined,'bad\n','bad value',null] as unknown[]){await assert.rejects(()=>store.remove(bad as string));if(bad!==null)await assert.rejects(()=>store.write(first,bad as string));}
  await assert.rejects(()=>store.write(first,first.revision));assert.deepEqual(await store.read(),first);
 });
 test(`${name}: two stale writers cannot both commit`,async()=>{
  const store:CatalogStore=factory();const first=await envelope();await store.write(first,null);const a=await envelope();const b=await envelope();
  const writes=await Promise.allSettled([store.write(a,first.revision),store.write(b,first.revision)]);assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.filter(r=>r.status==='rejected').length,1);
  assert.ok([a.revision,b.revision].includes((await store.read())!.revision));
 });
}
function awaitable<T>(value:T):T{return value;}
test('IndexedDB transaction failure preserves the previous encrypted vault',async()=>{
 const store=createIndexedDBCatalogStore(`quota-${crypto.randomUUID()}`);const first=await envelope();await store.write(first,null);const next=await envelope();const original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic quota failure','QuotaExceededError');};
 try{await assert.rejects(()=>store.write(next,first.revision),/Could not save/);}finally{IDBObjectStore.prototype.put=original;}
 assert.deepEqual(await store.read(),first);
});
test('legacy migration archives its encrypted original atomically and local removal clears both copies',async()=>{
 const legacy=await seal(emptyLibrary(),session);await localStore.write(legacy,null);const opened=await openLearningVault(legacy,'synthetic adapter test passphrase');const prepared=await sealLearningVault(opened.library,opened.session,opened.bundle);
 await localStore.write(prepared.envelope,legacy.iv);assert.deepEqual(await localStore.readLegacyBackup(),legacy);assert.deepEqual(await localStore.read(),prepared.envelope);
 await localStore.remove(prepared.envelope.revision);assert.equal(await localStore.read(),null);assert.equal(await localStore.readLegacyBackup(),null);
});

test('a second legacy migration retains the matching original instead of an older library',async()=>{
 const first=await seal(emptyLibrary(),session);await localStore.write(first,null);const opened=await openLearningVault(first,'synthetic adapter test passphrase');const migrated=await sealLearningVault(opened.library,opened.session,opened.bundle);await localStore.write(migrated.envelope,first.iv);assert.deepEqual(await localStore.readLegacyBackup(),first);
 const second=await seal({...emptyLibrary(),recommendations:false},session);await localStore.write(second,migrated.envelope.revision);const reopened=await openLearningVault(second,'synthetic adapter test passphrase');const next=await sealLearningVault(reopened.library,reopened.session,reopened.bundle);await localStore.write(next.envelope,second.iv);assert.deepEqual(await localStore.readLegacyBackup(),second);assert.deepEqual(await localStore.read(),next.envelope);await localStore.remove(next.envelope.revision);
});
