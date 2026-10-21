/** Optional adapter. No accounts, networking, storage, tracking or cryptography. */
export const EDUCATION_EXTENSION = 'org.openlearningrooms.education';
export const MAX_EDUCATION_BYTES = 8 * 1024 * 1024;
export const MAX_EXCHANGE_BYTES = 256 * 1024;
export const MAX_EDUCATION_NODES = 45000;
export type SourceCredit = Readonly<{title: string; url: string; creator: string; license: string}>;
export type Brief = Readonly<{
  id: string; version: number; title: string; goal: string; task: string; example: string;
  successChecklist: readonly string[]; sources: readonly SourceCredit[]; language: string;
}>;
export type Attempt = Readonly<{
  id: string; revision: number; briefId: string; briefVersion: number;
  answer: string; question: string; nextAction: string; reviewDate?: string;
}>;
export type Submission = Readonly<{
  id: string; attemptId: string; attemptRevision: number; brief: Brief; answer: string; question: string;
}>;
export type FeedbackContent = Readonly<{
  id: string; submissionId: string; attemptId: string; attemptRevision: number;
  briefId: string; briefVersion: number; strength: string; nextAction: string; question: string;
}>;
export type Feedback = FeedbackContent & Readonly<{provenance: 'local' | 'imported-unverified'}>;
export type EducationState = Readonly<{
  version: 1; briefs: readonly Brief[]; attempts: readonly Attempt[];
  submissions: readonly Submission[]; feedback: readonly Feedback[];
}>;
export type Exchange = Readonly<{format: 'olr-education'; version: 1; recipient: string}> & (
  Readonly<{kind: 'brief'; payload: Brief}> |
  Readonly<{kind: 'submission'; payload: Submission}> |
  Readonly<{kind: 'feedback'; payload: FeedbackContent}>
);
type ObjectValue = Record<string, unknown>;
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function fail(message = 'Invalid education record.'): never { throw new Error(message); }
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const item = value as ObjectValue;
  if (Object.keys(item).some(key => !keys.includes(key) && !optional.includes(key)) || keys.some(key => !Object.hasOwn(item, key))) fail('Unexpected or missing education field.');
  return item;
}
function text(value: unknown, max: number, required = false): string {
  // oxlint-disable-next-line no-control-regex -- Reject C0/DEL while preserving ordinary tab, newline and carriage return in study text.
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (required && !value.trim())) fail('Invalid or oversized education text.');
  return value;
}
function id(value: unknown): string {
  const result = text(value, 80, true);
  if (!/^[A-Za-z0-9]/u.test(result) || /[^A-Za-z0-9._:-]/u.test(result)) fail('Use a bounded education identifier.');
  return result;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100000) fail('Unsupported education revision.');
  return value as number;
}
function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) fail('Education capacity exceeded.');
  return value.map(parse);
}
function source(value: unknown): SourceCredit {
  const item = record(value, ['title', 'url', 'creator', 'license']);
  const url = text(item.url, 2048);
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return fail('Use a complete http or https source link.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.href !== url) fail('Use a canonical http or https source link without credentials.');
  }
  return {title: text(item.title, 200, true), url, creator: text(item.creator, 200), license: text(item.license, 200)};
}
function brief(value: unknown): Brief {
  const item = record(value, ['id', 'version', 'title', 'goal', 'task', 'example', 'successChecklist', 'sources', 'language']);
  const language = text(item.language, 60, true);
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language) || /[^A-Za-z0-9-]/u.test(language)) fail('Use a language tag such as en or fil.');
  const successChecklist = list(item.successChecklist, 20, value => text(value, 500, true));
  if (!successChecklist.length) fail('A learning brief needs at least one success check.');
  return {id: id(item.id), version: revision(item.version), title: text(item.title, 200, true), goal: text(item.goal, 2000, true), task: text(item.task, 12000, true), example: text(item.example, 12000), successChecklist, sources: list(item.sources, 20, source), language};
}
function attempt(value: unknown): Attempt {
  const item = record(value, ['id', 'revision', 'briefId', 'briefVersion', 'answer', 'question', 'nextAction'], ['reviewDate']);
  let reviewDate: string | undefined;
  if (item.reviewDate !== undefined) {
    reviewDate = text(item.reviewDate, 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewDate) || !Number.isFinite(Date.parse(reviewDate)) || new Date(reviewDate).toISOString().slice(0, 10) !== reviewDate) fail('Use a valid review date.');
  }
  return {id: id(item.id), revision: revision(item.revision), briefId: id(item.briefId), briefVersion: revision(item.briefVersion), answer: text(item.answer, 20000), question: text(item.question, 5000), nextAction: text(item.nextAction, 5000), ...(reviewDate ? {reviewDate} : {})};
}
function submission(value: unknown): Submission {
  const item = record(value, ['id', 'attemptId', 'attemptRevision', 'brief', 'answer', 'question']);
  return {id: id(item.id), attemptId: id(item.attemptId), attemptRevision: revision(item.attemptRevision), brief: brief(item.brief), answer: text(item.answer, 20000), question: text(item.question, 5000)};
}
function feedbackContent(value: unknown): FeedbackContent {
  const item = record(value, ['id', 'submissionId', 'attemptId', 'attemptRevision', 'briefId', 'briefVersion', 'strength', 'nextAction', 'question']);
  return {id: id(item.id), submissionId: id(item.submissionId), attemptId: id(item.attemptId), attemptRevision: revision(item.attemptRevision), briefId: id(item.briefId), briefVersion: revision(item.briefVersion), strength: text(item.strength, 5000), nextAction: text(item.nextAction, 5000, true), question: text(item.question, 5000)};
}
function feedback(value: unknown): Feedback {
  const item = record(value, ['id', 'submissionId', 'attemptId', 'attemptRevision', 'briefId', 'briefVersion', 'strength', 'nextAction', 'question', 'provenance']);
  if (item.provenance !== 'local' && item.provenance !== 'imported-unverified') fail('Invalid feedback provenance.');
  const {provenance, ...content} = item;
  return {...feedbackContent(content), provenance};
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child));
    Object.freeze(value);
  }
  return value;
}
function boundedNodes(value: unknown, budget: {remaining: number}): void {
  if (--budget.remaining < 0) fail('Education record capacity exceeded.');
  if (value && typeof value === 'object') Object.values(value).forEach(child => boundedNodes(child, budget));
}
function unique<T>(items: readonly T[], key: (item: T) => string): void {
  if (new Set(items.map(key)).size !== items.length) fail('Duplicate education record.');
}
function boundFeedback(item: FeedbackContent, target: Submission): void {
  if (item.submissionId !== target.id || item.attemptId !== target.attemptId || item.attemptRevision !== target.attemptRevision || item.briefId !== target.brief.id || item.briefVersion !== target.brief.version) fail('Feedback does not match this exact submission and learning brief.');
}
/** Validates every record and relationship, detaches values, then freezes the result. */
export function validateEducation(value: unknown): EducationState {
  const item = record(value, ['version', 'briefs', 'attempts', 'submissions', 'feedback']);
  if (item.version !== 1) fail('Unsupported education state version.');
  const result: EducationState = {version: 1, briefs: list(item.briefs, 200, brief), attempts: list(item.attempts, 400, attempt), submissions: list(item.submissions, 400, submission), feedback: list(item.feedback, 400, feedback)};
  unique(result.briefs, value => `${value.id}/${value.version}`);
  unique(result.attempts, value => `${value.id}/${value.revision}`);
  unique(result.submissions, value => value.id);
  unique(result.feedback, value => value.id);
  const briefs = new Map(result.briefs.map(value => [`${value.id}/${value.version}`, value]));
  const attempts = new Map(result.attempts.map(value => [`${value.id}/${value.revision}`, value]));
  const submissions = new Map(result.submissions.map(value => [value.id, value]));
  for (const entry of result.attempts) {
    if (!briefs.has(`${entry.briefId}/${entry.briefVersion}`)) fail('Attempt references a missing learning brief version.');
    if (entry.revision > 1 && !attempts.has(`${entry.id}/${entry.revision - 1}`)) fail('Keep the original attempt revision.');
    const previous = attempts.get(`${entry.id}/${entry.revision - 1}`);
    if (previous && previous.briefId !== entry.briefId) fail('An attempt cannot change to an unrelated brief.');
  }
  for (const entry of result.submissions) {
    if (!same(briefs.get(`${entry.brief.id}/${entry.brief.version}`), entry.brief)) fail('Submission learning brief snapshot conflicts with the library.');
    const original = attempts.get(`${entry.attemptId}/${entry.attemptRevision}`);
    if (original && (original.briefId !== entry.brief.id || original.briefVersion !== entry.brief.version || original.answer !== entry.answer || original.question !== entry.question)) fail('Submission conflicts with the exact private attempt.');
  }
  for (const entry of result.feedback) {
    const target = submissions.get(entry.submissionId);
    if (!target) fail('Import the selected submission before its feedback.');
    boundFeedback(entry, target);
  }
  boundedNodes(result, {remaining: MAX_EDUCATION_NODES});
  if (bytes(JSON.stringify(result)) > MAX_EDUCATION_BYTES) fail('Education storage capacity exceeded.');
  return freeze(result);
}
export const emptyEducation = (): EducationState => validateEducation({version: 1, briefs: [], attempts: [], submissions: [], feedback: []});
export function addBrief(state: EducationState, input: Brief): EducationState {
  const current = validateEducation(state), value = brief(input);
  const versions = current.briefs.filter(item => item.id === value.id).map(item => item.version);
  if (versions.includes(value.version)) fail('This brief version already exists. Create a new version instead.');
  if (versions.length && value.version !== Math.max(...versions) + 1) fail('Use the next learning brief version.');
  return validateEducation({...current, briefs: [...current.briefs, value]});
}
export function addAttempt(state: EducationState, input: Attempt): EducationState {
  const current = validateEducation(state), value = attempt(input);
  const previous = current.attempts.filter(item => item.id === value.id);
  if (value.revision !== (previous.length ? Math.max(...previous.map(item => item.revision)) + 1 : 1)) fail('Use the next attempt revision; earlier answers stay private and unchanged.');
  return validateEducation({...current, attempts: [...current.attempts, value]});
}
export function submitAttempt(state: EducationState, attemptId: string, attemptRevision: number, submissionId: string): EducationState {
  const current = validateEducation(state), original = current.attempts.find(item => item.id === attemptId && item.revision === attemptRevision);
  if (!original) fail('Choose an existing attempt revision.');
  const selectedBrief = current.briefs.find(item => item.id === original.briefId && item.version === original.briefVersion)!;
  const value: Submission = {id: id(submissionId), attemptId: original.id, attemptRevision: original.revision, brief: selectedBrief, answer: original.answer, question: original.question};
  return validateEducation({...current, submissions: [...current.submissions, value]});
}
export function addFeedback(state: EducationState, input: Readonly<{id: string; submissionId: string; strength: string; nextAction: string; question: string}>): EducationState {
  const current = validateEducation(state);
  const clean = record(input, ['id', 'submissionId', 'strength', 'nextAction', 'question']);
  const target = current.submissions.find(item => item.id === clean.submissionId);
  if (!target) fail('Choose an existing submission.');
  const value: Feedback = {...feedbackContent({...clean, attemptId: target.attemptId, attemptRevision: target.attemptRevision, briefId: target.brief.id, briefVersion: target.brief.version}), provenance: 'local'};
  return validateEducation({...current, feedback: [...current.feedback, value]});
}
function validateExchange(value: unknown): Exchange {
  const item = record(value, ['format', 'version', 'kind', 'recipient', 'payload']);
  if (item.format !== 'olr-education' || item.version !== 1) fail('Unsupported education exchange.');
  const base = {format: 'olr-education' as const, version: 1 as const, recipient: text(item.recipient, 120, true)};
  const result: Exchange = item.kind === 'brief' ? {...base, kind: 'brief', payload: brief(item.payload)} : item.kind === 'submission' ? {...base, kind: 'submission', payload: submission(item.payload)} : item.kind === 'feedback' ? {...base, kind: 'feedback', payload: feedbackContent(item.payload)} : fail('Choose one supported education exchange.');
  if (bytes(JSON.stringify(result)) > MAX_EXCHANGE_BYTES) fail('This selected exchange is too large.');
  return freeze(result);
}
/** Pure check only. Recipient labels are not identity verification or access control. */
export function parseExchange(serialized: string): Exchange {
  if (typeof serialized !== 'string' || serialized.length > MAX_EXCHANGE_BYTES || bytes(serialized) > MAX_EXCHANGE_BYTES) fail('This selected exchange is too large.');
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { return fail('This is not valid education exchange JSON.'); }
  return validateExchange(value);
}
/** Exact canonical plaintext for BOTH the preview and exported file. No private attempt history. */
export function exportExchange(state: EducationState, kind: Exchange['kind'], selectedId: string, recipient: string, briefVersion?: number): string {
  const current = validateEducation(state);
  let payload: Brief | Submission | FeedbackContent | undefined;
  if (kind === 'brief') {
    const versions = current.briefs.filter(item => item.id === selectedId);
    payload = versions.find(item => item.version === (briefVersion ?? Math.max(...versions.map(item => item.version))));
  } else if (kind === 'submission') payload = current.submissions.find(item => item.id === selectedId);
  else if (kind === 'feedback') {
    const selected = current.feedback.find(item => item.id === selectedId);
    if (selected) { const {provenance: _provenance, ...content} = selected; payload = content; }
  }
  if (!payload) fail('Choose an existing selected record.');
  const serialized = JSON.stringify(validateExchange({format: 'olr-education', version: 1, kind, recipient, payload}), null, 2);
  if (bytes(serialized) > MAX_EXCHANGE_BYTES) fail('This selected exchange is too large.');
  return serialized;
}
/** Explicit append. Replays are no-ops; conflicting identifiers fail instead of overwriting. */
export function acceptExchange(state: EducationState, exchange: Exchange): Readonly<{state: EducationState; status: 'added' | 'replay'}> {
  const current = validateEducation(state), clean = validateExchange(exchange);
  if (clean.kind === 'brief') {
    const found = current.briefs.find(item => item.id === clean.payload.id && item.version === clean.payload.version);
    if (found) { if (!same(found, clean.payload)) fail('This brief identifier and version conflict.'); return {state: current, status: 'replay'}; }
    return {state: validateEducation({...current, briefs: [...current.briefs, clean.payload]}), status: 'added'};
  }
  if (clean.kind === 'submission') {
    const found = current.submissions.find(item => item.id === clean.payload.id);
    if (found) { if (!same(found, clean.payload)) fail('This submission identifier conflicts.'); return {state: current, status: 'replay'}; }
    const selectedBrief = clean.payload.brief;
    const existingBrief = current.briefs.find(item => item.id === selectedBrief.id && item.version === selectedBrief.version);
    if (existingBrief && !same(existingBrief, selectedBrief)) fail('The submission learning brief version conflicts.');
    return {state: validateEducation({...current, briefs: existingBrief ? current.briefs : [...current.briefs, selectedBrief], submissions: [...current.submissions, clean.payload]}), status: 'added'};
  }
  const target = current.submissions.find(item => item.id === clean.payload.submissionId);
  if (!target) fail('Import the selected submission before its feedback.');
  boundFeedback(clean.payload, target);
  const found = current.feedback.find(item => item.id === clean.payload.id);
  if (found) {
    const {provenance: _provenance, ...content} = found;
    if (!same(content, clean.payload)) fail('This feedback identifier conflicts.');
    return {state: current, status: 'replay'};
  }
  return {state: validateEducation({...current, feedback: [...current.feedback, {...clean.payload, provenance: 'imported-unverified'}]}), status: 'added'};
}

export * from './authorization.ts';
export * from './abuse-guard.ts';
