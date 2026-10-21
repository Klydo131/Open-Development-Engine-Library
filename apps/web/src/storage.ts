import {createIndexedDBCatalogStore as createCoreIndexedDBStore} from '../../../packages/core/src/indexeddb-store.ts';
import {CatalogConflictError, validateCatalogEnvelope, type CatalogEnvelope, type CatalogStore} from '../../../packages/core/src/index.ts';
import {revisionOf,validateAppEnvelope,type AppEnvelope} from './learning-vault.ts';
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('open-learning-rooms',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('vaults');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Browser storage is unavailable. Enable site storage and try again.'));
    request.onblocked=()=>reject(new Error('Close other copies of this app and try again.'));
  });
}
function validRevision(value:unknown,create=false):void {
  if(create&&value===null)return;
  if(typeof value!=='string'||!value.length||value.length>128||!/^[-A-Za-z0-9_+/.:=]+$/.test(value)||/[\r\n]/.test(value))throw new Error('A valid expected revision is required.');
}
async function read(key:string):Promise<AppEnvelope|null>{
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('vaults','readonly');const request=tx.objectStore('vaults').get(key);
    request.onsuccess=()=>{try{resolve(request.result?validateAppEnvelope(request.result):null);}catch(error){reject(error);}};
    request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}
async function change(key:string,value:AppEnvelope|null,expected:string|null,keepLegacy=false,clearLegacy=false):Promise<void>{
  validRevision(expected,value!==null);
  const next=value?validateAppEnvelope(value):null;
  if(next&&revisionOf(next)===expected)throw new CatalogConflictError();
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('vaults','readwrite');const store=tx.objectStore('vaults');let conflict=false;
    const request=store.get(key);
    request.onsuccess=()=>{
      try{
        const current=request.result?validateAppEnvelope(request.result):null;
        if((current?revisionOf(current):null)!==expected){conflict=true;tx.abort();return;}
        if(next){
          if(keepLegacy&&!clearLegacy&&current?.format==='open-learning-rooms'&&next.format==='open-library-catalog-vault'){
            store.put(current,'legacy-backup');
          }
          store.put(next,key);if(clearLegacy)store.delete('legacy-backup');
        }else{store.delete(key);if(keepLegacy)store.delete('legacy-backup');}
      }catch{tx.abort();}
    };
    tx.oncomplete=()=>resolve();
    tx.onabort=tx.onerror=()=>reject(conflict?new CatalogConflictError():new Error('Could not save. Browser storage may be full or unavailable. Your previous saved library is intact.'));
  });}finally{db.close();}
}
export const localStore={
  read:()=>read('library'),
  write:(value:AppEnvelope,expected:string|null)=>change('library',value,expected,true),
  remove:(expected:string)=>change('library',null,expected,true),
  rekey:(value:CatalogEnvelope,expected:string)=>change('library',validateCatalogEnvelope(value),expected,true,true),
  readLegacyBackup:()=>read('legacy-backup')
};
/** Compatibility wrapper; legacy library migration stays in the application. */
export function createIndexedDBCatalogStore(key='catalog'):CatalogStore{
  if(!/^[a-zA-Z0-9._:-]{1,100}$/.test(key)||['library','legacy-backup'].includes(key))throw new Error('Invalid catalog storage key.');
  return createCoreIndexedDBStore({databaseName:'open-learning-rooms',storeName:'vaults',key});
}
