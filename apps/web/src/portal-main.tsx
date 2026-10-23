import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {supabaseCoursePortal} from '../../../examples/supabase/course-portal.ts';
import {boundedJsonFetch} from '../../../examples/http/bounded-fetch.ts';
import {portalServices} from '../../../examples/http/portal-services.ts';
import {takePortalInvitation} from './portal-invitation.ts';
import {portalConfig} from '../portal-config.ts';
import {MEDIA_LIMITS,PORTAL_LIMITS,portalSourceUrl,type CoursePortal} from '../../../packages/portal/src/index.ts';
import {createDemoPortal} from './portal-demo.ts';
import {PortalPanel} from './PortalPanel.tsx';
import {createPortalStorage,PORTAL_STORAGE_KEY} from './portal-storage.ts';
import './style.css';

const invitation=takePortalInvitation(window.location.href);
if(invitation.url!==window.location.href)history.replaceState(null,'',invitation.url);

async function makePortal():Promise<CoursePortal>{
  const config=portalConfig(import.meta.env.VITE_PORTAL_SUPABASE_URL,import.meta.env.VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY);
  if(!config)return createDemoPortal();
  const storage=createPortalStorage(window.localStorage);
  const jsonFetch=boundedJsonFetch({maxResponseBytes:PORTAL_LIMITS.responseBytes,timeoutMs:30000});
  const fileFetch=boundedJsonFetch({maxResponseBytes:MEDIA_LIMITS.fileBytes,timeoutMs:30000});
  const request:typeof fetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    return (url.origin===config.url&&url.pathname==='/functions/v1/library-media'&&method==='GET'?fileFetch:jsonFetch)(input,init);
  };
  const client=createClient(config.url,config.key,{global:{fetch:request},auth:{storageKey:PORTAL_STORAGE_KEY,storage,persistSession:true,flowType:'pkce',detectSessionInUrl:true,experimental:{appendPkceFlowIdToRedirects:true}}});
  const services=portalServices(client.functions);
  const portal=supabaseCoursePortal(client,{redirectTo:new URL('/portal.html',window.location.origin).href,...services});
  // Await the SDK's verified callback exchange before its PASSWORD_RECOVERY state is read.
  const callback=Boolean(new URLSearchParams(window.location.search).get('code')||window.location.hash);
  const result=await client.auth.getSession();
  if(result.error||(callback&&!result.data.session)){portal.dispose();storage.clear();await client.auth.dispose();throw new Error('This email link could not be verified. Open it in the browser where you requested it, or request a new link.');}
  window.addEventListener('pagehide',()=>{storage.clear();root.unmount();portal.dispose();void client.auth.dispose();},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
  return portal;
}
function PortalApp({portal}:{portal:CoursePortal}){
  const [invitationToken,setInvitationToken]=useState(invitation.token);
  const [external,setExternal]=useState<string|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(external)dialog.current?.showModal();},[external]);
  return <><PortalPanel portal={portal} back={()=>window.location.assign('/')} openLink={url=>setExternal(portalSourceUrl(url))} invitationToken={invitationToken} onInvitationConsumed={()=>setInvitationToken(undefined)}/>{external&&<dialog ref={dialog} aria-labelledby="portal-external-heading" onCancel={event=>{event.preventDefault();setExternal(null);}}><h2 id="portal-external-heading">Open an outside source?</h2><p>This opens another website. Its own privacy and safety rules apply.</p><p className="portal-material-text">{external}</p><div className="portal-actions"><button className="button secondary" autoFocus onClick={()=>setExternal(null)}>Stay here</button><a className="button" href={external} target="_blank" rel="noopener noreferrer" onClick={()=>setExternal(null)}>Open source</a></div></dialog>}</>;
}
const root=createRoot(document.getElementById('root')!);
void makePortal().finally(()=>{
  // Remove callback codes/tokens/errors even when configuration or storage initialization fails.
  if(window.location.search||window.location.hash)history.replaceState(null,'','/portal.html');
}).then(portal=>root.render(<PortalApp portal={portal}/>)).catch(()=>root.render(<main className="login-main"><section className="login-card"><h1>Learning library unavailable</h1><p role="alert">The account service or email link could not be verified. Open recovery links in the browser where you requested them. Contact the operator if this continues.</p><a className="button" href="/portal.html">Try again</a><a className="text-button" href="/">Private rooms</a></section></main>));
