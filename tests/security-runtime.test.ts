import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,symlinkSync,unlinkSync,rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessNode, assessNodeIndex, fetchNodeIndex} from '../scripts/security-runtime.ts';

const reviewedAt='2026-10-27T00:00:00.000Z';
const expiresAt='2026-11-03T00:00:00.000Z';
const now=new Date('2026-10-27T12:00:00.000Z');
const policy=()=>({
  schemaVersion:1,
  reviewedAt,
  expiresAt,
  node:{
    '24':{minimum:'24.22.1',supportedUntil:'2028-04-30T00:00:00.000Z'},
    '26':{minimum:'26.12.1',supportedUntil:'2029-04-30T00:00:00.000Z'},
  },
  java:{usedByEngine:false,vendorReviewRequired:true},
  sources:['https://nodejs.org/en/blog/vulnerability/october-2026-security-releases'],
});
const index=()=>[
  {version:'v26.12.1',security:true},
  {version:'v24.22.1',security:true},
];
function blocked(result:{ok:boolean;issues:string[]}){
  assert.equal(result.ok,false);
  assert.ok(result.issues.length>0,'A failed assessment explains what needs review.');
  assert.ok(result.issues.every(issue=>typeof issue==='string'&&issue.length>0));
}

test('runtime policy accepts the reviewed floors and later stable versions within supported majors',()=>{
  for(const version of ['24.22.1','v24.22.1','24.23.0','24.100.0','26.12.1','v26.12.1','26.13.0']){
    assert.deepEqual(assessNode(policy(),version,now),{ok:true,issues:[]},version);
  }
});

test('runtime policy blocks vulnerable floors, unsupported majors and unrecognized version strings',()=>{
  for(const version of ['24.22.0','24.21.99','26.12.0','26.11.99','22.23.4','20.99.0','27.0.0','28.1.0',
    '24.22.1-rc.1','26.12.1-nightly.20261027','24.22','24','24.22.1.1','24.22.1junk','',' 24.22.1','NaN.22.1']){
    blocked(assessNode(policy(),version,now));
  }
});

test('review freshness includes the review instant and excludes the exact expiry instant',()=>{
  const current=policy();
  assert.equal(assessNode(current,'24.22.1',new Date(reviewedAt)).ok,true);
  assert.equal(assessNode(current,'24.22.1',new Date(Date.parse(expiresAt)-1)).ok,true);
  blocked(assessNode(current,'24.22.1',new Date(Date.parse(reviewedAt)-1)));
  blocked(assessNode(current,'24.22.1',new Date(expiresAt)));
  blocked(assessNode(current,'24.22.1',new Date(Date.parse(expiresAt)+1)));
});

test('end-of-support checks use the selected major and fail at its exact boundary',()=>{
  const current=policy();
  current.node['24'].supportedUntil=now.toISOString();
  assert.equal(assessNode(current,'24.22.1',new Date(now.getTime()-1)).ok,true);
  blocked(assessNode(current,'24.22.1',now));
  blocked(assessNode(current,'24.99.0',new Date(now.getTime()+1)));
  assert.equal(assessNode(current,'26.12.1',now).ok,true,'The supported 26.x branch is assessed independently.');
});

test('malformed policies throw TypeError instead of producing a passing assessment',()=>{
  const valid=policy();
  const malformed:unknown[]=[
    null,[],{},
    {...valid,schemaVersion:2},
    {...valid,reviewedAt:'not-a-date'},
    {...valid,expiresAt:'not-a-date'},
    {...valid,expiresAt:reviewedAt},
    {...valid,expiresAt:'2026-10-26T23:59:59.999Z'},
    {...valid,expiresAt:'2026-11-03T00:00:00.001Z'},
    {...valid,node:{}},
    {...valid,node:{'24':{minimum:'24.22.1-rc.1',supportedUntil:'2028-04-30T00:00:00.000Z'}}},
    {...valid,node:{'24':{minimum:'26.12.1',supportedUntil:'2028-04-30T00:00:00.000Z'}}},
    {...valid,node:{'24':{minimum:'24.22.1',supportedUntil:'not-a-date'}}},
    {...valid,java:null},
    {...valid,java:{usedByEngine:true,vendorReviewRequired:true}},
    {...valid,java:{usedByEngine:false,vendorReviewRequired:false}},
    {...valid,sources:[]},
    {...valid,sources:['http://nodejs.org/dist/index.json']},
    {...valid,sources:['not-a-url']},
  ];
  for(const candidate of malformed){
    assert.throws(()=>assessNode(candidate,'24.22.1',now),TypeError);
    assert.throws(()=>assessNodeIndex(candidate,index(),now),TypeError);
  }
});

