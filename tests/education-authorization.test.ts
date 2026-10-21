import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEducationAccess, EducationAccessDenied,
  type EducationAuthorizationRepository, type ClassroomMembership, type ClassroomResource, type ClassroomCourse
} from '../packages/education/src/authorization.ts';

function fixture() {
  const actors = new Map(['learnerA', 'learnerB', 'teacherA', 'teacherOther', 'teacherB'].map(id => [id, {id, status: 'active' as 'active' | 'disabled'}]));
  const courses = new Map<string, ClassroomCourse>([
    ['courseA', {id: 'courseA', tenantId: 'tenantA', status: 'active', tenantStatus: 'active'}],
    ['courseB', {id: 'courseB', tenantId: 'tenantB', status: 'active', tenantStatus: 'active'}]
  ]);
  const memberships = new Map<string, ClassroomMembership>();
  for (const [actorId, role, courseId, tenantId] of [
    ['learnerA', 'learner', 'courseA', 'tenantA'], ['learnerB', 'learner', 'courseA', 'tenantA'],
    ['teacherA', 'teacher', 'courseA', 'tenantA'], ['teacherOther', 'teacher', 'courseB', 'tenantB'],
    ['teacherB', 'teacher', 'courseA', 'tenantA']
  ] as const) memberships.set(`${actorId}:${courseId}`, {actorId, role, courseId, tenantId, status: 'active'});
  const resources = new Map<string, ClassroomResource>([
    ['briefA', {id: 'briefA', tenantId: 'tenantA', courseId: 'courseA', kind: 'brief', status: 'active'}],
    ['workA', {id: 'workA', tenantId: 'tenantA', courseId: 'courseA', kind: 'submission', status: 'active', learnerId: 'learnerA'}],
    ['feedbackA', {id: 'feedbackA', tenantId: 'tenantA', courseId: 'courseA', kind: 'feedback', status: 'active', learnerId: 'learnerA'}],
    ['journalA', {id: 'journalA', tenantId: 'tenantA', courseId: 'courseA', kind: 'personal-journal', status: 'active', learnerId: 'learnerA'}]
  ]);
  const repository: EducationAuthorizationRepository = {
    getActor: async actorId => actors.get(actorId) ?? null,
    getResource: async resourceId => resources.get(resourceId) ?? null,
    getCourse: async courseId => courses.get(courseId) ?? null,
    getMembership: async (actorId, tenantId, courseId) => {
      const value = memberships.get(`${actorId}:${courseId}`);
      return value?.tenantId === tenantId ? value : null;
    },
    isAssignedTeacher: async (actorId, tenantId, courseId, learnerId) => actorId === 'teacherA' && tenantId === 'tenantA' && courseId === 'courseA' && learnerId === 'learnerA'
  };
  return {repository, actors, courses, memberships, resources};
}
const request = (actorId: string, resourceId = 'workA', action = 'read') => ({actorId, resourceId, action});
const denied = (repository: EducationAuthorizationRepository, input: unknown) => assert.rejects(assertEducationAccess(repository, input), EducationAccessDenied);

test('learners access their own selected submissions and feedback, never another learner work', async () => {
  const {repository} = fixture();
  for (const action of ['read', 'export', 'download']) {
    assert.equal((await assertEducationAccess(repository, request('learnerA', 'workA', action))).learnerId, 'learnerA');
    await denied(repository, request('learnerB', 'workA', action));
  }
  await assertEducationAccess(repository, request('learnerA', 'feedbackA'));
  await denied(repository, request('learnerA', 'workA', 'feedback'));
});

test('only the assigned teacher can read, export, download, and give feedback on a submission', async () => {
  const {repository} = fixture();
  for (const action of ['read', 'export', 'download', 'feedback']) {
    const grant = await assertEducationAccess(repository, request('teacherA', 'workA', action));
    assert.equal(grant.role, 'teacher');
    assert.equal(Object.isFrozen(grant), true);
    await denied(repository, request('teacherB', 'workA', action));
    await denied(repository, request('teacherOther', 'workA', action));
  }
  await denied(repository, request('teacherA', 'feedbackA', 'feedback'));
});

