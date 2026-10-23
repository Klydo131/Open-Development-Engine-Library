import {portalId} from '../../packages/portal/src/index.ts';
import {describePortalMedia, MEDIA_LIMITS} from '../../packages/portal/src/media.ts';
import {verifyMediaBytes, type LibraryMediaStore} from '../postgres/media-store.ts';

export type LibraryMediaOptions = {
  portalUrl: string;
  /** Verify the bearer token's signature, issuer, audience, expiry and confirmed
   * account. Return the verified account ID and trusted role, never request data. */
  authenticate(request: Request): Promise<{id: string;role: 'learner'|'admin'} | null>;
  store: LibraryMediaStore;
  /** A real malware scanner, configured by the operator. No scanner fails closed. */
  scan?: (bytes: Uint8Array, name: string) => Promise<'clean'|'blocked'|'unavailable'>;
  bodyTimeoutMs?: number;
};
class MediaRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status=status; }
}
function cancel(body: ReadableStream<Uint8Array> | null) {
  try { void body?.cancel().catch(()=>{}); } catch { /* Cancellation never delays an error response. */ }
}
async function readBody(request: Request, timeoutMs: number): Promise<Uint8Array> {
  if (!request.body) throw new MediaRequestError(400,'Choose a non-empty supported file.');
  const reader=request.body.getReader();
  let failure: MediaRequestError | undefined;
  let reject!: (error: MediaRequestError)=>void;
  const stopped=new Promise<never>((_resolve,fail)=>{reject=fail;});
  const stop=(error: MediaRequestError)=>{
    if (failure) return;
    failure=error;reject(error);
    try { void reader.cancel().catch(()=>{}); } catch { /* An uncooperative source cannot hold the request open. */ }
  };
  const abort=()=>stop(new MediaRequestError(408,'File upload was canceled.'));
  request.signal.addEventListener('abort',abort,{once:true});
  const deadline=performance.now()+timeoutMs;
  const timer=setTimeout(()=>stop(new MediaRequestError(408,'File upload exceeded its deadline.')),timeoutMs);
  try {
    const reading=(async()=>{
      let data=new Uint8Array(0),length=0;
      while (true) {
        if (failure) throw failure;
        // A source with immediately resolved empty chunks can otherwise starve
        // the timer queue. The elapsed deadline also applies to that source.
        if (performance.now()>=deadline) throw new MediaRequestError(408,'File upload exceeded its deadline.');
        const chunk=await reader.read();
        if (failure) throw failure;
        if (performance.now()>=deadline) throw new MediaRequestError(408,'File upload exceeded its deadline.');
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new MediaRequestError(400,'Invalid file upload.');
        if (chunk.value.byteLength > MEDIA_LIMITS.fileBytes-length) throw new MediaRequestError(413,'Choose a file of 10 MiB or less.');
        const next=length+chunk.value.byteLength;
        if (next>data.byteLength) {
          const grown=new Uint8Array(Math.min(MEDIA_LIMITS.fileBytes,Math.max(next,16384,data.byteLength*2)));
          grown.set(data);data=grown;
        }
        data.set(chunk.value,length);length=next;
      }
      if (!length) throw new MediaRequestError(400,'Choose a non-empty supported file.');
      return data.subarray(0,length);
    })();
    if (request.signal.aborted) abort();
    return await Promise.race([reading,stopped]);
  } catch(error) {
    stop(error instanceof MediaRequestError?error:new MediaRequestError(400,'File upload could not be read.'));
    throw failure;
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort',abort);
    try { reader.releaseLock(); } catch { /* An already released reader needs no cleanup. */ }
  }
}
async function scanFile(scan: NonNullable<LibraryMediaOptions['scan']>, bytes: Uint8Array, name: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Own a separate bounded copy. A scanner cannot mutate the bytes we store.
    const result=await Promise.race([
      Promise.resolve().then(()=>scan(new Uint8Array(bytes),name)),
      new Promise<'unavailable'>(resolve=>{timer=setTimeout(()=>resolve('unavailable'),15000);}),
    ]);
    if (result==='blocked') throw new MediaRequestError(422,'This file could not pass the safety check.');
    if (result!=='clean') throw new MediaRequestError(503,'File safety checking is unavailable. Try again later.');
  } catch(error) {
    if (error instanceof MediaRequestError) throw error;
    throw new MediaRequestError(503,'File safety checking is unavailable. Try again later.');
  } finally { clearTimeout(timer); }
}
export function createLibraryMediaHandler(options: LibraryMediaOptions): (request: Request)=>Promise<Response> {
  const url=new URL(options.portalUrl);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.origin==='null') throw new TypeError('Configure an HTTP(S) portal origin.');
  const origin=url.origin,bodyTimeoutMs=options.bodyTimeoutMs??5000;
  if (!Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs<1 || bodyTimeoutMs>5000) throw new TypeError('Body deadline must be between 1 and 5000 milliseconds.');
  return async request=>{
    const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'});
    const requestOrigin=request.headers.get('origin');
    if (requestOrigin===origin) {
      headers.set('Access-Control-Allow-Origin',origin);
      headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers','authorization, apikey, content-type, x-client-info, x-file-name, x-media-id');
      headers.set('Access-Control-Expose-Headers','X-Library-Media');
    }
    const json=(status:number,value:unknown)=>{headers.set('Content-Type','application/json');return new Response(JSON.stringify(value),{status,headers});};
    let uploadAuthorized=false;
    try {
      if (requestOrigin!==null && requestOrigin!==origin) throw new MediaRequestError(403,'Origin is not allowed.');
      if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
      if (!['GET','POST'].includes(request.method)) {headers.set('Allow','GET, POST, OPTIONS');throw new MediaRequestError(405,'Method is not supported.');}
      const principal=await options.authenticate(request);
      if (!principal) throw new MediaRequestError(401,'Sign in to access library files.');
      let actorId:string;
      try { actorId=portalId(principal.id); } catch { throw new MediaRequestError(401,'Sign in to access library files.'); }
      if (principal.role!=='admin' && principal.role!=='learner') throw new MediaRequestError(401,'Sign in to access library files.');
      if (request.method==='POST') {
        if (principal.role!=='admin') throw new MediaRequestError(403,'Administrator permission is required.');
        uploadAuthorized=true;
        if (!options.scan) throw new MediaRequestError(503,'File safety checking is unavailable. Try again later.');
        if (request.headers.get('content-type')?.toLowerCase()!=='application/octet-stream') throw new MediaRequestError(415,'Upload raw file bytes as application/octet-stream.');
        const length=request.headers.get('content-length');
        if (length!==null && (!/^[0-9]+$/u.test(length) || !Number.isSafeInteger(Number(length)))) throw new MediaRequestError(400,'Invalid upload length.');
        if (length!==null && Number(length)>MEDIA_LIMITS.fileBytes) throw new MediaRequestError(413,'Choose a file of 10 MiB or less.');
        let name:string;
        try { name=decodeURIComponent(request.headers.get('x-file-name')??''); } catch { throw new MediaRequestError(400,'Choose a valid filename.'); }
        const bytes=await readBody(request,bodyTimeoutMs);
        let media;
        try { media=await describePortalMedia(name,bytes); } catch { throw new MediaRequestError(400,'Choose a supported file whose contents match its filename.'); }
        await scanFile(options.scan,bytes,name);
        await options.store.put(actorId,media,bytes);
        return json(201,media);
      }
      let id:string;
      try { id=portalId(request.headers.get('x-media-id')); } catch { throw new MediaRequestError(400,'Choose a valid library file.'); }
      const stored=await options.store.get(actorId,id);
      if (!stored) throw new MediaRequestError(404,'Library file is unavailable.');
      const checked=await verifyMediaBytes(stored.media,stored.bytes);
      if (checked.media.id!==id) throw new Error('Invalid storage response.');
      headers.set('Content-Type','application/octet-stream');
      headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(checked.media.name).replace(/[!'()*]/gu,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`);
      headers.set('X-Library-Media',encodeURIComponent(JSON.stringify(checked.media)));
      return new Response(new Uint8Array(checked.bytes),{status:200,headers});
    } catch(error) {
      // Do not log provider errors, bearer tokens, URLs, file names or bytes.
      if (uploadAuthorized) {
        try { cancel(request.body); } catch { /* Authentication errors must not inspect a hostile body. */ }
      }
      return error instanceof MediaRequestError?json(error.status,{error:error.message}):json(503,{error:'Library file service is unavailable. Try again later.'});
    }
  };
}
