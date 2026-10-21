import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {supabaseCoursePortal} from '../examples/supabase/course-portal.ts';
import {createPortalStorage,PORTAL_STORAGE_KEY} from '../apps/web/src/portal-storage.ts';

function diskPort(values = new Map<string,string>()) {
  return {values,get length(){return values.size;},key:(i:number)=>Array.from(values.keys())[i]??null,
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
}
const user = {id:'10000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'learner@example.org',email_confirmed_at:'2026-10-21T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-21T00:00:00Z'};
const part = (value: unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${part({alg:'HS256',typ:'JWT'})}.${part({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})}.synthetic-signature`;
const refreshToken = 'SYNTHETIC_REFRESH_TOKEN_NOT_FOR_DISK';
const session = {access_token:accessToken,refresh_token:refreshToken,token_type:'bearer',expires_in:3600,user};
function browser(disk: ReturnType<typeof diskPort>) {
  const names = ['window','document','BroadcastChannel'] as const;
  const original = names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  let location = new URL('https://library.example/portal.html');
  const history = {state:null,replaceState(_state:unknown,_title:string,url?:string|URL|null){if(url)location=new URL(url,location);}};
  const windowValue = {get location(){return location;},history,localStorage:disk,addEventListener(){},removeEventListener(){}};
  Object.defineProperty(globalThis,'window',{value:windowValue,configurable:true});
  Object.defineProperty(globalThis,'document',{value:{visibilityState:'visible'},configurable:true});
  Object.defineProperty(globalThis,'BroadcastChannel',{value:undefined,configurable:true});
  return {url:()=>location,setUrl:(value:string)=>{location=new URL(value);},restore(){for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
function service() {
  const requests: {url:URL;body:Record<string,unknown>}[] = [];
  let invalidExchange = false;
  const fetcher: typeof fetch = async (input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    const body=typeof init?.body==='string'?JSON.parse(init.body):{};
    requests.push({url,body});
    let value: unknown = {};
    if(url.pathname==='/auth/v1/signup') value=user;
    else if(url.pathname==='/auth/v1/token') {
      if(invalidExchange)return new Response(JSON.stringify({error:'invalid_grant',error_description:'Synthetic expired code'}),{status:400,headers:{'Content-Type':'application/json'}});
      value=session;
    } else if(url.pathname==='/auth/v1/user')value=user;
    else if(url.pathname==='/rest/v1/rpc/portal_role')value='learner';
    else if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    else if(url.pathname!=='/auth/v1/recover')throw new Error(`Unexpected mocked service path: ${url.pathname}`);
    return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {fetcher,requests,failExchange(){invalidExchange=true;}};
}
test('pinned real Supabase SDK email flows retain only one-time PKCE state across a fresh client',async t=>{
  const disk=diskPort(); const page=browser(disk); const backend=service();
  const clients: Array<{auth:{dispose():Promise<void>}}>=[];
  const adapters: ReturnType<typeof supabaseCoursePortal>[]=[];
  function client() {
    const storage=createPortalStorage(disk);
    const sdk=createClient('https://project.supabase.co','sb_publishable_synthetic_key',{global:{fetch:backend.fetcher},auth:{storageKey:PORTAL_STORAGE_KEY,storage,persistSession:true,flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:false,experimental:{appendPkceFlowIdToRedirects:true}}});
    const portal=supabaseCoursePortal(sdk,{redirectTo:'https://library.example/portal.html'});
    clients.push(sdk);adapters.push(portal);return {sdk,portal,storage};
  }
  function noTokensOnDisk(){const raw=JSON.stringify(Array.from(disk.values));assert.equal(raw.includes(accessToken),false);assert.equal(raw.includes(refreshToken),false);assert.equal(disk.values.has(PORTAL_STORAGE_KEY),false);}
  async function disposeAll(){for(const adapter of adapters.splice(0))adapter.dispose();for(const sdk of clients.splice(0))await sdk.auth.dispose();}
  try {
    await t.test('signup fresh-client confirmation exchanges the same per-flow verifier without recovery mode',async()=>{
      const first=client();await first.sdk.auth.getSession();
      await first.portal.signUp(user.email,'A long original account phrase');
      const signup=backend.requests.find(row=>row.url.pathname==='/auth/v1/signup')!;
      assert.equal(signup.body.code_challenge_method,'s256');assert.equal(typeof signup.body.code_challenge,'string');
      const callback=new URL(signup.url.searchParams.get('redirect_to')!);const flow=callback.searchParams.get('sb_flow_id');assert.ok(flow);
      const slot=`${PORTAL_STORAGE_KEY}-flow-${flow}-code-verifier`;
      assert.ok(disk.values.has(slot));const verifier=JSON.parse(JSON.parse(disk.values.get(slot)!).text);
      noTokensOnDisk();await disposeAll();
      callback.searchParams.set('code','synthetic-confirmation-code');page.setUrl(callback.href);
      const second=client();const result=await second.sdk.auth.getSession();assert.equal(result.error,null);assert.ok(result.data.session);
      assert.equal((await second.portal.account()).recovery,false);
      const token=backend.requests.find(row=>row.url.pathname==='/auth/v1/token')!;
      assert.deepEqual(token.body,{auth_code:'synthetic-confirmation-code',code_verifier:verifier});
      assert.equal(page.url().searchParams.has('code'),false);assert.equal(page.url().searchParams.has('sb_flow_id'),false);
      assert.equal(disk.values.size,0);noTokensOnDisk();await disposeAll();
    });
    await t.test('recovery fresh-client exchange marks recovery only after a successful code exchange',async()=>{
      page.setUrl('https://library.example/portal.html');const first=client();await first.sdk.auth.getSession();
      await first.portal.requestPasswordReset(user.email);
      const reset=backend.requests.filter(row=>row.url.pathname==='/auth/v1/recover').at(-1)!;
      const callback=new URL(reset.url.searchParams.get('redirect_to')!);const flow=callback.searchParams.get('sb_flow_id');assert.ok(flow);
      const slot=`${PORTAL_STORAGE_KEY}-flow-${flow}-code-verifier`;
      assert.ok(JSON.parse(JSON.parse(disk.values.get(slot)!).text).endsWith('/recovery'));
      noTokensOnDisk();await disposeAll();
      callback.searchParams.set('code','synthetic-recovery-code');page.setUrl(callback.href);
      const second=client();assert.equal((await second.sdk.auth.getSession()).error,null);
      const account=await second.portal.account();assert.equal(account.user?.email,user.email);assert.equal(account.recovery,true);
      assert.equal(disk.values.size,0);noTokensOnDisk();
      await second.portal.signOut();assert.equal((await second.portal.account()).user,null);assert.equal(disk.values.size,0);await disposeAll();
    });
    await t.test('an expired recovery exchange never establishes an account or recovery state',async()=>{
      page.setUrl('https://library.example/portal.html');const first=client();await first.sdk.auth.getSession();await first.portal.requestPasswordReset(user.email);
      const callback=new URL(backend.requests.filter(row=>row.url.pathname==='/auth/v1/recover').at(-1)!.url.searchParams.get('redirect_to')!);
      await disposeAll();backend.failExchange();callback.searchParams.set('code','synthetic-expired-code');page.setUrl(callback.href);
      const second=client();const initialized=await second.sdk.auth.initialize();const result=await second.sdk.auth.getSession();
      assert.ok(initialized.error);assert.equal(result.data.session,null);
      assert.deepEqual(await second.portal.account(),{user:null,recovery:false});assert.equal(disk.values.size,0);noTokensOnDisk();
      await assert.rejects(second.portal.updatePassword('A new original account phrase'),/recovery link/);await disposeAll();
    });
  }finally{await disposeAll();page.restore();}
});

test('portal storage bounds SDK flow slots, ages, keys and hostile disk entries',()=>{
  const disk=diskPort();let clock=10000;const storage=createPortalStorage(disk,()=>clock);
  disk.setItem('unrelated-owner-setting','keep');
  for(let i=0;i<9;i++){clock++;storage.setItem(`${PORTAL_STORAGE_KEY}-flow-flow000${i}-code-verifier`,JSON.stringify(`verifier${i}`));}
  assert.equal(Array.from(disk.values.keys()).filter(key=>key.startsWith(`${PORTAL_STORAGE_KEY}-flow-`)).length,5);
  storage.setItem(`${PORTAL_STORAGE_KEY}-flows-code-verifier`,JSON.stringify(['flow0004','flow0005','flow0006','flow0007','flow0008']));
  assert.throws(()=>storage.setItem(`${PORTAL_STORAGE_KEY}-flows-code-verifier`,JSON.stringify(Array(6).fill('flow0008'))));
  assert.throws(()=>storage.setItem(`${PORTAL_STORAGE_KEY}-code-verifier`,JSON.stringify('x'.repeat(513))));
  storage.setItem(`${PORTAL_STORAGE_KEY}-flow-evil\n-code-verifier`,JSON.stringify('never persist'));
  assert.equal(disk.values.has(`${PORTAL_STORAGE_KEY}-flow-evil\n-code-verifier`),false);
  const next=createPortalStorage(disk,()=>clock);assert.equal(next.getItem(`${PORTAL_STORAGE_KEY}-flow-evil\n-code-verifier`),null);
  const slot=`${PORTAL_STORAGE_KEY}-flow-flow0008-code-verifier`;
  disk.setItem(slot,JSON.stringify({text:JSON.stringify('secret'),at:clock,extra:'invalid'}));assert.equal(next.getItem(slot),null);
  clock+=60*60*1000;createPortalStorage(disk,()=>clock);assert.deepEqual(Array.from(disk.values),[['unrelated-owner-setting','keep']]);
  storage.setItem(PORTAL_STORAGE_KEY,'SESSION_MEMORY_ONLY');storage.clear();assert.equal(storage.getItem(PORTAL_STORAGE_KEY),null);assert.equal(disk.getItem('unrelated-owner-setting'),'keep');
});
