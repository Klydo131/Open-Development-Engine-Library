# Learning briefs, selected handoff and feedback

Status: local alpha, 18 October 2026. This workflow is implemented in the web
sample using the optional `@open-learning-rooms/education` adapter. There are no
school accounts, automatic messages, rosters, hosted classrooms or verified
teacher identities. Use synthetic material while evaluating it.

The purpose is a small, useful cycle: a clear goal, a private attempt, selected
feedback, a revision and an optional revisit. Teachers can reuse and adapt a
brief; learners can ask for help without exporting their whole library. No AI,
grade or learner-surveillance system is required.

## Try the local workflow

1. Open or create your encrypted room. Choose **Briefs**, then **New brief**.
   Enter a goal, practice task, optional worked example, success checks and
   language. The source-credit fields can record a title, author, link and
   rights/license. Selecting a catalog source copies those credits only.
2. Save the brief. Choose **Start a private attempt**. The worked example stays
   collapsed until you reveal it. Write your attempt, a question for feedback,
   an optional private next action and an optional review date. Save it.
3. Saving that attempt again creates another revision. Earlier revisions and
   their exact brief version remain available. Revising the brief creates a
   new version; it does not silently move an old attempt to the new task.
4. Choose **Prepare selected submission** for the saved revision. Review its
   answer, question and brief. Enter the intended recipient and choose
   **Preview selected text**. Expand **Exact text data** to inspect the complete
   outgoing record.
5. Keep the default encrypted file, enter and confirm a new file passphrase,
   acknowledge the preview and download. Send the file yourself using an
   appropriate channel. Send its passphrase through a separate channel. Do not
   disclose your room passphrase.
6. In another room, choose **Import selected text**. Supply the file passphrase
   if needed, choose **Preview import**, inspect the record, then explicitly
   choose **Add selected text to my library**. Checking a file does not add it.
7. The recipient can write what is working, one useful next action and an
   optional question against that submission. Share the selected feedback file
   through the same preview process. The learner imports it into the room
   containing the original submission, then creates another private revision.

Share a brief first when another learner needs the task. A submission also
includes its exact brief snapshot so the reviewer can understand the selected
work. A feedback record must match a submission already present in the receiving
library. A repeated identical import does not add another copy; a conflicting
identifier is rejected instead of replacing saved work.

The review date is an editable private reminder value. It schedules no
notification and does not claim an optimal learning interval. Worked examples,
feedback and success checks are tools for the people using them, not proof of
mastery or a replacement for a teacher's judgment.

## What leaves the room

| Selected kind | Included |
| --- | --- |
| Brief | That exact version's title, goal, task, worked example, success checks, source credits and language |
| Submission | One saved answer and learner question, its exact brief snapshot and binding identifiers |
| Feedback | The observation, next action, question and identifiers binding it to one submission/revision/brief |

Every exchange also contains its format/version and the entered recipient label.
It does not contain attachments, a full-vault backup, the room passphrase,
private attempt history, private next actions, review dates, unrelated catalog
sources, personal journals or arbitrary catalog extensions. The source-picker
does not copy a resource's private notes or file bytes.

Selected text can itself contain names, identifying details or sensitive work.
Briefs include their worked example and source credits. Review all of that
material before sharing. Excluding unrelated fields does not make the selected
record anonymous. Recording a license is not permission to redistribute content.

## File protection and identity

Encrypted files are the web sample's default. Each file uses an independent
passphrase and fresh encryption, reusing the core's authenticated-encryption
implementation. The encryption wrapper contains only the selected text; it does
not wrap your existing room or use the room's key. Choose a unique long phrase
of 12–512 characters and keep it available for the recipient. There is no file
passphrase recovery service.

**Readable JSON** is an explicit alternative for material you intend to disclose
without confidentiality. Anyone with that file can read, edit and retain it.
The education package's low-level `exportExchange` function also returns readable
JSON; a developer must deliberately provide protection appropriate to their app.

A recipient label is descriptive text. It neither restricts who opens a file
nor verifies a teacher, learner or audience. Encryption detects modification
without the file key; it does not authenticate the person who made the file.
Someone with the passphrase can make another valid encrypted file. All imported
feedback is marked **unverified**. Verify the sender and intended destination
through an appropriate independent channel when that matters. Downloaded copies
can be retained and cannot reliably be recalled.

The app does not upload or send the file. Opening a credited external source
requires the existing external-link confirmation and exposes ordinary request
information to that website. The actual channel chosen to send files has its
own privacy and retention behavior.

## Saving, locking and recovery

Saved briefs, attempts, submissions and feedback are part of the encrypted local
catalog. Whole-library encrypted backups include that education namespace;
selected-text exchange is a separate, smaller operation. Export regular backups
and keep their original passphrases. Browser storage can be cleared or evicted.
See [recovery guidance](RECOVERY.md).

Unsaved form text stays in memory. Supported navigation warns before discarding
it; locking clears private forms and dialogs rather than retaining a plaintext
draft. Save before locking or leaving. A delayed import/decryption must not
reopen a locked room. Failed checking or an import conflict does not authorize
replacing the library. Unsupported education data is reported without silently
dropping that namespace.

The model accepts at most 8 MiB of serialized education state and 45,000 JSON
nodes, subject to stricter individual field/record and whole-catalog limits.
Plain exchange records are capped at 256 KiB. The web file reader has a 1 MiB
bound that also covers encrypted framing. These are validation limits, not
guarantees about device memory, storage availability or speed. The workspace's
portable-size estimate is not a browser-storage quota measurement.

## Integrating the engine

Keep education optional. Store validated state under
`catalog.extensions['org.openlearningrooms.education']` and preserve unfamiliar
namespaces. The generic core owns catalog records, asset bytes, encrypted
bundles and revision-aware storage; the education adapter owns its versioned
records and strict selected-text format. The web bridge updates the namespace
with a fresh catalog revision while preserving unrelated resources and content.
See [architecture](ARCHITECTURE.md) and the
[package API example](../packages/education/README.md).

Strict allowlists reject unexpected fields. Canonical source links accept HTTP
or HTTPS without embedded credentials; an empty link supports a text citation.
Text is rendered as text, not executed as HTML. This exchange format carries no
raw files and is not a malware scanner. Future attachment exchange needs a
separate content-handling boundary, not merely another field in this format.

The optional server authorization and abuse-control modules are executable
references, not active protection for a hosted service. A real deployment must
derive identity from verified server sessions, enforce tenant/course/resource
relationships and private-file ownership, and apply authorization during the
protected transaction. The in-memory limiter is single-process; multiple
instances need shared atomic budgets, gateway controls and bounded deadlines.
See [the reference contract and hosted acceptance gates](CLASSROOM-AUTHORIZATION.md).

## Remaining release work

Review the current [verification record](VERIFICATION.md), run the relevant
suite for the exact build, and complete physical-device and assistive-technology
checks before promising support. Automated WebKit profiles do not certify every
Apple product. There is no independent security certification, worldwide legal
clearance, proven learning-outcome claim or prediction of protection against
future attacks. Hosted school/minor-user use requires institution-specific
privacy, safeguarding, retention, accessibility and incident arrangements.

[The research brief](EDUCATION-AND-SECURITY-RESEARCH.md) records the primary
sources behind the learning cycle and release gates. It distinguishes design
evidence from educational efficacy and deployment-specific compliance.
