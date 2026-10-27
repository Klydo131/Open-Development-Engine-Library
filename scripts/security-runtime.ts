import {readFileSync,createReadStream,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {boundedJsonFetch} from '../examples/http/bounded-fetch.ts';

type Line={minimum:string;supportedUntil:string};
type Policy={schemaVersion:1;reviewedAt:string;expiresAt:string;node:Record<string,Line>;java:{usedByEngine:false;vendorReviewRequired:true};sources:string[]};
type Assessment={ok:boolean;issues:string[]};
const invalid=()=>new TypeError('Invalid runtime security policy.');
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).sort().join(',')===[...expected].sort().join(',');
function version(value:unknown):number[]|null{
  if(typeof value!=='string'||!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))return null;
  const parts=value.replace(/^v/,'').split('.').map(Number);return parts.every(Number.isSafeInteger)?parts:null;
}
const compare=(a:number[],b:number[])=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
function date(value:unknown):number{
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))throw invalid();
  const time=Date.parse(value);
  if(!Number.isFinite(time)||new Date(time).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))throw invalid();
  return time;
}
function policy(value:unknown):Policy{
  if(!object(value)||!keys(value,['schemaVersion','reviewedAt','expiresAt','node','java','sources'])||value.schemaVersion!==1)throw invalid();
  const start=date(value.reviewedAt),end=date(value.expiresAt);
  if(end<=start||end-start>7*86400000||!object(value.node)||!Object.keys(value.node).length||Object.keys(value.node).length>16)throw invalid();
  for(const [major,line]of Object.entries(value.node)){
    if(!/^[1-9]\d*$/.test(major)||!object(line)||!keys(line,['minimum','supportedUntil'])||version(line.minimum)?.[0]!==Number(major))throw invalid();
    date(line.supportedUntil);
  }
  if(!object(value.java)||!keys(value.java,['usedByEngine','vendorReviewRequired'])||value.java.usedByEngine!==false||value.java.vendorReviewRequired!==true)throw invalid();
  if(!Array.isArray(value.sources)||!value.sources.length||value.sources.length>16)throw invalid();
  for(const source of value.sources){try{if(typeof source!=='string')throw invalid();const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password)throw invalid();}catch{throw invalid();}}
  return value as Policy;
}
function freshness(checked:Policy,now:Date):string[]{
  const time=now.getTime();if(!Number.isFinite(time))throw invalid();
  return time<date(checked.reviewedAt)?['Policy review time is in the future.']:time>=date(checked.expiresAt)?['Runtime security policy has expired; review advisories.']:[];
}
export function assessNode(value:unknown,actualVersion:string,now:Date):Assessment{
  const checked=policy(value),issues=freshness(checked,now),actual=version(actualVersion);
  const line=actual?checked.node[String(actual[0])]:undefined;
  if(!actual||!line)issues.push('Node release is unsupported by this policy.');
  else{
    if(now.getTime()>=date(line.supportedUntil))issues.push('Node release line is past its supported lifetime.');
    if(compare(actual,version(line.minimum)!)<0)issues.push('Node version is below the reviewed security minimum.');
  }
  return{ok:issues.length===0,issues};
}
export function assessNodeIndex(value:unknown,index:unknown,now:Date):Assessment&{latest:Record<string,string>}{
  const checked=policy(value),issues=freshness(checked,now),latest:Record<string,string>={};
  if(!Array.isArray(index)||!index.length||index.length>10000)return{ok:false,issues:[...issues,'Official Node security index is missing or invalid.'],latest};
  for(const row of index){
    if(!object(row)||!version(row.version)||typeof row.security!=='boolean')return{ok:false,issues:[...issues,'Official Node security index is missing or invalid.'],latest:{}};
    const parts=version(row.version)!,major=String(parts[0]);
    if(row.security&&Object.hasOwn(checked.node,major)&&(!latest[major]||compare(parts,version(latest[major])!)>0))latest[major]=String(row.version);
  }
  for(const [major,line]of Object.entries(checked.node)){
    if(now.getTime()>=date(line.supportedUntil))issues.push(`Node line ${major} is past its supported lifetime.`);
    if(!latest[major])issues.push(`Official security release data is missing for Node line ${major}.`);
    else if(compare(version(latest[major])!,version(line.minimum)!)>0)issues.push(`New Node security release requires policy review for line ${major}.`);
  }
  return{ok:issues.length===0,issues,latest};
}
export async function fetchNodeIndex(fetcher:typeof fetch=fetch):Promise<unknown>{
  const response=await boundedJsonFetch({fetch:fetcher,maxResponseBytes:2*1024*1024,timeoutMs:10000})('https://nodejs.org/dist/index.json',{redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('Official Node release data unavailable.');return response.json();
}
async function inventory(){
  const hash=createHash('sha256');for await(const chunk of createReadStream(process.execPath))hash.update(chunk);
  return{capturedAt:new Date().toISOString(),nodeVersion:process.version,platform:process.platform,architecture:process.arch,executableSha256:hash.digest('hex'),components:{openssl:process.versions.openssl,brotli:process.versions.brotli,undici:process.versions.undici},scope:'Executing Node process only; hash is an inventory fingerprint, not vendor attestation. Java and other hosts are not assessed.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
  try{
    const flags=process.argv.slice(2);if(flags.some(flag=>!['--online','--inventory'].includes(flag)))throw Error('Unknown option.');
    const checked:unknown=JSON.parse(readFileSync(new URL('../runtime-security.json',import.meta.url),'utf8'));
    const wantsOnline=flags.includes('--online'),initial=assessNode(checked,process.version,new Date());
    const index=wantsOnline&&initial.ok?await fetchNodeIndex():undefined;
    const captured=flags.includes('--inventory')?await inventory():undefined;
    // Network and executable hashing can cross a review or support deadline.
    const now=new Date(),local=assessNode(checked,process.version,now);
    const online=wantsOnline?(index?assessNodeIndex(checked,index,now):{ok:false,issues:['Online assessment was not completed.'],latest:{}}):undefined;
    const ok=local.ok&&(!online||online.ok);
    console.log(JSON.stringify({ok,assessedAt:now.toISOString(),nodeVersion:process.version,policyReviewedAt:policy(checked).reviewedAt,policyExpiresAt:policy(checked).expiresAt,issues:[...local.issues,...online?.issues??[]],latestSecurityReleases:online?.latest,inventory:captured},null,2));
    if(!ok)process.exitCode=1;
  }catch{console.error('Runtime security check could not complete. Review the trusted policy, runtime support and network access.');process.exitCode=1;}
}
