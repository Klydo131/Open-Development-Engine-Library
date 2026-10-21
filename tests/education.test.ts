import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyEducation, validateEducation, addBrief, addAttempt, submitAttempt, addFeedback, exportExchange, parseExchange, acceptExchange, MAX_EXCHANGE_BYTES, type Brief, type EducationState} from '../packages/education/src/index.ts';
import {createCatalog, validateCatalog} from '../packages/core/src/catalog.ts';

const brief = (overrides: Partial<Brief> = {}): Brief => ({id: 'physics', version: 1, title: 'Forces', goal: 'Explain a balanced force', task: 'Describe a book resting on a desk', example: 'A stationary object has zero net force.', successChecklist: ['Name both forces', 'Explain why motion does not change'], sources: [{title: 'Selected reference', url: 'https://example.org/physics', creator: 'Author', license: 'CC BY 4.0'}], language: 'en', ...overrides});
function privateState(): EducationState {
  let state = addBrief(emptyEducation(), brief());
  state = addBrief(state, brief({id: 'music', title: 'PRIVATE_UNSELECTED_BRIEF'}));
  state = addAttempt(state, {id: 'attempt', revision: 1, briefId: 'physics', briefVersion: 1, answer: 'ORIGINAL_PRIVATE_HISTORY', question: '', nextAction: 'PRIVATE_NEXT_ACTION', reviewDate: '2026-10-22'});
  state = addAttempt(state, {id: 'attempt', revision: 2, briefId: 'physics', briefVersion: 1, answer: 'Selected answer', question: 'Selected question', nextAction: 'PRIVATE_NEW_NEXT_ACTION', reviewDate: '2026-10-23'});
  state = addAttempt(state, {id: 'unselected', revision: 1, briefId: 'music', briefVersion: 1, answer: 'PRIVATE_OTHER_ANSWER', question: 'PRIVATE_OTHER_QUESTION', nextAction: ''});
  return state;
}
test('education keeps original brief and answer snapshots frozen and detached', () => {
  const input = {...brief(), successChecklist: ['Original check']};
  const first = addBrief(emptyEducation(), input);
  input.successChecklist[0] = 'Caller changed';
  assert.equal(first.briefs[0].successChecklist[0], 'Original check');
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.briefs[0].successChecklist));
  const state = privateState();
  assert.equal(state.attempts[0].answer, 'ORIGINAL_PRIVATE_HISTORY');
  assert.equal(state.attempts[1].answer, 'Selected answer');
  assert.throws(() => addAttempt(state, {...state.attempts[1], answer: 'Replace'}), /next attempt revision/);
  assert.throws(() => addBrief(state, brief({title: 'Replace'})), /already exists/);
  const newer = addBrief(state, brief({version: 2, title: 'New task'}));
  assert.equal(newer.briefs.find(item => item.id === 'physics' && item.version === 1)?.title, 'Forces');
  assert.equal(newer.attempts[1].briefVersion, 1);
});
test('selected submission exports only allowlisted selected text and exact brief', () => {
  const state = submitAttempt(privateState(), 'attempt', 2, 'submission');
  const previewAndDownload = exportExchange(state, 'submission', 'submission', 'My teacher');
  const decoded = JSON.parse(previewAndDownload);
  assert.deepEqual(Object.keys(decoded.payload), ['id', 'attemptId', 'attemptRevision', 'brief', 'answer', 'question']);
  assert.equal(decoded.payload.answer, 'Selected answer');
  for (const canary of ['ORIGINAL_PRIVATE_HISTORY', 'PRIVATE_UNSELECTED_BRIEF', 'PRIVATE_NEXT_ACTION', 'PRIVATE_NEW_NEXT_ACTION', '2026-10-23', 'PRIVATE_OTHER_ANSWER', 'PRIVATE_OTHER_QUESTION']) assert.equal(previewAndDownload.includes(canary), false, canary);
  assert.equal(previewAndDownload.includes('provenance'), false);
  assert.equal(previewAndDownload.includes('attachments'), false);
  assert.deepEqual(parseExchange(previewAndDownload), decoded);
  assert.equal(exportExchange(state, 'submission', 'submission', 'My teacher'), previewAndDownload);
});
test('brief exchange excludes all private answers and unrelated brief versions', () => {
  const state = addBrief(privateState(), brief({version: 2, title: 'VERSION_TWO_CANARY'}));
  const output = exportExchange(state, 'brief', 'physics', 'Learning group', 1);
  assert.equal(output.includes('VERSION_TWO_CANARY'), false);
  assert.equal(output.includes('ORIGINAL_PRIVATE_HISTORY'), false);
  assert.equal(output.includes('PRIVATE_OTHER_ANSWER'), false);
  assert.equal(parseExchange(output).kind, 'brief');
});
test('import is check-only until explicitly accepted and repeats never duplicate', () => {
  const sender = submitAttempt(privateState(), 'attempt', 2, 'submission');
  const receiver = emptyEducation();
  const checked = parseExchange(exportExchange(sender, 'submission', 'submission', 'Teacher'));
  assert.equal(receiver.submissions.length, 0);
  const accepted = acceptExchange(receiver, checked);
  assert.equal(accepted.status, 'added');
  assert.equal(accepted.state.submissions.length, 1);
  assert.equal(accepted.state.briefs.length, 1);
  assert.equal(accepted.state.attempts.length, 0);
  assert.equal(accepted.state.feedback.length, 0);
  const replay = acceptExchange(accepted.state, checked);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.state.submissions.length, 1);
  const changed = JSON.parse(JSON.stringify(checked));
  changed.payload.answer = 'Conflicting replacement';
  assert.throws(() => acceptExchange(accepted.state, changed), /identifier conflicts/);
  assert.equal(accepted.state.submissions[0].answer, 'Selected answer');
});
test('feedback follows the exact selected submission, attempt revision and brief version', () => {
  const student = submitAttempt(privateState(), 'attempt', 2, 'submission');
  let teacher = acceptExchange(emptyEducation(), parseExchange(exportExchange(student, 'submission', 'submission', 'Teacher'))).state;
  teacher = addFeedback(teacher, {id: 'feedback', submissionId: 'submission', strength: 'You named gravity.', nextAction: 'Add the desk force and its direction.', question: 'What is the net force?'});
  assert.equal(teacher.feedback[0].provenance, 'local');
  const serialized = exportExchange(teacher, 'feedback', 'feedback', 'Student');
  assert.equal(serialized.includes('provenance'), false);
  assert.equal(serialized.includes('Selected answer'), false);
  const checked = parseExchange(serialized);
  const accepted = acceptExchange(student, checked);
  assert.equal(accepted.state.feedback[0].provenance, 'imported-unverified');
  assert.equal(accepted.state.feedback[0].attemptRevision, 2);
  const revised = addAttempt(accepted.state, {...accepted.state.attempts[1], revision: 3, answer: 'Revised after feedback'});
  assert.equal(revised.feedback[0].attemptRevision, 2);
  assert.equal(revised.attempts[1].answer, 'Selected answer');
  assert.equal(acceptExchange(accepted.state, checked).status, 'replay');
  assert.throws(() => acceptExchange(emptyEducation(), checked), /before its feedback/);
  for (const field of ['attemptRevision', 'briefVersion'] as const) {
    const malformed = JSON.parse(serialized);
    malformed.payload[field] += 1;
    assert.throws(() => acceptExchange(student, malformed), /exact submission/);
  }
  const malformed = JSON.parse(serialized);
  malformed.payload.attemptId = 'other';
  assert.throws(() => acceptExchange(student, malformed), /exact submission/);
});
test('brief imports allow replay but reject exact-version conflicts without overwriting', () => {
  const state = addBrief(emptyEducation(), brief());
  const exchange = parseExchange(exportExchange(state, 'brief', 'physics', 'Students'));
  assert.equal(acceptExchange(state, exchange).status, 'replay');
  const conflicting = JSON.parse(JSON.stringify(exchange));
  conflicting.payload.goal = 'Other goal';
  assert.throws(() => acceptExchange(state, conflicting), /version conflict/);
  assert.equal(state.briefs[0].goal, 'Explain a balanced force');
  const newer = addBrief(state, brief({version: 2}));
  const target = acceptExchange(emptyEducation(), parseExchange(exportExchange(newer, 'brief', 'physics', 'Students', 2))).state;
  assert.equal(target.briefs[0].version, 2);
});
test('strict import rejects unknown fields, arbitrary metadata, files and fake provenance', () => {
  const state = submitAttempt(privateState(), 'attempt', 2, 'submission');
  const baseline = exportExchange(state, 'submission', 'submission', 'Teacher');
  for (const property of ['journal', 'passphrase', 'extensions', 'attachment', 'file', 'tracking']) {
    const input = JSON.parse(baseline);
    input.payload[property] = 'SECRET_CANARY';
    assert.throws(() => parseExchange(JSON.stringify(input)), /Unexpected/);
  }
  const nested = JSON.parse(baseline);
  nested.payload.brief.sources[0].resourceId = 'PRIVATE_ID';
  assert.throws(() => parseExchange(JSON.stringify(nested)), /Unexpected/);
  const top = JSON.parse(baseline);
  top.actor = 'Verified teacher';
  assert.throws(() => parseExchange(JSON.stringify(top)), /Unexpected/);
  const feedbackState = addFeedback(state, {id: 'f', submissionId: 'submission', strength: '', nextAction: 'Try again', question: ''});
  const forged = JSON.parse(exportExchange(feedbackState, 'feedback', 'f', 'Student'));
  forged.payload.provenance = 'local';
  assert.throws(() => parseExchange(JSON.stringify(forged)), /Unexpected/);
});
test('invalid links, versions, language, dates and references fail validation', () => {
  for (const url of ['javascript:alert(1)', 'file:///private', 'https://name:password@example.org/', 'not a URL', 'https://example.org/\nprivate']) assert.throws(() => addBrief(emptyEducation(), brief({sources: [{title: 'Bad link', url, creator: '', license: ''}]})));
  for (const version of [0, -1, 1.5, 100001, NaN]) assert.throws(() => addBrief(emptyEducation(), brief({version})));
  assert.throws(() => addBrief(emptyEducation(), brief({language: 'en<script>'})));
  assert.throws(() => addBrief(emptyEducation(), brief({language: 'en\n'})));
  assert.throws(() => addBrief(emptyEducation(), brief({id: 'physics\n'})));
  assert.throws(() => addBrief(emptyEducation(), brief({successChecklist: []})));
  const state = addBrief(emptyEducation(), brief());
  const attempt = {id: 'a', revision: 1, briefId: 'physics', briefVersion: 1, answer: '', question: '', nextAction: ''};
  assert.throws(() => addAttempt(state, {...attempt, briefVersion: 2}), /missing learning brief/);
  assert.throws(() => addAttempt(state, {...attempt, reviewDate: '2026-02-30'}), /valid review date/);
  assert.throws(() => addAttempt(state, {...attempt, revision: 2}), /next attempt revision/);
  assert.throws(() => validateEducation({...emptyEducation(), surprise: true}), /Unexpected/);
  assert.throws(() => validateEducation({...emptyEducation(), version: 2}), /version/);
});
test('transfer and state capacity are bounded before accepting oversized input', () => {
  assert.throws(() => parseExchange(' '.repeat(MAX_EXCHANGE_BYTES + 1)), /too large/);
  assert.throws(() => parseExchange('💡'.repeat(MAX_EXCHANGE_BYTES / 2)), /too large/);
  assert.throws(() => parseExchange('{}'), /Unexpected/);
  assert.throws(() => parseExchange('{'), /valid education exchange JSON/);
  assert.throws(() => validateEducation({...emptyEducation(), briefs: Array.from({length: 201}, () => brief())}), /capacity/);
  assert.throws(() => addAttempt(addBrief(emptyEducation(), brief()), {id: 'a', revision: 1, briefId: 'physics', briefVersion: 1, answer: 'x'.repeat(20001), question: '', nextAction: ''}), /oversized/);
});
test('education fits core extension bounds and rejects excessive structured state', () => {
  const state = submitAttempt(privateState(), 'attempt', 2, 'submission');
  const catalog = createCatalog();
  catalog.extensions['org.openlearningrooms.education'] = JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(() => validateCatalog(catalog));
  const heavyBrief = brief({successChecklist: Array(20).fill('Check'), sources: Array.from({length: 20}, (_, i) => ({title: `Reference ${i}`, url: '', creator: '', license: ''}))});
  const briefs = Array.from({length: 200}, (_, i) => ({...heavyBrief, id: `brief-${i}`}));
  const submissions = Array.from({length: 400}, (_, i) => ({id: `submission-${i}`, attemptId: `attempt-${i}`, attemptRevision: 1, brief: briefs[i % briefs.length], answer: '', question: ''}));
  assert.throws(() => validateEducation({...emptyEducation(), briefs, submissions}), /record capacity/);
});
