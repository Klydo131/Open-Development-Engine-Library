import {portalEmail, portalId, validateGroupInvitation, type GroupInvitation} from '../../packages/portal/src/index.ts';

export type InvitationActor = Readonly<{id: string; role: 'learner' | 'admin'}>;
export type InvitationService = Readonly<{
  create(actorId: string, groupId: string, email: string, tokenHash: string): Promise<GroupInvitation>;
  revoke(actorId: string, groupId: string, invitationId: string): Promise<void>;
}>;
class InvitationRequestError extends Error {
  readonly status: number;
  constructor(status: number) { super('Check the invitation request and try again.'); this.status = status; }
}
export function createGroupInvitationHandler(options: {
  portalUrl: string;
  authenticate(request: Request): Promise<InvitationActor | null>;
  invitations: InvitationService;
  sendEmail(message: {to: string; subject: string; text: string; idempotencyKey: string}): Promise<void>;
  bodyTimeoutMs?: number;
}) {
  const portal = new URL(options.portalUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(portal.hostname);
  if ((portal.protocol !== 'https:' && !(local && portal.protocol === 'http:')) || portal.username || portal.password || portal.search || portal.hash) throw new Error('Configure a trusted portal URL.');
  const bodyTimeoutMs=options.bodyTimeoutMs??5000;
  if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>5000)throw new Error('Use a body deadline between 1 and 5000 milliseconds.');
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': portal.origin, 'Vary': 'Origin'};
  const result = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers});
  return async (request: Request): Promise<Response> => {
    if (request.headers.get('Origin') && request.headers.get('Origin') !== portal.origin) return result(403, {error: 'This origin is not allowed.'});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info'}});
    if (request.method !== 'POST') return result(405, {error: 'Use POST for invitations.'});
    if (!/^Bearer [!-~]{1,4096}$/u.test(request.headers.get('Authorization') ?? '')) return result(401, {error: 'A verified staff account is required.'});
    let invitation: GroupInvitation | undefined, actor: InvitationActor | null = null;
    try {
      actor = await options.authenticate(request);
      if (!actor || actor.role !== 'admin') return result(403, {error: 'A verified staff account is required.'});
      const id = portalId(actor.id);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return result(415, {error: 'Use a JSON invitation request.'});
      const bytes = await readInvitationBody(request,bodyTimeoutMs);
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); } catch { return result(400, {error: 'Check the invitation fields.'}); }
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== 'email,groupId') return result(400, {error: 'Check the invitation fields.'});
      const row = value as {groupId: unknown; email: unknown};
      let groupId: string, email: string;
      try { groupId = portalId(row.groupId); email = portalEmail(row.email); } catch { return result(400, {error: 'Check the invitation fields.'}); }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      invitation = validateGroupInvitation(await options.invitations.create(id, groupId, email, tokenHash));
      if (invitation.groupId !== groupId || invitation.email.toLowerCase() !== email.toLowerCase() || invitation.status !== 'pending') throw new Error('Invalid invitation receipt.');
      const link = new URL(portal); link.hash = new URLSearchParams({invite: token}).toString();
      await options.sendEmail({to: invitation.email, subject: 'Your library study invitation', idempotencyKey: invitation.id,
        text: `You have been invited to a library study group.\n\nSign in or create and verify an account using this email address. Then open this link and choose Join:\n${link.href}\n\nInvitation code: ${token}\nExpires: ${invitation.expiresAt}\n\nOpening the link alone does not join the group. If account verification opens a new page, reopen this invitation afterward. Ignore this message if it was not expected.`});
      return result(200, invitation);
    } catch (error) {
      if(error instanceof InvitationRequestError)return result(error.status,{error:error.message});
      if (invitation && actor) {
        try { await options.invitations.revoke(actor.id, invitation.groupId, invitation.id); } catch { /* Delivery may be ambiguous; staff must review pending invitations. */ }
      }
      return result(503, {error: 'Invitation delivery could not be confirmed. Review pending invitations before trying again.'});
    }
  };
}

async function readInvitationBody(request: Request,timeoutMs:number): Promise<Uint8Array> {
  if (!request.body) throw new InvitationRequestError(400);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(1024); let size = 0, reject!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, failure) => { reject = failure; });
  const end=performance.now()+timeoutMs;
  const timer = setTimeout(() => { const error = new InvitationRequestError(408); reject(error); void reader.cancel(error).catch(() => {}); }, timeoutMs);
  try {
    return await Promise.race([deadline, (async () => {
      while (true) {
        if(request.signal.aborted||performance.now()>=end)throw new InvitationRequestError(408);
        const item = await reader.read();
        if(request.signal.aborted||performance.now()>=end)throw new InvitationRequestError(408);
        if (item.done) return bytes.subarray(0, size);
        if (!(item.value instanceof Uint8Array) || item.value.byteLength > bytes.byteLength - size) throw new InvitationRequestError(413);
        bytes.set(item.value, size); size += item.value.byteLength;
      }
    })()]);
  } catch (error) { void reader.cancel(error).catch(() => {}); throw error; }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
