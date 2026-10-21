import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createIndexedDBCatalogStore} from '../packages/core/src/indexeddb-store.ts';
import {createCatalog,createSession,sealCatalog} from '../packages/core/src/index.ts';
const session=await createSession('synthetic standalone adapter passphrase');
const vault=()=>sealCatalog({catalog:createCatalog(),content:new Map()},session);
function raw(factory:IDBFactory,name:string,version=1){return new Promise<IDBDatabase>((resolve,reject)=>{const r=factory.open(name,version);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
test('standalone IndexedDB adapter isolates databases, keys and captured options without the app',async()=>{
 const factory=new IDBFactory();const options={databaseName:'standalone-a',storeName:'encrypted',key:'first',indexedDB:factory};const a=createIndexedDBCatalogStore(options);options.databaseName='mutated';const b=createIndexedDBCatalogStore({databaseName:'standalone-a',storeName:'encrypted',key:'second',indexedDB:factory});const c=createIndexedDBCatalogStore({databaseName:'standalone-b',storeName:'encrypted',key:'first',indexedDB:factory});
 const value=await vault();await a.write(value,null);assert.deepEqual(await a.read(),value);assert.equal(await b.read(),null);assert.equal(await c.read(),null);await b.write(await vault(),null);await a.remove(value.revision);assert.ok(await b.read());
});
test('malformed persisted data rejects reads and writes without overwriting ciphertext',async()=>{
 const factory=new IDBFactory();const name='invalid-record';const store=createIndexedDBCatalogStore({databaseName:name,indexedDB:factory});const value=await vault();await store.write(value,null);const db=await raw(factory,name);await new Promise<void>((resolve,reject)=>{const tx=db.transaction('vaults','readwrite');tx.objectStore('vaults').put({...value,format:'unexpected'},'catalog');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();await assert.rejects(()=>store.read(),/validate/);await assert.rejects(()=>store.write(awaitable(value),null),/validate/);
 const check=await raw(factory,name);const stored=await new Promise<any>((resolve,reject)=>{const tx=check.transaction('vaults');const r=tx.objectStore('vaults').get('catalog');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});check.close();assert.equal(stored.format,'unexpected');assert.equal(stored.ciphertext,value.ciphertext);
});
function awaitable<T>(value:T):T{return value;}
test('schema mismatch and future database version fail closed without changing the existing database',async()=>{
 const factory=new IDBFactory();const first=await raw(factory,'missing-store');first.close();await assert.rejects(()=>createIndexedDBCatalogStore({databaseName:'missing-store',indexedDB:factory}).read(),/missing/);const untouched=await raw(factory,'missing-store');assert.equal(untouched.objectStoreNames.length,0);untouched.close();const future=await raw(factory,'future',2);future.close();await assert.rejects(()=>createIndexedDBCatalogStore({databaseName:'future',indexedDB:factory}).read(),/version/);
});
test('invalid inputs do not open storage and import/construction do not require a browser',async()=>{
 let opened=0;const factory={open(){opened++;throw new Error('Must not open');}} as unknown as IDBFactory;
 const store=createIndexedDBCatalogStore({indexedDB:factory});const value=await vault();await assert.rejects(()=>store.write(value,undefined as any));await assert.rejects(()=>store.write({...value,ciphertext:'invalid'},null));await assert.rejects(()=>store.remove(''));assert.equal(opened,0);
 for(const options of [{databaseName:''},{storeName:'bad\n'},{key:'bad key'}])assert.throws(()=>createIndexedDBCatalogStore(options));
 const previous=globalThis.indexedDB;try{Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true,writable:true});const unavailable=createIndexedDBCatalogStore();await assert.rejects(()=>unavailable.read(),/unavailable/);}finally{Object.defineProperty(globalThis,'indexedDB',{value:previous,configurable:true,writable:true});}
});
test('blocked opens reject promptly and close a connection delivered after rejection',async()=>{
 let request:any;let closed=0;const store=createIndexedDBCatalogStore({indexedDB:{open(){request={result:{close(){closed++;}}};return request;}} as unknown as IDBFactory});const promise=store.read();request.onblocked();await assert.rejects(()=>promise,/blocked/);request.onsuccess();assert.equal(closed,1);
});

test('a read rejects if its transaction aborts after the value request succeeds',async()=>{
 const factory=new IDBFactory();const store=createIndexedDBCatalogStore({databaseName:'abort-read',indexedDB:factory});const value=await vault();await store.write(value,null);const original=IDBObjectStore.prototype.get;
 IDBObjectStore.prototype.get=function(key){const request=original.call(this,key);request.addEventListener('success',()=>this.transaction.abort());return request;};
 try{await assert.rejects(()=>store.read(),/transaction failed/);}finally{IDBObjectStore.prototype.get=original;}assert.deepEqual(await store.read(),value);
});
