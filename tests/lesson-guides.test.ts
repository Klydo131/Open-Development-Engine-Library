import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import * as portal from '../packages/portal/src/index.ts';

const limits={goal:500,connection:2000,workedExample:6000,practice:2000,checkQuestion:2000,checkExplanation:6000};
type Field=keyof typeof limits;
const fields=Object.keys(limits) as Field[];
const guide=()=>({goal:'Explain a balanced pair of forces.',connection:'',workedExample:'The table supports a resting book while gravity pulls down.',practice:'Draw the two forces on a resting book.',checkQuestion:'Does a resting book have no forces?',checkExplanation:'It has forces. Balanced forces mean no acceleration.'});
const course=()=>({id:'20000000-0000-0000-0000-000000000001',revision:'40000000-0000-0000-0000-000000000001',title:'Notice motion',summary:'Explain one familiar observation.',language:'en',status:'published' as 'published'|'draft',lessons:[{id:'30000000-0000-0000-0000-000000000001',title:'A resting book',text:'A force is a push or pull.',sourceUrl:'',credit:'Original test author',rights:'Original test material.',teaching:guide()}]});
const partial=()=>Object.fromEntries(fields.map(field=>[field,field==='goal'?'A draft learning goal':''])) as ReturnType<typeof guide>;
const malformed=()=>[null,[],{}, {...guide(),privateJournal:'SECRET'}, {...guide(),goal:undefined}, {...guide(),practice:42},Object.assign(Object.create(null),guide()),{...guide(),goal:String.fromCharCode(1)},{...guide(),checkExplanation:String.fromCharCode(127)}];
const oversizedCourse=()=>({...course(),lessons:Array.from({length:15},(_,index)=>({...course().lessons[0],id:`30000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`,text:'x'.repeat(10000),teaching:{...guide(),workedExample:'x'.repeat(6000),checkExplanation:'x'.repeat(6000)}}))});

test('teaching guides are optional and create detached immutable course snapshots',()=>{
  const original=course();
  const result=portal.validateCourse(original);
  original.lessons[0].teaching.goal='Changed after validation';
  assert.equal(result.lessons[0].teaching?.goal,guide().goal);
  assert.ok(Object.isFrozen(result.lessons[0].teaching));
  assert.notEqual(result.lessons[0].teaching,original.lessons[0].teaching);
  const {teaching:omitted,...lesson}=course().lessons[0];
  assert.ok(omitted);
  assert.equal(Object.hasOwn(portal.validateCourse({...course(),lessons:[lesson]}).lessons[0],'teaching'),false);
});

test('guide validation rejects missing, extra, non-string, nonplain and control-bearing fields',()=>{
  for(const value of malformed())assert.throws(()=>portal.validateTeachingGuide(value));
  for(const field of fields){const missing:Record<string,unknown>={...guide()};delete missing[field];assert.throws(()=>portal.validateTeachingGuide(missing));}
  assert.equal(portal.validateTeachingGuide({...guide(),connection:'Line one\nLine two\twith a tab'}).connection,'Line one\nLine two\twith a tab');
});

test('guide bounds count UTF-16 units and keep the established aggregate course limit',()=>{
  assert.deepEqual(portal.LESSON_GUIDE_LIMITS,limits);assert.ok(Object.isFrozen(portal.LESSON_GUIDE_LIMITS));
  for(const field of fields){
    const boundary='😀'.repeat(limits[field]/2);
    assert.equal(portal.validateTeachingGuide({...guide(),[field]:boundary})[field].length,limits[field]);
    assert.throws(()=>portal.validateTeachingGuide({...guide(),[field]:boundary+'x'}));
  }
  assert.throws(()=>portal.validateCourse(oversizedCourse()));
  assert.equal(portal.PORTAL_LIMITS.courseBytes,262144);
});

test('partial guide drafts remain saveable but published guides require five instructional fields',()=>{
  const draft={...course(),status:'draft',lessons:[{...course().lessons[0],teaching:partial()}]};
  assert.deepEqual(portal.validateCourse(draft).lessons[0].teaching,partial());
  for(const field of fields.filter(field=>field!=='connection')){
    const teaching={...guide(),[field]:'\u00a0\u2003\ufeff'};
    assert.doesNotThrow(()=>portal.validateCourse({...draft,lessons:[{...draft.lessons[0],teaching}]}));
    assert.throws(()=>portal.validateCourse({...course(),lessons:[{...course().lessons[0],teaching}]}),/Complete the learning goal/);
  }
  assert.doesNotThrow(()=>portal.validateCourse(course()),'The connection field can remain empty in published guides.');
});

