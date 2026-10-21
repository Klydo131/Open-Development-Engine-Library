import {
  PortalConflict, portalEmail, portalId, portalPassword, validateCourse, validateCourseList,
  validateSupportList, validateSupportQuestion, validateSupportReply,
  type CoursePortal, type PortalAccount,
} from '../../packages/portal/src/index.ts';

type Result = {data?: unknown; error: unknown};
type AuthUser = {id: string; email?: string; is_anonymous?: boolean; email_confirmed_at?: string};
/** Narrow, structurally compatible supabase-js port. Supply a pinned official SDK
 * client configured only with a publishable key; never a secret/service-role key.
 */
export interface SupabasePortalClient {
  auth: {
    getUser(): PromiseLike<{data: {user: AuthUser | null}; error: unknown}>;
    signUp(credentials: {email: string; password: string; options: {emailRedirectTo: string}}): PromiseLike<Result>;
    signInWithPassword(credentials: {email: string; password: string}): PromiseLike<Result>;
    resetPasswordForEmail(email: string, options: {redirectTo: string}): PromiseLike<Result>;
    updateUser(attributes: {password: string}): PromiseLike<Result>;
    signOut(): PromiseLike<Result>;
    onAuthStateChange(callback: (event: string, session: unknown) => void): {data: {subscription: {unsubscribe(): void}}};
  };
  rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}>;
}
function redirect(value: string): string {
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) throw new Error('Use an exact trusted HTTPS account redirect URL.');
  return url.href;
}
function code(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
/** Original optional adapter. Auth/account data never enters the private vault. */
export function supabaseCoursePortal(client: SupabasePortalClient, options: {redirectTo: string}): CoursePortal & {dispose(): void} {
  const redirectTo = redirect(options.redirectTo);
  const listeners = new Set<() => void>();
  let recovery = false;
  function changed() { for (const listener of listeners) listener(); }
  // Keep this callback synchronous: Supabase warns against awaiting auth calls here.
  const subscription = client.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') recovery = false;
    changed();
  }).data.subscription;
  async function rpc(name: string, parameters?: Record<string, unknown>) {
    const result = await client.rpc(name, parameters);
    if (result.error) {
      if (code(result.error) === '40001' || code(result.error) === '23505') throw new PortalConflict();
      throw new Error('The course service could not complete this request. Check your connection and permissions.');
    }
    return result.data;
  }
  async function account(): Promise<PortalAccount> {
    const result = await client.auth.getUser();
    if (result.error) {
      const name = typeof result.error === 'object' && result.error !== null && 'name' in result.error ? result.error.name : '';
      if (name !== 'AuthSessionMissingError') throw new Error('Account verification is unavailable. Please try again.');
    }
    const user = result.data.user;
    if (!user) return Object.freeze({user: null, recovery: false});
    if (user.is_anonymous || !user.email_confirmed_at || !user.email) throw new Error('Confirm your email before using the course account.');
    const role = await rpc('portal_role');
    if (role !== 'learner' && role !== 'admin') throw new Error('A confirmed course account is required.');
    return Object.freeze({user: Object.freeze({id: portalId(user.id), email: portalEmail(user.email), role}), recovery});
  }
  async function checkedAuth(result: PromiseLike<Result>, message: string) { if ((await result).error) throw new Error(message); }
  return {
    kind: 'supabase', account,
    onAccountChange(listener) { listeners.add(listener); return () => {listeners.delete(listener);}; },
    async signUp(email, password) {
      await checkedAuth(client.auth.signUp({email: portalEmail(email), password: portalPassword(password), options: {emailRedirectTo: redirectTo}}), 'The account request could not be completed. Try again later.');
    },
    async signIn(email, password) {
      // Permit existing provider passwords without imposing a new creation policy.
      if (typeof password !== 'string' || password.length < 1 || password.length > 128) throw new Error('Check your email and password.');
      await checkedAuth(client.auth.signInWithPassword({email: portalEmail(email), password}), 'Sign-in failed. Check your email, password and confirmation message.');
      recovery = false; changed();
    },
    async requestPasswordReset(email) {
      const checkedEmail = portalEmail(email);
      // Do not return provider errors or account-existence details to the UI.
      // A provider rate-limit/network failure still uses the same generic result;
      // the UI must say "If the address can receive a reset, check your email."
      try { await client.auth.resetPasswordForEmail(checkedEmail, {redirectTo}); } catch { /* generic response prevents account enumeration */ }
    },
    async updatePassword(password) {
      if (!recovery || !(await account()).user) throw new Error('Open the password recovery link from your email first.');
      await checkedAuth(client.auth.updateUser({password: portalPassword(password)}), 'The password could not be updated. Request a new recovery link and try again.');
      recovery = false; changed();
    },
    async signOut() {
      await checkedAuth(client.auth.signOut(), 'Sign-out could not be completed. Try again.');
      recovery = false; changed();
    },
    async listCourses() { return validateCourseList(await rpc('portal_list_courses')); },
    async saveCourse(course, expectedRevision) {
      const checked = validateCourse(course);
      if (checked.status === 'published' && !checked.lessons.length) throw new Error('Add learning material before publishing.');
      if (checked.status === 'published' && checked.lessons.some(lesson => (!lesson.text.trim() && !lesson.sourceUrl) || !lesson.credit.trim() || !lesson.rights.trim())) throw new Error('Published materials need content, source credit and a rights statement.');
      return validateCourse(await rpc('portal_save_course', {p_course: checked, p_expected_revision: expectedRevision === null ? null : portalId(expectedRevision)}));
    },
    async getSupport() { return validateSupportList(await rpc('portal_support')); },
    async askSupport(question) { await rpc('portal_ask_support', {p_question: validateSupportQuestion(question)}); },
    async replySupport(id, reply, expectedRevision) { await rpc('portal_reply_support', {p_id: portalId(id), p_reply: validateSupportReply(reply), p_expected_revision: portalId(expectedRevision)}); },
    dispose() { subscription.unsubscribe(); listeners.clear(); recovery = false; },
  };
}
