import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupInvitationHandler, type InvitationActor, type InvitationService} from '../examples/http/group-invitations.ts';

const admin = '10000000-0000-0000-0000-000000000001', groupId = '20000000-0000-0000-0000-000000000001', invitationId = '30000000-0000-0000-0000-000000000001';
const invitation = {id: invitationId, groupId, email: 'learner@example.invalid', expiresAt: '2026-11-01T00:00:00.000Z', status: 'pending' as const};
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://service.example/group-invitations', {method: 'POST', headers: {Authorization: 'Bearer synthetic-token', Origin: 'https://library.example', 'Content-Type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)});
function setup(actor: InvitationActor | null = {id: admin, role: 'admin'}) {
  const calls: unknown[][] = [], messages: {to: string; subject: string; text: string; idempotencyKey: string}[] = [];
  const invitations: InvitationService = {async create(...values) { calls.push(['create', ...values]); return invitation; }, async revoke(...values) { calls.push(['revoke', ...values]); }};
  const options = {portalUrl: 'https://library.example/portal.html', authenticate: async () => actor, invitations, sendEmail: async (message: typeof messages[number]) => { messages.push(message); }};
  return {calls, messages, options, handle: createGroupInvitationHandler(options)};
}
test('invitation endpoint rejects nonstaff, missing bearer and other origins before creation or delivery', async () => {
  for (const actor of [null, {id: admin, role: 'learner' as const}]) {
    const fixture = setup(actor), response = await fixture.handle(request({groupId, email: invitation.email}));
    assert.equal(response.status, 403); assert.deepEqual(fixture.calls, []); assert.deepEqual(fixture.messages, []);
  }
  const fixture = setup();
  assert.equal((await fixture.handle(request({}, {Authorization: ''}))).status, 401);
  assert.equal((await fixture.handle(request({}, {Origin: 'https://other.example'}))).status, 403);
  assert.equal((await fixture.handle(new Request('https://service.example', {method: 'GET'}))).status, 405);
  assert.deepEqual(fixture.calls, []);
});
test('invitation token is random, hashed for persistence and sent only through the email port', async () => {
  const fixture = setup(), response = await fixture.handle(request({groupId, email: invitation.email}));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), invitation);
  assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const email = fixture.messages[0]; assert.equal(email.to, invitation.email); assert.equal(email.idempotencyKey, invitationId);
  const token = /Invitation code: ([a-f0-9]{64})/u.exec(email.text)![1];
  assert.ok(email.text.includes('/portal.html#invite=' + token)); assert.ok(email.text.includes('choose Join'));
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  assert.deepEqual(fixture.calls, [['create', admin, groupId, invitation.email, hash]]); assert.notEqual(hash, token);
  assert.equal(JSON.stringify(invitation).includes(token), false);
});
test('malformed, private-extra-field and oversized invitation bodies never reach the service', async () => {
  const fixture = setup();
  for (const body of ['{', {groupId, email: invitation.email, role: 'admin'}, {groupId: 'wrong', email: invitation.email}, {groupId, email: 'bad'}, 'x'.repeat(1025)]) {
    assert.notEqual((await fixture.handle(request(body))).status, 200);
  }
  assert.deepEqual(fixture.calls, []); assert.deepEqual(fixture.messages, []);
});
test('delivery failure attempts revocation without exposing provider exception data', async () => {
  const fixture = setup();
  const handle = createGroupInvitationHandler({...fixture.options, sendEmail: async () => { throw new Error('PRIVATE_PROVIDER_KEY_AND_EMAIL'); }});
  const response = await handle(request({groupId, email: invitation.email}));
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('PRIVATE_PROVIDER'), false);
  assert.deepEqual(fixture.calls[1], ['revoke', admin, groupId, invitationId]);
});

test('an empty-chunk invitation stream is canceled within its body deadline', {timeout:3000},async()=>{
  const fixture=setup();let canceled=false;
  const body=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(0));},cancel(){canceled=true;}});
  const input=new Request('https://service.example/group-invitations',{method:'POST',headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'},body,duplex:'half'} as RequestInit);
  const response=await createGroupInvitationHandler({...fixture.options,bodyTimeoutMs:25})(input);
  assert.equal(response.status,408);assert.equal(canceled,true);assert.deepEqual(fixture.calls,[]);
});
