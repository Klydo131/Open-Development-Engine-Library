export type PortalConfig=Readonly<{url:string;key:string}>;
/** Public build configuration only. Secret/service-role keys must never enter a browser build. */
export function portalConfig(urlValue:unknown,keyValue:unknown):PortalConfig|null{
  const url=typeof urlValue==='string'?urlValue:'',key=typeof keyValue==='string'?keyValue:'';
  if(!url&&!key)return null;
  if(!url||!key)throw new Error('Configure both portal public settings, or leave both empty for the local demonstration.');
  let parsed:URL;try{parsed=new URL(url);}catch{throw new Error('The portal service URL must be an HTTPS origin.');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
  if(url!==parsed.origin||parsed.username||parsed.password||(parsed.protocol!=='https:'&&!(loopback&&parsed.protocol==='http:')))
    throw new Error('The portal service URL must be an HTTPS origin, without a path, credentials, query or fragment. Local HTTP is allowed only on loopback.');
  if(!/^sb_publishable_[A-Za-z0-9_-]{20,180}$/.test(key))throw new Error('Use a Supabase publishable key. Secret keys and legacy role tokens are not accepted in this browser example.');
  return Object.freeze({url:parsed.origin,key});
}
