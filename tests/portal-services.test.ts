import test from 'node:test';
import assert from 'node:assert/strict';
import {portalServices} from '../examples/http/portal-services.ts';
import {describePortalMedia} from '../packages/portal/src/media.ts';
import {takePortalInvitation} from '../apps/web/src/portal-invitation.ts';
import {createDemoPortal} from '../apps/web/src/portal-demo.ts';
import {createClient} from '@supabase/supabase-js';
import {boundedJsonFetch} from '../examples/http/bounded-fetch.ts';
import {createLibraryMediaHandler} from '../examples/http/library-media.ts';
import {createGroupInvitationHandler} from '../examples/http/group-invitations.ts';

const id = '10000000-0000-0000-0000-000000000001', groupId = '20000000-0000-0000-0000-000000000001';
const bytes = new TextEncoder().encode('%PDF-1.7\nsynthetic download fixture');
test('invitation fragment is taken into memory, stripped even if invalid, and never interpreted as an auth callback', () => {
  const token = 'a'.repeat(64);
  assert.deepEqual(takePortalInvitation('https://library.example/portal.html#invite=' + token), {url: 'https://library.example/portal.html', token});
  assert.deepEqual(takePortalInvitation('https://library.example/portal.html#invite=invalid'), {url: 'https://library.example/portal.html'});
  const callback = takePortalInvitation('https://library.example/portal.html?code=synthetic#invite=' + token + '&access_token=synthetic');
  assert.equal(callback.token, token); assert.ok(callback.url.includes('code=synthetic')); assert.ok(callback.url.includes('#access_token=synthetic')); assert.ok(!callback.url.includes('invite='));
});
test('service client uses binary bodies and verifies server file identity, size and digest before download', async () => {
  const media = await describePortalMedia('lesson.pdf', bytes, id);
  const calls: {name: string; options: unknown}[] = [];
  let corrupt = false;
  const services = portalServices({async invoke(name, options) {
    calls.push({name, options});
    if (options.method === 'GET') return {error: null, data: new Blob([corrupt ? new Uint8Array(bytes.length) : bytes]), response: new Response(null, {headers: {'X-Library-Media': encodeURIComponent(JSON.stringify(media))}})};
    return {error: null, data: media};
  }});
  assert.deepEqual(await services.media.upload({name: 'lesson.pdf', bytes}), media);
  assert.deepEqual((calls[0].options as {body: ArrayBuffer}).body, bytes.buffer);
  assert.deepEqual((await services.media.download(id)).bytes, bytes);
  corrupt = true; await assert.rejects(services.media.download(id), /contents match|did not match/u);
});
test('invitation receipt cannot substitute another group or leak provider errors', async () => {
  const wrong = portalServices({async invoke() { return {error: null, data: {id, groupId: id, email: 'learner@example.invalid', status: 'pending', expiresAt: '2026-11-01T00:00:00.000Z'}}; }});
  await assert.rejects(wrong.groupDelivery.inviteLearner(groupId, 'learner@example.invalid'), /invalid receipt/u);
  const failed = portalServices({async invoke() { return {error: {message: 'PRIVATE_PROVIDER_SECRET'}, data: null}; }});
  await assert.rejects(failed.groupDelivery.inviteLearner(groupId, 'learner@example.invalid'), error => error instanceof Error && !error.message.includes('PRIVATE_PROVIDER_SECRET'));
});
test('demo media is admin uploaded, detached, bound to a published attachment and cleared by a fresh demonstration', async () => {
  const portal = createDemoPortal();
  portal.setDemoRole('learner'); await assert.rejects(portal.media!.upload({name: 'lesson.pdf', bytes}), /Only an assigned admin/u);
  portal.setDemoRole('admin'); const media = await portal.media!.upload({name: 'lesson.pdf', bytes});
  portal.setDemoRole('learner'); await assert.rejects(portal.media!.download(media.id), /not available/u);
  portal.setDemoRole('admin'); const course = (await portal.listCourses())[0];
  const published = await portal.saveCourse({...course, lessons: [{...course.lessons[0], attachment: media, mediaType: 'document'}]}, course.revision);
  portal.setDemoRole('learner'); const download = await portal.media!.download(media.id); assert.deepEqual(download.bytes, bytes);
  download.bytes.fill(0); assert.deepEqual((await portal.media!.download(media.id)).bytes, bytes);
  const fresh = createDemoPortal(); fresh.setDemoRole('admin'); await assert.rejects(fresh.media!.download(media.id), /no longer available/u);
  portal.setDemoRole('admin'); await assert.rejects(portal.saveCourse({...published, lessons: [{...published.lessons[0], attachment: {...media, id}}]}, published.revision), /Upload the library file/u);
});

test('pinned SDK connects function clients to Fetch handlers with binary downloads and explicit invitation delivery', async () => {
  let stored: Awaited<ReturnType<typeof describePortalMedia>> | undefined;
  let storedBytes = new Uint8Array(0), delivered = 0;
  const paths: string[] = [];
  const authenticate = async (request: Request) => request.headers.get('Authorization') === 'Bearer synthetic-staff-token' ? {id, role: 'admin' as const} : null;
  const mediaHandler = createLibraryMediaHandler({portalUrl: 'https://library.example/portal.html', authenticate,
    scan: async () => 'clean', store: {
      async put(actor, media, body) { assert.equal(actor, id); stored = media; storedBytes = new Uint8Array(body); },
      async get(actor, target) { assert.equal(actor, id); return stored?.id === target ? {media: stored, bytes: storedBytes} : null; },
    }});
  const invitationHandler = createGroupInvitationHandler({portalUrl: 'https://library.example/portal.html', authenticate,
    invitations: {
      async create(actor, group, email, digest) {
        assert.equal(actor, id); assert.equal(group, groupId); assert.match(digest, /^[a-f0-9]{64}$/u);
        return {id, groupId, email, status: 'pending', expiresAt: '2026-11-01T00:00:00.000Z'};
      },
      async revoke() { throw new Error('Successful synthetic delivery should not revoke.'); },
    },
    async sendEmail(message) { delivered++; assert.equal(message.to, 'learner@example.invalid'); assert.ok(message.text.includes('#invite=')); },
  });
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init), path = new URL(request.url).pathname;
    paths.push(path);
    if (path === '/functions/v1/library-media') return mediaHandler(request);
    if (path === '/functions/v1/group-invitations') return invitationHandler(request);
    throw new Error('Unexpected synthetic endpoint.');
  };
  const sdk = createClient('https://project.supabase.co', 'sb_publishable_synthetic_key', {
    accessToken: async () => 'synthetic-staff-token', global: {fetch: boundedJsonFetch({fetch: fetcher, maxResponseBytes: 4 * 1024 * 1024, timeoutMs: 1000})},
  });
  const service = portalServices(sdk.functions);
  const media = await service.media.upload({name: 'lesson.pdf', bytes});
  assert.deepEqual((await service.media.download(media.id)).bytes, bytes);
  assert.equal((await service.groupDelivery.inviteLearner(groupId, 'learner@example.invalid')).status, 'pending');
  assert.equal(delivered, 1);
  assert.deepEqual(paths, ['/functions/v1/library-media', '/functions/v1/library-media', '/functions/v1/group-invitations']);
});
