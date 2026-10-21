import {test,expect} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
let server:http.Server;
let origin:string;
test.beforeAll(async()=>{
 const root=path.resolve('packages/core/dist');
 server=http.createServer((request,response)=>{
  const name=new URL(request.url!,'http://localhost').pathname;
  if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="en"><title>Storage contract</title><body>Isolated library adapter test</body></html>');return;}
  if(!/^\/module\/[a-z-]+\.js$/.test(name)){response.writeHead(404);response.end();return;}
  void fs.readFile(path.join(root,name.slice('/module/'.length))).then(bytes=>{response.setHeader('Content-Type','text/javascript');response.end(bytes);}).catch(()=>{response.writeHead(404);response.end();});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
});
test.afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
test('optional engine adapter stores ciphertext and rejects simultaneous stale writes in a real browser',async({page})=>{
 await page.goto(origin);
 const result=await page.evaluate(async()=>{
  const adapterPath='/module/indexeddb-store.js';const enginePath='/module/index.js';const {createIndexedDBCatalogStore}=await import(adapterPath);const core=await import(enginePath);
  const databaseName=`portable-${crypto.randomUUID()}`;const store=createIndexedDBCatalogStore({databaseName});const other=createIndexedDBCatalogStore({databaseName});const session=await core.createSession('synthetic browser adapter passphrase');
  const make=()=>core.sealCatalog({catalog:core.createCatalog(),content:new Map()},session);const first=await make();await store.write(first,null);const detached=await other.read();detached.ciphertext='modified';const detachedRead=(await store.read()).ciphertext===first.ciphertext;
  const a=await make();const b=await make();const race=await Promise.allSettled([store.write(a,first.revision),other.write(b,first.revision)]);const winner=await store.read();const opened=await core.unsealCatalog(winner,'synthetic browser adapter passphrase');let staleRemoval=false;try{await other.remove(first.revision);}catch{staleRemoval=true;}await store.remove(winner.revision);
  return {detachedRead,committed:race.filter(r=>r.status==='fulfilled').length,rejected:race.filter(r=>r.status==='rejected').length,decrypted:opened.bundle.catalog.revision===winner.revision,staleRemoval,removed:await other.read()===null};
 });
 expect(result).toEqual({detachedRead:true,committed:1,rejected:1,decrypted:true,staleRemoval:true,removed:true});
});
