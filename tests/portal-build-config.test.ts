import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {build,preview,resolveConfig} from 'vite';

const publicKey='sb_publishable_abcdefghijklmnopqrstuvwxyz';
const secretMarker='sb_secret_SYNTHETIC_NOT_A_CREDENTIAL';

test('portal build settings and response policy share the validated project environment',async t=>{
  const repository=process.cwd(),lab=resolve(repository,'.lab');
  mkdirSync(lab,{recursive:true});
  const fixture=mkdtempSync(join(lab,'portal-build-config-'));
  const web=join(fixture,'apps/web'),script=join(fixture,'scripts/configure-portal.ts');
  mkdirSync(join(web,'src'),{recursive:true});mkdirSync(join(fixture,'scripts'),{recursive:true});
  for(const file of ['vite.config.ts','portal-config.ts','security-headers.ts'])copyFileSync(join(repository,'apps/web',file),join(web,file));
  copyFileSync(join(repository,'scripts/configure-portal.ts'),script);
  for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])copyFileSync(join(repository,file),join(fixture,file));
  writeFileSync(join(fixture,'vercel.json'),JSON.stringify({headers:[{source:'/portal.html',headers:[]}]}));
  const html='<html><head><title>Synthetic configuration fixture</title></head><body><div id="root"></div><script type="module" src="/src/portal.js"></script></body></html>';
  for(const file of ['index.html','portal.html'])writeFileSync(join(web,file),html);
  writeFileSync(join(web,'src/portal.js'),"document.querySelector('#root').textContent=import.meta.env.VITE_PORTAL_SUPABASE_URL+'|'+import.meta.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY;");
  const names=['VITE_PORTAL_SUPABASE_URL','VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY','VERCEL','NODE_ENV'] as const;
  const previous=new Map(names.map(name=>[name,process.env[name]]));
  for(const name of names)delete process.env[name];
  const settings=(origin:string,key=publicKey)=>`VITE_PORTAL_SUPABASE_URL=${origin}\nVITE_PORTAL_SUPABASE_PUBLISHABLE_KEY=${key}\n`;
  const options=(mode:string)=>({configFile:join(web,'vite.config.ts'),mode,logLevel:'silent' as const});
  const configure=(base:string,production='')=>{
    writeFileSync(join(fixture,'.env'),base);writeFileSync(join(fixture,'.env.production'),production);
    writeFileSync(join(web,'.env'),settings('https://nested.example',secretMarker));
  };
  async function policies(mode:string){
    const server=await preview({...options(mode),preview:{host:'127.0.0.1',port:0,strictPort:false}});
    try{
      const address=server.httpServer.address();
      if(!address||typeof address==='string')throw new Error('Expected an isolated loopback preview.');
      const origin=`http://127.0.0.1:${address.port}`;
      const portal=await fetch(origin+'/portal.html'),privateRoom=await fetch(origin+'/');
      return {portal:portal.headers.get('Content-Security-Policy'),privateRoom:privateRoom.headers.get('Content-Security-Policy')};
    }finally{await new Promise<void>((done,fail)=>server.httpServer.close(error=>error?fail(error):done()));}
  }
  try{
    process.chdir(fixture);
    await t.test('root and mode files configure the browser and its actual response headers together',async()=>{
      configure(settings('https://root.example'),settings('https://production.example'));
      mkdirSync(join(web,'dist'),{recursive:true});
      for(const file of ['index.html','portal.html'])writeFileSync(join(web,'dist',file),html);
      for(const [mode,origin]of [['development','https://root.example'],['production','https://production.example']]){
        const resolved=await resolveConfig(options(mode),'build'),headers=await policies(mode);
        assert.equal(resolved.env.VITE_PORTAL_SUPABASE_URL,origin);
        assert.equal(resolved.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY,publicKey);
        assert.ok(headers.portal?.includes(`connect-src 'self' ${origin};`));
        assert.ok(headers.privateRoom?.includes("connect-src 'none';"));
      }
    });
    await t.test('process settings take precedence consistently',async()=>{
      process.env.VITE_PORTAL_SUPABASE_URL='https://process.example';process.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY=publicKey;
      try{
        const resolved=await resolveConfig(options('production'),'build'),headers=await policies('production');
        assert.equal(resolved.env.VITE_PORTAL_SUPABASE_URL,'https://process.example');
        assert.ok(headers.portal?.includes('https://process.example;'));
        assert.ok(!headers.portal?.includes('https://production.example'));
      }finally{delete process.env.VITE_PORTAL_SUPABASE_URL;delete process.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY;}
    });
    await t.test('empty project settings stay in demonstration mode despite nested environment files',async()=>{
      configure('');
      const resolved=await resolveConfig(options('production'),'build'),headers=await policies('production');
      assert.equal(resolved.env.VITE_PORTAL_SUPABASE_URL,undefined);
      assert.equal(resolved.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY,undefined);
      assert.ok(headers.portal?.includes("connect-src 'self';"));
      assert.ok(!headers.portal?.includes('https://nested.example'));
    });
    await t.test('a privileged key in the authoritative project settings rejects before bundling',async()=>{
      configure(settings('https://root.example',secretMarker));
      await assert.rejects(build(options('production')),/publishable key/u);
    });
    await t.test('the actual browser bundle includes validated public settings and excludes the nested secret marker',async()=>{
      configure(settings('https://root.example'));
      await build(options('production'));
      const assets=join(web,'dist/assets');
      const javascript=readdirSync(assets).filter(file=>file.endsWith('.js')).map(file=>readFileSync(join(assets,file),'utf8')).join('\n');
      assert.ok(javascript.includes(publicKey));assert.ok(javascript.includes('https://root.example'));
      assert.ok(!javascript.includes(secretMarker));assert.ok(!javascript.includes('https://nested.example'));
    });
    await t.test('the deployment configuration command reads project settings from a different working directory',()=>{
      const elsewhere=join(fixture,'elsewhere');mkdirSync(elsewhere);
      const result=spawnSync(process.execPath,['--experimental-strip-types',script],{cwd:elsewhere,env:process.env,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      const text=readFileSync(join(fixture,'vercel.json'),'utf8');
      const config=JSON.parse(text) as {headers:{source:string;headers:{key:string;value:string}[]}[]};
      const policy=config.headers.find(route=>route.source==='/portal.html')?.headers.find(header=>header.key==='Content-Security-Policy')?.value;
      assert.ok(policy?.includes("connect-src 'self' https://root.example;"));
      assert.ok(!text.includes(publicKey));assert.ok(!text.includes(secretMarker));
    });
  }finally{
    process.chdir(repository);
    for(const [name,value]of previous){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    const descendant=relative(lab,fixture);
    assert.ok(descendant&&!descendant.startsWith('..')&&!isAbsolute(descendant));
    rmSync(fixture,{recursive:true,force:true});
  }
});
