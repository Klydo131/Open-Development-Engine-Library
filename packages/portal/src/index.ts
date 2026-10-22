/** Optional hosted course catalog. Never contains a learner's encrypted private room. */
export type PortalUser = Readonly<{id: string; email: string; role: 'learner' | 'admin'}>;
export type PortalAccount = Readonly<{user: PortalUser | null; recovery: boolean}>;
export type Material = Readonly<{id: string; title: string; text: string; sourceUrl: string; credit: string; rights: string}>;
export type Course = Readonly<{id: string; revision: string; title: string; summary: string; language: string; status: 'draft' | 'published'; lessons: readonly Material[]}>;
export type SupportThread = Readonly<{id: string; learnerId: string; courseId?: string; subject: string; message: string; reply: string; status: 'open' | 'answered'; revision: string}>;
export type SupportQuestion = Readonly<{courseId?: string; subject: string; message: string}>;
export interface CoursePortal {
  readonly kind: string;
  account(): Promise<PortalAccount>;
  onAccountChange(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  listCourses(): Promise<readonly Course[]>;
  saveCourse(course: Course, expectedRevision: string | null): Promise<Course>;
  getSupport(): Promise<readonly SupportThread[]>;
  askSupport(question: SupportQuestion): Promise<void>;
  replySupport(id: string, reply: string, expectedRevision: string): Promise<void>;
}
export const PORTAL_LIMITS = Object.freeze({courseBytes: 262144, materialText: 20000, materials: 50, courses: 100, supportThreads: 100, responseBytes: 4 * 1024 * 1024});
export class PortalConflict extends Error { constructor() { super('This record changed. Refresh it before saving your changes.'); this.name = 'PortalConflict'; } }
function fail(): never { throw new Error('Invalid or oversized course portal record.'); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  const result = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => !required.includes(key) && !optional.includes(key))) return fail();
  return result;
}
function text(value: unknown, max: number, nonempty = false): string {
  // oxlint-disable-next-line no-control-regex -- Reject C0/DEL while allowing ordinary tab, newline and carriage return in lesson text.
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail();
  return value;
}
export function portalId(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return fail();
  return value.toLowerCase();
}
export function portalEmail(value: unknown): string {
  const email = text(value, 254, true).trim();
  // oxlint-disable-next-line no-control-regex -- Email addresses must not contain C0 controls or DEL.
  if (/[\s\u0000-\u001f\u007f]/u.test(email) || !/^[^@]+@[^@]+\.[^@]+$/u.test(email)) return fail();
  return email;
}
export function portalPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128 || !value.trim()) throw new Error('Use an account password between 15 and 128 characters.');
  return value;
}
export function portalSourceUrl(value: unknown): string {
  const raw = text(value, 2048);
  if (!raw) return '';
  // oxlint-disable-next-line no-control-regex -- Reject invisible C0/DEL bytes before URL parsing can normalize them.
  if (raw !== raw.trim() || /[\s\u0000-\u001f\u007f]/u.test(raw)) return fail();
  let url: URL;
  try { url = new URL(raw); } catch { return fail(); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return fail();
  return url.href;
}
function bytes(value: unknown, maximum: number) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) fail();
}
export function validateCourse(value: unknown): Course {
  const row = object(value, ['id', 'revision', 'title', 'summary', 'language', 'status', 'lessons']);
  if (!Array.isArray(row.lessons) || row.lessons.length > PORTAL_LIMITS.materials || !['draft', 'published'].includes(row.status as string)) return fail();
  const language = text(row.language, 35, true);
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language) || /[\r\n]/u.test(language)) return fail();
  const ids = new Set<string>();
  const lessons = row.lessons.map(item => {
    const material = object(item, ['id', 'title', 'text', 'sourceUrl', 'credit', 'rights']);
    const id = portalId(material.id); if (ids.has(id)) return fail(); ids.add(id);
    return Object.freeze({id, title: text(material.title, 160, true), text: text(material.text, PORTAL_LIMITS.materialText), sourceUrl: portalSourceUrl(material.sourceUrl), credit: text(material.credit, 500), rights: text(material.rights, 500)});
  });
  const course: Course = Object.freeze({id: portalId(row.id), revision: portalId(row.revision), title: text(row.title, 160, true), summary: text(row.summary, 2000, true), language, status: row.status as Course['status'], lessons: Object.freeze(lessons)});
  bytes(course, PORTAL_LIMITS.courseBytes); return course;
}
export function validateSupportQuestion(value: unknown): SupportQuestion {
  const row = object(value, ['subject', 'message'], ['courseId']);
  return Object.freeze({...('courseId' in row ? {courseId: portalId(row.courseId)} : {}), subject: text(row.subject, 160, true), message: text(row.message, 5000, true)});
}
export function validateSupportThread(value: unknown): SupportThread {
  const row = object(value, ['id', 'learnerId', 'subject', 'message', 'reply', 'status', 'revision'], ['courseId']);
  if (!['open', 'answered'].includes(row.status as string)) return fail();
  const question = validateSupportQuestion({subject: row.subject, message: row.message, ...('courseId' in row ? {courseId: row.courseId} : {})});
  const reply = text(row.reply, 5000);
  if ((row.status === 'answered') !== Boolean(reply.trim())) return fail();
  return Object.freeze({id: portalId(row.id), learnerId: portalId(row.learnerId), ...question, reply, status: row.status as SupportThread['status'], revision: portalId(row.revision)});
}
export function validateSupportReply(value: unknown): string { return text(value, 5000, true); }
export function validateCourseList(value: unknown): readonly Course[] {
  if (!Array.isArray(value) || value.length > PORTAL_LIMITS.courses) return fail();
  const courses = value.map(validateCourse); if (new Set(courses.map(row => row.id)).size !== courses.length) return fail();
  bytes(courses, PORTAL_LIMITS.responseBytes); return Object.freeze(courses);
}
export function validateSupportList(value: unknown): readonly SupportThread[] {
  if (!Array.isArray(value) || value.length > PORTAL_LIMITS.supportThreads) return fail();
  const rows = value.map(validateSupportThread); if (new Set(rows.map(row => row.id)).size !== rows.length) return fail();
  bytes(rows, PORTAL_LIMITS.responseBytes); return Object.freeze(rows);
}