test('Node release index selects semantic security maxima rather than input order',()=>{
  const current=policy();
  current.node['24'].minimum='24.100.2';
  current.node['26'].minimum='26.100.2';
  const releases=[
    {version:'v24.100.2',security:true,date:'ignored metadata'},
    {version:'v26.99.10',security:true},
    {version:'v24.99.10',security:true},
    {version:'v26.100.2',security:true},
    {version:'v24.100.1',security:true},
    {version:'v24.101.0',security:false},
    {version:'v26.101.0',security:false},
  ];
  for(const candidate of [releases,[...releases].reverse()]){
    const result=assessNodeIndex(current,candidate,now);
    assert.equal(result.ok,true);
    assert.deepEqual(result.issues,[]);
    assert.equal(result.latest['24'].replace(/^v/u,''),'24.100.2');
    assert.equal(result.latest['26'].replace(/^v/u,''),'26.100.2');
  }
});

test('a new security release requires policy review while later ordinary releases do not',()=>{
  const ordinary=[...index(),{version:'v24.99.0',security:false},{version:'v26.99.0',security:false}];
  assert.equal(assessNodeIndex(policy(),ordinary,now).ok,true);
  for(const version of ['v24.22.2','v24.23.0','v26.12.2','v26.13.0']){
    const result=assessNodeIndex(policy(),[...ordinary,{version,security:true}],now);
    blocked(result);
    const major=version.slice(1).split('.')[0];
    assert.equal(result.latest[major].replace(/^v/u,''),version.slice(1));
  }
  assert.equal(assessNodeIndex(policy(),[...ordinary,{version:'v28.1.0',security:true}],now).ok,true,
    'A release in another major does not silently expand the supported runtime policy.');
});

test('release-index assessment fails closed on malformed input and missing security branches',()=>{
  const malformed:unknown[]=[
    null,{},'[]',[],
    [null],
    [...index(),null],
    [...index(),{}],
    [...index(),{version:'v24.22.1'}],
    [...index(),{version:'v24.22.1',security:'true'}],
    [...index(),{version:24,security:true}],
    [...index(),{version:'v24.22.2-rc.1',security:true}],
    [...index(),{version:'v24.22',security:false}],
    [...index(),{version:'v28.invalid.0',security:false}],
    [{version:'v24.22.1',security:true}],
    [{version:'v26.12.1',security:true}],
    [{version:'v24.22.1',security:true},{version:'v26.13.0',security:false}],
    [{version:'v24.23.0',security:false},{version:'v26.12.1',security:true}],
  ];
  for(const candidate of malformed)blocked(assessNodeIndex(policy(),candidate,now));
});

test('online-index evidence cannot rescue a future, expired or unsupported runtime policy',()=>{
  blocked(assessNodeIndex(policy(),index(),new Date(Date.parse(reviewedAt)-1)));
  blocked(assessNodeIndex(policy(),index(),new Date(expiresAt)));
  const current=policy();
  current.node['24'].supportedUntil=now.toISOString();
  blocked(assessNodeIndex(current,index(),now));
});

test('assessments never update policy review dates, floors, release records or caller time',()=>{
  const current=policy();
  const releases=[...index(),{version:'v24.22.2',security:true}];
  const snapshot=structuredClone({current,releases});
  const instant=now.getTime();
  Object.freeze(current.node['24']);
  Object.freeze(current.node['26']);
  Object.freeze(current.node);
  Object.freeze(current.java);
  Object.freeze(current.sources);
  Object.freeze(current);
  for(const release of releases)Object.freeze(release);
  Object.freeze(releases);
  assessNode(current,'24.22.1',now);
  blocked(assessNodeIndex(current,releases,now));
  assert.deepEqual(current,snapshot.current);
  assert.deepEqual(releases,snapshot.releases);
  assert.equal(now.getTime(),instant);
});

test('official release fetch fixes its origin, disables redirects and rejects unavailable or oversized data',async()=>{
  const fetcher:typeof fetch=async(input,init)=>{
    assert.equal(input,'https://nodejs.org/dist/index.json');
    assert.equal(init?.redirect,'error');
    assert.equal(init?.cache,'no-store');
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json(index());
  };
  assert.deepEqual(await fetchNodeIndex(fetcher),index());
  await assert.rejects(fetchNodeIndex(async()=>new Response('unavailable',{status:503})));
  await assert.rejects(fetchNodeIndex(async()=>new Response('not JSON')));
  await assert.rejects(fetchNodeIndex(async()=>new Response('x'.repeat(2*1024*1024+1))));
});

test('CLI rejects invalid options through direct and symlink or junction entry paths',t=>{
  const directory=mkdtempSync(join(tmpdir(),'library-runtime-entry-'));
  const alias=join(directory,'scripts');
  const source=fileURLToPath(new URL('../scripts/',import.meta.url));
  symlinkSync(source,alias,process.platform==='win32'?'junction':'dir');
  t.after(()=>{unlinkSync(alias);rmdirSync(directory);});
  for(const entry of [join(source,'security-runtime.ts'),join(alias,'security-runtime.ts')]){
    const result=spawnSync(process.execPath,['--experimental-strip-types',entry,'--unknown-runtime-test-option'],{encoding:'utf8',timeout:10000});
    assert.equal(result.error,undefined);
    assert.equal(result.status,1,'Every CLI path must execute the check and fail closed.');
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/Runtime security check could not complete/);
  }
});
