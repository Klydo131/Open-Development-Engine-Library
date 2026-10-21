# Optional education adapter

An MIT-licensed, dependency-free TypeScript adapter for reusable learning briefs, private attempts, selected text submissions, feedback and revisions. It adds no database, accounts, networking, AI, grades or tracking. Store its validated state under `catalog.extensions['org.openlearningrooms.education']` if your host uses the core library engine. A library application is still responsible for encrypting, persisting and deleting that catalog.

The model supports a small learning cycle: make a clear goal, try privately, choose an exact answer revision to submit, receive one next action, then revise without replacing the original. Nothing is shared automatically. Review dates are optional private choices, not notifications or surveillance.

```ts
import {
  emptyEducation, addBrief, addAttempt, submitAttempt,
  exportExchange, parseExchange, acceptExchange
} from '@open-learning-rooms/education';

let education = addBrief(emptyEducation(), {
  id: 'forces', version: 1, title: 'Balanced forces',
  goal: 'Explain why a book stays on a desk', task: 'Name the forces and their directions.',
  example: 'A stationary object has zero net force.',
  successChecklist: ['Name both forces', 'Explain zero net force'],
  sources: [], language: 'en'
});
education = addAttempt(education, {
  id: 'my-attempt', revision: 1, briefId: 'forces', briefVersion: 1,
  answer: 'Gravity pulls down; the desk pushes up.', question: '', nextAction: 'Draw arrows.'
});
education = submitAttempt(education, 'my-attempt', 1, 'selected-submission');
// Show THIS EXACT string in the confirmation preview and save THIS SAME string.
const plaintext = exportExchange(education, 'submission', 'selected-submission', 'My teacher');
const checked = parseExchange(plaintext); // Pure check: does not save or import anything.
const result = acceptExchange(emptyEducation(), checked); // Caller explicitly persists result.state.
```

All functions validate, detach and freeze records. Caller-generated IDs are bounded strings. `addBrief` creates a new version; `addAttempt` appends the next revision. Exact brief versions stay attached to attempts and submissions. `addFeedback` binds feedback to an existing selected submission. Importing the same record returns `status: 'replay'`; a conflicting identifier fails rather than overwriting work. Importing a submission includes its exact brief snapshot, but creates no private attempts in the receiver's library. Feedback must match the exact submission, attempt revision and brief version already present.

## Text exchange is a deliberate disclosure

This package's exports are readable JSON, **not encrypted**. The recipient label is descriptive text, not authentication or access control. Anyone with the file can read it, edit it or retain a copy. All imported feedback is labeled `imported-unverified`; this adapter cannot prove a teacher's or student's identity. A hosted implementation needs server-enforced permissions separately.

The web sample wraps this selected text in authenticated encryption by default,
using a new file passphrase independent of the room's passphrase. It also offers
an explicit readable JSON option. That wrapper belongs to the application, not
this dependency-free package. Neither mode verifies identity. See the
[workflow and protection guide](../../docs/EDUCATION.md).

Only one explicitly selected brief, submission or feedback record is transferred. The format has an exact allowlist. It rejects unknown fields and includes no vault, passphrase, raw files, private attempt history, private next actions, review dates, unrelated sources or arbitrary catalog extensions. A submission contains the selected answer and question, binding identifiers, and its exact brief snapshot. A feedback export includes its text and exact binding identifiers, without the selected answer. Any personal information the author types into these selected text fields remains visible. Source credits must be entered deliberately, using complete canonical HTTP(S) URLs without credentials; empty URLs are permitted for a text citation. Credit fields do not establish permission to redistribute material.

Limits: 8 MiB serialized state; 45,000 JSON value nodes; 200 brief versions; 400 attempt revisions, submissions and feedback records each; 256 KiB per exchange file. Text fields and source lists have individual caps. The shared node budget keeps the state inside the core catalog's extension complexity bound, so some combinations reach capacity before the individual record counts. These limits are guardrails, not measured device capacity. No automatic upload, teacher analytics, identity collection or full-library sharing exists in this adapter.