test('briefs are shared only with active course members and cannot receive submission feedback', async () => {
  const {repository} = fixture();
  for (const actor of ['learnerA', 'learnerB', 'teacherA', 'teacherB']) await assertEducationAccess(repository, request(actor, 'briefA'));
  await denied(repository, request('teacherOther', 'briefA'));
  await denied(repository, request('teacherA', 'briefA', 'feedback'));
});

test('personal journals are outside classroom authority for learners and teachers on every path', async () => {
  const {repository} = fixture();
  for (const actor of ['learnerA', 'teacherA']) for (const action of ['read', 'export', 'download', 'feedback']) await denied(repository, request(actor, 'journalA', action));
});

test('request roles, tenant claims, unknown actions and malformed opaque identifiers are rejected', async () => {
  const {repository} = fixture();
  for (const input of [
    {...request('learnerB'), role: 'teacher'}, {...request('learnerB'), tenantId: 'tenantA'},
    request('teacherA', 'workA', 'delete'), request('teacherA', '../workA'), request('', 'workA'),
    null, [], {}, {actorId: 'teacherA', resourceId: 'workA'}
  ]) await denied(repository, input);
});

test('account disable, membership revocation, missing membership and resource withdrawal fail closed', async () => {
  for (const modify of [
    (f: ReturnType<typeof fixture>) => { f.actors.get('teacherA')!.status = 'disabled'; },
    (f: ReturnType<typeof fixture>) => { f.memberships.get('teacherA:courseA')!.status = 'revoked'; },
    (f: ReturnType<typeof fixture>) => { f.memberships.delete('teacherA:courseA'); },
    (f: ReturnType<typeof fixture>) => { f.memberships.get('learnerA:courseA')!.status = 'revoked'; },
    (f: ReturnType<typeof fixture>) => { f.resources.get('workA')!.status = 'revoked'; },
    (f: ReturnType<typeof fixture>) => { f.courses.get('courseA')!.status = 'archived'; },
    (f: ReturnType<typeof fixture>) => { f.courses.get('courseA')!.tenantStatus = 'suspended'; }
  ]) {
    const f = fixture(); modify(f);
    await denied(f.repository, request('teacherA', 'workA', 'download'));
  }
});

test('cross-tenant/course records and inconsistent trusted repository identities are rejected', async () => {
  const f = fixture();
  f.resources.get('workA')!.tenantId = 'tenantB';
  await denied(f.repository, request('teacherA'));
  f.resources.get('workA')!.tenantId = 'tenantA';
  f.memberships.get('teacherA:courseA')!.courseId = 'courseB';
  await denied(f.repository, request('teacherA'));
  f.memberships.get('teacherA:courseA')!.courseId = 'courseA';
  f.repository.getResource = async () => ({...f.resources.get('workA')!, id: 'different'});
  await denied(f.repository, request('teacherA'));
});

test('repository failures never produce a grant and missing resources use the same denied error', async () => {
  const {repository} = fixture();
  await denied(repository, request('teacherA', 'missing'));
  repository.getMembership = async () => { throw new Error('database unavailable'); };
  await assert.rejects(assertEducationAccess(repository, request('teacherA')), /database unavailable/);
});

test('invalid actor and resource identifiers fail before any repository lookup', async () => {
  let lookups=0;
  const {repository}=fixture();
  repository.getActor=async()=>{lookups++;throw new Error('Must not reach repository');};
  for(const value of ['teacherA\n','teacherA\r','teacherA\t','teacherA ','teacherＡ','a'.repeat(129),'_teacher','']){
    await denied(repository,request(value));
    await denied(repository,request('teacherA',value));
  }
  assert.equal(lookups,0);
});
