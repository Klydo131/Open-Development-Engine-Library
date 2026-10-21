/** Optional server-side reference policy. Never use imported classroom files as this repository. */
export type EducationAction = 'read' | 'export' | 'download' | 'feedback';
export type EducationRole = 'learner' | 'teacher';
export type ClassroomResource = {
  id: string;
  tenantId: string;
  courseId: string;
  kind: 'brief' | 'submission' | 'feedback' | 'personal-journal';
  status: 'active' | 'revoked';
  /** Required for submissions and feedback; identifies the learner whose selected work was shared. */
  learnerId?: string;
};
export type ClassroomMembership = {
  actorId: string;
  tenantId: string;
  courseId: string;
  role: EducationRole;
  status: 'active' | 'revoked';
};
export type ClassroomCourse = {
  id: string;
  tenantId: string;
  status: 'active' | 'archived';
  tenantStatus: 'active' | 'suspended';
};
export interface EducationAuthorizationRepository {
  getActor(actorId: string): Promise<{id: string; status: 'active' | 'disabled'} | null>;
  getResource(resourceId: string): Promise<ClassroomResource | null>;
  getCourse(courseId: string): Promise<ClassroomCourse | null>;
  getMembership(actorId: string, tenantId: string, courseId: string): Promise<ClassroomMembership | null>;
  isAssignedTeacher(actorId: string, tenantId: string, courseId: string, learnerId: string): Promise<boolean>;
}
export type EducationAccess = Readonly<{
  actorId: string;
  resourceId: string;
  resourceKind: 'brief' | 'submission' | 'feedback';
  action: EducationAction;
  tenantId: string;
  courseId: string;
  role: EducationRole;
  learnerId?: string;
}>;
export class EducationAccessDenied extends Error {
  constructor() { super('Education access denied.'); this.name = 'EducationAccessDenied'; }
}
function deny(): never { throw new EducationAccessDenied(); }
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128
    && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9_-]/.test(value);
}
function activeMembership(value: ClassroomMembership | null, actorId: string, tenantId: string, courseId: string): value is ClassroomMembership {
  return !!value && value.actorId === actorId && value.tenantId === tenantId && value.courseId === courseId
    && value.status === 'active' && (value.role === 'learner' || value.role === 'teacher');
}

/**
 * Authenticate actorId on the server before calling. Run this and the protected operation in
 * the same trusted transaction/snapshot. The returned object is not a reusable capability.
 */
export async function assertEducationAccess(repository: EducationAuthorizationRepository, request: unknown): Promise<EducationAccess> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return deny();
  const input = request as Record<string, unknown>;
  if (Object.keys(input).length !== 3 || Object.keys(input).some(key => !['actorId', 'resourceId', 'action'].includes(key))) return deny();
  const {actorId, resourceId, action} = input;
  if (!id(actorId) || !id(resourceId) || !['read', 'export', 'download', 'feedback'].includes(action as string)) return deny();
  const actor = await repository.getActor(actorId);
  if (!actor || actor.id !== actorId || actor.status !== 'active') return deny();
  const resource = await repository.getResource(resourceId);
  if (!resource || resource.id !== resourceId || resource.status !== 'active'
    || !id(resource.tenantId) || !id(resource.courseId)
    || !['brief', 'submission', 'feedback'].includes(resource.kind)) return deny();
  const course = await repository.getCourse(resource.courseId);
  if (!course || course.id !== resource.courseId || course.tenantId !== resource.tenantId
    || course.status !== 'active' || course.tenantStatus !== 'active') return deny();
  const membership = await repository.getMembership(actorId, resource.tenantId, resource.courseId);
  if (!activeMembership(membership, actorId, resource.tenantId, resource.courseId)) return deny();

  if (resource.kind === 'brief') {
    if (action === 'feedback') return deny();
  } else {
    if (!id(resource.learnerId)) return deny();
    if (membership.role === 'learner') {
      if (resource.learnerId !== actorId || action === 'feedback') return deny();
    } else {
      const learner = await repository.getMembership(resource.learnerId, resource.tenantId, resource.courseId);
      if (!activeMembership(learner, resource.learnerId, resource.tenantId, resource.courseId) || learner.role !== 'learner'
        || await repository.isAssignedTeacher(actorId, resource.tenantId, resource.courseId, resource.learnerId) !== true) return deny();
      // Feedback is created against a selected submission, never another feedback record.
      if (action === 'feedback' && resource.kind !== 'submission') return deny();
    }
  }
  return Object.freeze({
    actorId, resourceId, resourceKind: resource.kind as EducationAccess['resourceKind'],
    action: action as EducationAction, tenantId: resource.tenantId, courseId: resource.courseId,
    role: membership.role, ...(resource.kind !== 'brief' ? {learnerId: resource.learnerId} : {})
  });
}
