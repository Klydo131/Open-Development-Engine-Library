import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const modulePath=process.env.OLR_PGLITE_MODULE;
const admin='10000000-0000-0000-0000-000000000001';
const learner='10000000-0000-0000-0000-000000000002';
const other='10000000-0000-0000-0000-000000000003';
const secondAdmin='10000000-0000-0000-0000-000000000004';
const unverified='10000000-0000-0000-0000-000000000005';
const question={subject:'A study question',message:'Please explain this exercise.'};
const migration=()=>readFile(new URL('../examples/postgres/migrations/2026-10-26-request-capacity.sql',import.meta.url),'utf8');

async function fixture(){
  assert.ok(modulePath,'Set OLR_PGLITE_MODULE to the resolved pinned PGlite module.');
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  await db.exec('create role anon nologin noinherit; create role authenticated nologin noinherit;');
  for(const file of ['course-portal-schema.sql','group-workspace-schema.sql'])await db.exec(await readFile(new URL(`../examples/postgres/${file}`,import.meta.url),'utf8'));
  await db.query(`insert into portal_private.accounts(id,email,verified) values
    ($1,'admin@example.invalid',true),($2,'learner@example.invalid',true),($3,'other@example.invalid',true),
    ($4,'second-admin@example.invalid',true),($5,'unverified@example.invalid',false)`,[admin,learner,other,secondAdmin,unverified]);
  await db.query('insert into portal_private.administrators(user_id) values($1),($2)',[admin,secondAdmin]);
  async function as(id:string|null){
    await db.exec('reset role');
    await db.query("select set_config('library.actor_id',$1,false)",[id??'']);
    await db.exec('set role authenticated');
  }
  async function call(name:string,values:unknown[]=[]){
    const result=await db.query(`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) value`,values);
    return result.rows[0].value;
  }
  async function definitions(){
    return (await db.query(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='portal_private' and p.proname in ('ask_support','request_teacher') order by p.proname`)).rows;
  }
  return {db,as,call,definitions};
}

for(const upgraded of [false,true])test(`request capacity preserves staff access on ${upgraded?'upgraded':'fresh'} schemas`,{skip:!modulePath},async t=>{
  const {db,as,call,definitions}=await fixture();
  try{
    if(upgraded){
      const before=await definitions();
      for(const [name,parameter] of [['ask_support','p_question'],['request_teacher','p_request']])await db.exec(`
        create or replace function portal_private.${name}(${parameter} jsonb) returns void
        language plpgsql security definer set search_path='' as $$
        begin raise exception 'Previous request writer.'; end $$;`);
      await as(learner);await assert.rejects(call('portal_ask_support',[question]),/Previous request writer/u);
      await assert.rejects(call('portal_request_teacher',[question]),/Previous request writer/u);
      await db.exec('reset role');
      await db.exec(await migration());await db.exec(await migration());
      assert.deepEqual(await definitions(),before,'A repeated upgrade installs the fresh functions and retains their grants.');
    }
    await t.test('two learners share one hundred support slots including answered requests',async()=>{
      for(const id of [learner,other]){await as(id);for(let i=0;i<50;i++)await call('portal_ask_support',[question]);assert.equal((await call('portal_support')).length,50);}
      await as(admin);
      const inbox=await call('portal_support');assert.equal(inbox.length,100);
      await call('portal_reply_support',[inbox[0].id,'Try the first step again.',inbox[0].revision]);
      await as(other);
      await assert.rejects(call('portal_ask_support',[question]),/Request capacity reached/u);
      await as(admin);
      const retained=await call('portal_support');assert.equal(retained.length,100);assert.equal(retained.filter((row:any)=>row.status==='answered').length,1);
    });
    await t.test('two learners share one hundred teacher slots including assigned requests',async()=>{
      for(const id of [learner,other]){await as(id);for(let i=0;i<50;i++)await call('portal_request_teacher',[question]);assert.equal((await call('portal_teacher_requests')).length,50);}
      await as(admin);
      const inbox=await call('portal_teacher_requests');assert.equal(inbox.length,100);
      await call('portal_create_private_room',[inbox[0].id,'Private study','Work through the exercise.']);
      await as(other);
      await assert.rejects(call('portal_request_teacher',[question]),/Request capacity reached/u);
      await as(admin);
      const retained=await call('portal_teacher_requests');assert.equal(retained.length,100);assert.equal(retained.filter((row:any)=>row.status==='assigned').length,1);
      await as(secondAdmin);assert.equal((await call('portal_teacher_requests')).length,99);
    });
    if(upgraded){
      await db.exec('reset role');await db.exec(await migration());
      await as(admin);assert.equal((await call('portal_support')).length,100);assert.equal((await call('portal_teacher_requests')).length,100);
    }
  }finally{await db.close();}
});

test('request writers validate identity, payload and transaction isolation before taking the capacity mutex',{skip:!modulePath},async()=>{
  const {db,as,call}=await fixture();
  try{
    for(const name of ['portal_ask_support','portal_request_teacher']){
      for(const id of [null,unverified]){await as(id);await assert.rejects(call(name,[question]),/Sign in required|Confirmed learner/u);}
      await as(learner);await assert.rejects(call(name,[{...question,subject:' '}]),/Invalid/u);
      for(const isolation of ['repeatable read','serializable']){
        await db.exec(`begin isolation level ${isolation}`);
        try{await assert.rejects(call(name,[question]),/READ COMMITTED/u);}finally{await db.exec('rollback');}
      }
    }
    await as(admin);assert.deepEqual(await call('portal_support'),[]);assert.deepEqual(await call('portal_teacher_requests'),[]);
  }finally{await db.close();}
});

test('capacity mutexes are transaction locks compatible with reading the retained inbox',{skip:!modulePath},async()=>{
  const {db,as,call}=await fixture();
  try{
    for(const [writer,reader,table] of [['portal_ask_support','portal_support','portal_support_threads'],['portal_request_teacher','portal_teacher_requests','portal_teacher_requests']]){
      await as(learner);await db.exec('begin');
      await call(writer,[question]);
      const locks=async()=>(await db.query(`select mode from pg_locks where pid=pg_backend_pid() and relation=$1::regclass and granted`,[`public.${table}`])).rows;
      assert.ok((await locks()).some((row:any)=>row.mode==='ShareRowExclusiveLock'));
      assert.equal((await call(reader)).length,1);
      assert.ok((await locks()).some((row:any)=>row.mode==='ShareRowExclusiveLock'));
      await db.exec('commit');
      assert.equal((await locks()).some((row:any)=>row.mode==='ShareRowExclusiveLock'),false);
    }
  }finally{await db.close();}
});

test('capacity upgrade refuses stale-snapshot isolation without changing functions',{skip:!modulePath},async()=>{
  const {db,definitions}=await fixture();
  try{
    const before=await definitions();
    await db.exec('set default_transaction_isolation=\'repeatable read\'');
    await assert.rejects(db.exec(await migration()),/READ COMMITTED/u);
    await db.exec('rollback');
    await db.exec('set default_transaction_isolation=\'read committed\'');
    assert.deepEqual(await definitions(),before);
  }finally{await db.close();}
});

for(const table of ['portal_support_threads','portal_teacher_requests'])test(`upgrade rejects existing ${table} overflow without changing records or functions`,{skip:!modulePath},async()=>{
  const {db,definitions}=await fixture();
  try{
    await db.query(`insert into public.${table}(learner_id,subject,message) select $1::uuid,'Retained request','Keep this customer message.' from generate_series(1,101)`,[learner]);
    const before=await definitions();
    await assert.rejects(db.exec(await migration()),/Request capacity exceeds supported limit/u);
    await db.exec('rollback');
    assert.equal((await db.query(`select count(*)::integer count from public.${table}`)).rows[0].count,101);
    assert.deepEqual(await definitions(),before);
    assert.equal((await db.query(`select count(*)::integer count from public.${table} where message='Keep this customer message.'`)).rows[0].count,101);
  }finally{await db.close();}
});
