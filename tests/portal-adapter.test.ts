import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseCoursePortal, type SupabasePortalClient} from '../examples/supabase/course-portal.ts';
import {PortalConflict, type Course} from '../packages/portal/src/index.ts';
const id = '20000000-0000-0000-0000-000000000001';
const revision = '40000000-0000-0000-0000-000000000001';
const userId = '10000000-0000-0000-0000-000000000001';
const course: Course = {id,revision,title:'Original course',summary:'Practice one thing.',language:'en',status:'published',lessons:[{id,title:'One task',text:'Try it.',sourceUrl:'',credit:'Original author',rights:'CC BY 4.0'}]};
function fixture() {
  let event: (event: string,session:unknown)=>void = ()=>{};
  let unsubscribed = false;
  let user: any = {id:userId,email:'learner@example.org',email_confirmed_at:'2026-10-20T00:00:00Z',user_metadata:{role:'admin'}};
  let rpcError: unknown = null;
  let authError: unknown = null;
  let resetMode = 0;
  let role: unknown = 'learner';
  let rows: unknown = [course];
  const calls: {name:string,args:unknown}[] = [];
  function auth(name:string,args:unknown) {calls.push({name,args});return Promise.resolve({data:null,error:authError});}
  const client: SupabasePortalClient = {
    auth: {
      async getUser(){return {data:{user},error:null};},
      signUp(args){return auth('signUp',args);}, signInWithPassword(args){return auth('signIn',args);},
      async resetPasswordForEmail(email,options){calls.push({name:'reset',args:{email,options}});if(resetMode===2)throw new Error('private provider error');return {error:resetMode===1?{message:'email does not exist'}:null};},
      updateUser(args){return auth('updateUser',args);}, signOut(){return auth('signOut',null);},
      onAuthStateChange(callback){event=callback;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};},
    },
    async rpc(name,args){calls.push({name,args});return {data:name==='portal_role'?role:name==='portal_save_course'?args?.p_course:name==='portal_list_courses'?rows:[],error:rpcError};},
  };
  const portal = supabaseCoursePortal(client,{redirectTo:'https://example.org/portal/'});
  return {portal,calls,event:(name:string)=>event(name,null),setUser(value:unknown){user=value;},setRole(value:unknown){role=value;},setRows(value:unknown){rows=value;},setRpcError(value:unknown){rpcError=value;},setAuthError(value:unknown){authError=value;},setResetMode(value:number){resetMode=value;},isUnsubscribed:()=>unsubscribed};
}
test('portal verifies account through Auth getUser and a server-owned role RPC',async()=>{
  const f=fixture(); const account=await f.portal.account();
  assert.equal(account.user?.role,'learner'); // User-editable metadata said admin and was ignored.
  assert.deepEqual(f.calls.map(call=>call.name),['portal_role']);
  f.setRole('admin'); assert.equal((await f.portal.account()).user?.role,'admin');
  f.setRole({role:'admin'}); await assert.rejects(f.portal.account());
  f.setUser(null); assert.deepEqual(await f.portal.account(),{user:null,recovery:false});f.portal.dispose();
});
test('portal rejects anonymous and unconfirmed accounts before role lookup',async()=>{
  const f=fixture();
  for(const user of [{id:userId,email:'a@example.org',is_anonymous:true,email_confirmed_at:'confirmed'},{id:userId,email:'a@example.org'}]){f.setUser(user);await assert.rejects(f.portal.account(),/Confirm your email/);}
  assert.equal(f.calls.length,0);f.portal.dispose();
});
test('email signup and recovery use exact trusted redirects and no editable role claims',async()=>{
  const f=fixture();await f.portal.signUp('learner@example.org','A long account phrase');
  assert.deepEqual(f.calls[0],{name:'signUp',args:{email:'learner@example.org',password:'A long account phrase',options:{emailRedirectTo:'https://example.org/portal/'}}});
  for(const mode of [0,1,2]){f.setResetMode(mode);assert.equal(await f.portal.requestPasswordReset('learner@example.org'),undefined);}
  assert.ok(f.calls.filter(call=>call.name==='reset').every(call=>(call.args as any).options.redirectTo==='https://example.org/portal/'));
  await assert.rejects(f.portal.requestPasswordReset('not an email'));f.portal.dispose();
});
test('password updates require a recovery event and successful updates leave recovery mode',async()=>{
  const f=fixture();let changes=0;const off=f.portal.onAccountChange(()=>{changes++;});
  await assert.rejects(f.portal.updatePassword('A new account phrase'),/recovery link/);
  f.event('PASSWORD_RECOVERY');assert.equal((await f.portal.account()).recovery,true);
  await f.portal.updatePassword('A new account phrase');assert.equal((await f.portal.account()).recovery,false);
  assert.equal(f.calls.find(call=>call.name==='updateUser')?.args && (f.calls.find(call=>call.name==='updateUser')!.args as any).password,'A new account phrase');
  off();const before=changes;f.event('SIGNED_OUT');assert.equal(changes,before);f.portal.dispose();assert.equal(f.isUnsubscribed(),true);
});
test('adapter forwards validated CAS revisions and maps conflicts without provider internals',async()=>{
  const f=fixture();await f.portal.saveCourse(course,null);
  assert.deepEqual(f.calls[0],{name:'portal_save_course',args:{p_course:course,p_expected_revision:null}});
  await assert.rejects(f.portal.saveCourse(course,''));
  f.setRpcError({code:'40001',message:'private database internals'});await assert.rejects(f.portal.saveCourse(course,revision),PortalConflict);
  f.setRpcError({code:'42501',message:'private database internals'});await assert.rejects(f.portal.listCourses(),error=>error instanceof Error&&!error.message.includes('internals'));
  f.portal.dispose();
});
test('adapter validates hostile responses and sends only selected support fields',async()=>{
  const f=fixture();f.setRows([{...course,privateJournal:'SECRET'}]);await assert.rejects(f.portal.listCourses());
  f.setRows([course]);assert.equal((await f.portal.listCourses())[0].title,course.title);
  await f.portal.askSupport({courseId:id,subject:'Question',message:'How can I practice?'});
  const ask=f.calls.find(call=>call.name==='portal_ask_support');assert.deepEqual(ask?.args,{p_question:{courseId:id,subject:'Question',message:'How can I practice?'}});
  const before=f.calls.length;await assert.rejects(f.portal.askSupport({subject:'Question',message:'Text',learnerId:userId} as any));assert.equal(f.calls.length,before);f.portal.dispose();
});
test('sign-in supports existing short provider passwords and hides provider errors',async()=>{
  const f=fixture();await f.portal.signIn('learner@example.org','existing');
  f.setAuthError({message:'private account information'});await assert.rejects(f.portal.signIn('learner@example.org','existing'),/Sign-in failed/);
  f.portal.dispose();
});