const modulePath=process.env.OLR_PGLITE_MODULE;
const admin='10000000-0000-0000-0000-000000000001',learner='10000000-0000-0000-0000-000000000002',outsider='10000000-0000-0000-0000-000000000003';
async function fixture(){
  assert.ok(modulePath,'Resolve the pinned PGlite fixture for SQL checks.');
  const {PGlite}=await import(pathToFileURL(modulePath).href);const db=new PGlite();
  const schema=await readFile(new URL('../examples/postgres/course-portal-schema.sql',import.meta.url),'utf8');
  await db.exec('create role anon nologin noinherit; create role authenticated nologin noinherit;');
  await db.exec(schema);
  await db.exec(await readFile(new URL('../examples/postgres/group-workspace-schema.sql',import.meta.url),'utf8'));
  await db.query(`insert into portal_private.accounts(id,email,verified) values($1,'admin@example.invalid',true),($2,'learner@example.invalid',true),($3,'outsider@example.invalid',true)`,[admin,learner,outsider]);
  await db.query('insert into portal_private.administrators(user_id) values($1)',[admin]);
  await db.query(`insert into public.portal_groups(id,title,description,kind,facilitator_id) values($1,'A study group','','group',$2)`,['50000000-0000-0000-0000-000000000001',admin]);
  await db.query('insert into public.portal_group_members(group_id,user_id) values($1,$2)',['50000000-0000-0000-0000-000000000001',learner]);
  async function as(role:'anon'|'authenticated',id:string|null){await db.exec('reset role');await db.query("select set_config('library.actor_id',$1,false)",[id??'']);await db.exec(`set role ${role}`);}
  async function call(name:string,values:unknown[]=[]){const result=await db.query(`select public.${name}(${values.map((_,index)=>'$'+(index+1)).join(',')}) value`,values);return result.rows[0].value;}
  async function definitions(){return(await db.query(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::regrole::text owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='portal_private' and p.proname in('teaching_ok','materials_ok','save_course') order by p.proname`)).rows;}
  return{db,schema,as,call,definitions};
}

test('PostgreSQL teaching guide shape, publication, bounds and permissions match the course contract',{skip:!modulePath},async t=>{
  const {db,as,call}=await fixture();
  try{
    let saved:any;
    await t.test('only admins save guides; guests and nonmembers cannot read them',async()=>{
      await as('authenticated',learner);await assert.rejects(call('portal_save_course',[course(),null]),/Administrator permission/);
      await as('authenticated',admin);saved=await call('portal_save_course',[course(),null]);
      assert.deepEqual(saved.lessons[0].teaching,guide());
      await as('anon',null);assert.deepEqual((await call('portal_list_courses'))[0].lessons,[]);
      await as('authenticated',outsider);assert.deepEqual((await call('portal_list_courses'))[0].lessons,[]);
      await as('authenticated',learner);assert.deepEqual((await call('portal_list_courses'))[0].lessons[0].teaching,guide());
      await assert.rejects(db.query('select portal_private.teaching_ok($1)',[guide()]),/permission denied/);
    });
    await t.test('strict nested shapes reject direct RPC bypasses and malformed drafts',async()=>{
      await as('authenticated',admin);
      for(const teaching of malformed().filter(value=>value===null||Object.getPrototypeOf(value)===Object.prototype||Array.isArray(value))){
        await assert.rejects(call('portal_save_course',[{...saved,status:'draft',lessons:[{...saved.lessons[0],teaching}]},saved.revision]));
      }
      for(const field of fields){const teaching:Record<string,unknown>={...guide()};delete teaching[field];await assert.rejects(call('portal_save_course',[{...saved,lessons:[{...saved.lessons[0],teaching}]},saved.revision]));}
      await db.exec('reset role');
      await assert.rejects(db.query('update public.portal_course_materials set lessons=$1 where course_id=$2',[[{...saved.lessons[0],teaching:{...guide(),privateJournal:'SECRET'}}],saved.id]),/check constraint/);
    });
    await t.test('SQL validates the same UTF-16 boundaries and control/whitespace policy',async()=>{
      await db.exec('reset role');
      for(const field of fields){
        const boundary='😀'.repeat(limits[field]/2);
        const valid={...guide(),[field]:boundary};
        assert.equal((await db.query('select portal_private.teaching_ok($1) value',[valid])).rows[0].value,true);
        assert.equal((await db.query('select portal_private.teaching_ok($1) value',[{...valid,[field]:boundary+'x'}])).rows[0].value,false);
      }
      for(const field of fields.filter(field=>field!=='connection'))assert.equal((await db.query('select portal_private.teaching_ok($1,true) value',[{...guide(),[field]:'\u00a0\u2003\ufeff'}])).rows[0].value,false);
      await as('authenticated',admin);await assert.rejects(call('portal_save_course',[oversizedCourse(),saved.revision]),/Invalid or oversized/);
    });
    await t.test('partial drafts are saved without allowing incomplete publication or stale overwrite',async()=>{
      await as('authenticated',admin);
      const draft=await call('portal_save_course',[{...saved,status:'draft',lessons:[{...saved.lessons[0],teaching:partial()}]},saved.revision]);
      assert.deepEqual(draft.lessons[0].teaching,partial());
      await assert.rejects(call('portal_save_course',[{...draft,status:'published'},draft.revision]),/Invalid or oversized/);
      await assert.rejects(call('portal_save_course',[{...saved,title:'Stale overwrite'},saved.revision]),/Course changed/);
      const current=(await call('portal_list_courses'))[0];assert.equal(current.revision,draft.revision);assert.deepEqual(current.lessons[0].teaching,partial());
    });
  }finally{await db.close();}
});

test('lesson-guide upgrade preserves existing records, grants and repeatable fresh definitions',{skip:!modulePath},async()=>{
  const {db,schema,as,call,definitions}=await fixture();
  try{
    const {teaching:omitted,...oldLesson}=course().lessons[0];assert.ok(omitted);
    await as('authenticated',admin);const existing=await call('portal_save_course',[{...course(),lessons:[oldLesson]},null]);
    await db.exec('reset role');const fresh=await definitions();
    // Recreate the pre-guide allowlist while keeping every existing material check.
    const current=schema.match(/create function portal_private\.materials_ok\(items jsonb\)[\s\S]+?end \$\$;/u)?.[0];assert.ok(current);
    const previous=current.replace('create function','create or replace function').replace(",'teaching'",'').replace(/\s*\(item \? 'teaching' and not portal_private\.teaching_ok\(item->'teaching'\)\) or/gu,'');
    const freshSave=schema.match(/create function portal_private\.save_course\(p_course jsonb,\s*p_expected_revision uuid\)[\s\S]+?end \$\$;/u)?.[0];assert.ok(freshSave);
    const oldSave=freshSave.replace('create function','create or replace function').replace(/\s*or \(item \? 'teaching' and not portal_private\.teaching_ok\(item->'teaching',true\)\)/u,'');
    await db.exec(previous);await db.exec(oldSave);await db.exec('drop function portal_private.teaching_ok(jsonb,boolean)');
    assert.equal((await db.query("select to_regprocedure('portal_private.teaching_ok(jsonb,boolean)') is null absent")).rows[0].absent,true,'An existing installation has no teaching helper yet.');
    await as('authenticated',admin);await assert.rejects(call('portal_save_course',[{...existing,lessons:course().lessons},existing.revision]));
    await db.exec('reset role');
    const before=await db.query('select c.id,c.revision,c.title,m.lessons from public.portal_courses c join public.portal_course_materials m on m.course_id=c.id');
    const upgrade=await readFile(new URL('../examples/postgres/upgrade-lesson-guides.sql',import.meta.url),'utf8');
    await db.exec(upgrade);await db.exec(upgrade);
    assert.deepEqual(await definitions(),fresh,'CREATE OR REPLACE retains owners/grants and installs the fresh definitions.');
    assert.deepEqual(await db.query('select c.id,c.revision,c.title,m.lessons from public.portal_courses c join public.portal_course_materials m on m.course_id=c.id'),before);
    await as('authenticated',admin);const updated=await call('portal_save_course',[{...existing,lessons:course().lessons},existing.revision]);assert.deepEqual(updated.lessons[0].teaching,guide());
    await as('authenticated',learner);await assert.rejects(call('portal_save_course',[updated,updated.revision]),/Administrator permission/);
    await db.exec('reset role');
    await db.exec('create role different_function_owner nologin; alter function portal_private.materials_ok(jsonb) owner to different_function_owner;');
    await assert.rejects(db.exec(upgrade),/existing portal function owner/);
    await db.exec('rollback');
    assert.equal((await db.query('select revision from public.portal_courses where id=$1',[updated.id])).rows[0].revision,updated.revision);
  }finally{await db.close();}
});
