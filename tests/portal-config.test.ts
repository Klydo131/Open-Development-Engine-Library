import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portalConfig} from '../apps/web/portal-config.ts';
import {securityHeaders,portalSecurityHeaders} from '../apps/web/security-headers.ts';
import {createPortalStorage,PORTAL_STORAGE_KEY} from '../apps/web/src/portal-storage.ts';
const key='sb_publishable_abcdefghijklmnopqrstuvwxyz';
test('portal configuration rejects embedded secrets and origin/header injection before bundling',()=>{
  assert.equal(portalConfig(undefined,undefined),null);
  assert.deepEqual(portalConfig('https://example.supabase.co',key),{url:'https://example.supabase.co',key});
  for(const bad of ['http://example.com','https://example.com/','https://user:pass@example.com','https://example.com?track=1','https://example.com#x','https://example.com\r\nX: value','https://example.com/path'])assert.throws(()=>portalConfig(bad,key));
  for(const bad of ['sb_secret_abcdefghijklmnopqrstuvwxyz','eyJhbGciOiJIUzI1NiJ9.service_role.signature','',key+'\n'])assert.throws(()=>portalConfig('https://example.supabase.co',bad));
  assert.equal(portalConfig('http://127.0.0.1:54321',key)?.url,'http://127.0.0.1:54321');
  assert.throws(()=>portalConfig('',key));
});
test('only the portal receives an explicit provider connect origin',()=>{
  assert.match(securityHeaders['Content-Security-Policy'],/connect-src 'none'/);
  assert.match(portalSecurityHeaders()['Content-Security-Policy'],/connect-src 'self';/);
  assert.match(portalSecurityHeaders('https://example.supabase.co')['Content-Security-Policy'],/connect-src 'self' https:\/\/example.supabase.co;/);
  assert.throws(()=>portalSecurityHeaders('https://example.com; img-src *'));
  assert.doesNotMatch(securityHeaders['Content-Security-Policy'],/supabase|connect-src 'self'/);
});
test('only a bounded one-time verifier persists; sessions and recovery flags do not',()=>{
  const disk=new Map<string,string>();let now=10000;
  const port={get length(){return disk.size;},key:(i:number)=>Array.from(disk.keys())[i]??null,getItem:(k:string)=>disk.get(k)??null,setItem:(k:string,v:string)=>{disk.set(k,v);},removeItem:(k:string)=>{disk.delete(k);}};
  const first=createPortalStorage(port,()=>now),verifier=`${PORTAL_STORAGE_KEY}-code-verifier`;
  first.setItem(PORTAL_STORAGE_KEY,'synthetic access/refresh tokens');first.setItem(verifier,'"synthetic-verifier/PASSWORD_RECOVERY"');
  assert.equal(disk.size,1);assert.equal(disk.has(PORTAL_STORAGE_KEY),false);
  const next=createPortalStorage(port,()=>now);
  assert.equal(next.getItem(PORTAL_STORAGE_KEY),null);assert.equal(next.getItem(verifier),'"synthetic-verifier/PASSWORD_RECOVERY"');
  next.removeItem(verifier);assert.equal(disk.size,0);
  first.setItem(verifier,'"another"');now+=60*60*1000;
  assert.equal(next.getItem(verifier),null);assert.equal(disk.size,0);
  first.setItem(verifier,'"rollback"');now--;assert.equal(next.getItem(verifier),null);
});
