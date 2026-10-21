# Roadmap

Updated 2026-10-22. This is a direction for incremental development, not a
promise of release dates.

## Milestone 1: a reusable private library engine

The approved scope is a single-user engine with catalog records, creators,
languages, subjects, rights and provenance; flat collections; local search;
separate assets; revision-aware memory and IndexedDB storage; encrypted
versioned bundles; and migration from the first learning-library format.

Learn and Apply remains the example application, with learning-specific state
kept outside the general catalog. This milestone also repairs baseline locking,
save feedback, checklist persistence, contrast and narrow-screen reflow issues.

Acceptance requires meaningful core tests, a build, browser coverage and an
honest record of remaining limitations. Approval to develop locally does not
authorize GitHub publication or a production deployment.

## Next: reliability and interoperability

The optional [guided study room](AGE-INCLUSIVE-STUDY.md) and separate
[institutional portal](COURSE-PORTAL.md) now have local implementations. The
portal demonstration is memory-only; email account delivery and provider
configuration remain deployment acceptance work. The private engine stays
provider-neutral. [CI gates](CI-CD.md) target the
[project repository](https://github.com/Klydo131/Open-Development-Engine-Library);
deployment stays separate from pull-request checks.

- Exercise physical Safari devices, VoiceOver and file import/export.
- Review format evolution, passphrase changes, large collections and recovery.
- Define adapter capabilities and test a disposable remote deployment with
  real authorization checks before offering cloud sync.
- Complete source and dependency license-notice packaging before distribution.
- Add documented interchange incrementally, preserving identifiers, rights,
  provenance and unsupported fields. Evaluate Dublin Core, MARC, OPDS and
  Readium use cases before claiming conformance.
- Add richer local indexing only when catalog search proves insufficient.

The core now provides an explicit selected-field [DCMI-term mapping](DCMI.md).
It is a small plain-JSON helper, not a complete interchange profile.

No MARC, OPDS, Readium, circulation, federation or public repository compliance
is claimed by the initial format.

## Institutional and public services

Before adding multiple users or public catalog publication, define permissions,
operator responsibilities, retention and deletion, lawful content distribution,
accessibility, incident handling and service capacity. Privacy defaults must
continue to protect private collections when public features are added.

The Philippines requires deployment-specific assessment of privacy, business
registration, consumer and cybercrime obligations. NPC, DICT, CICC, SEC and DTI
do not form a single universal software approval. A developer's choice of
business structure, processing activities and users affects which requirements
apply. Other jurisdictions require their own applicability review.

This project will document controls and evidence. It cannot promise legal
clearance in every nation. Source availability and a permissive software
license do not remove operators' responsibilities for hosted services or content.

## Publication gate

Before any GitHub publication, review the exact source archive, test results,
license and dependency notices, sensitive-data scan, reporting channel and
documentation. Confirm that private reports, traces, real libraries, credentials,
build output, dependencies and machine-specific paths are absent from the
publishable tree. Obtain the owner's separate publication approval.

Before customer deployment, test the actual host, headers, backup restoration,
isolation and failure behavior. A local green suite is evidence about the local
build, not a substitute for checks of the deployed system.

16 October 2026: optional standalone IndexedDB adapter is available through
`@open-learning-rooms/core/indexeddb`. See [the adapter guide](INDEXEDDB.md).

Passphrase/backup follow-up: manual passphrase changes and check-only backup
authentication are implemented locally. Physical-device recovery drills and
large-library/format evolution remain next reliability work.

Unsaved-work follow-up: in-memory form tracking and discard warnings are
implemented and tested locally for the learning consumer. Browser lifecycle/storage research and a
bounded encrypted-draft alternative are recorded in [DRAFTS.md](DRAFTS.md).
Encrypted draft recovery and physical-device lifecycle testing remain future work.

Core scaling follow-up: exact-size preflight is implemented without changing
accepted-data caps or the format. It measures portable serialization before
cloning, hashing or base64-encoding asset bytes. See [CAPACITY.md](CAPACITY.md).
Physical-device capacity measurements still precede any limit increase or new
storage format.

## Local education increment — 18 October 2026

[The research brief](EDUCATION-AND-SECURITY-RESEARCH.md) informed a small
goal/attempt/feedback/revision cycle. Its first local increment now supplies an
optional education package and **Briefs** workspace: versioned reusable briefs,
private attempt revisions, private next actions/review dates, selected text
preview and explicit import, and feedback bound to an exact submission. Source
credits and language stay attached to a brief. Private journals and attachments
remain outside selected handoff. The web sample defaults to an encrypted file
with an independent file passphrase; readable JSON is an explicit alternative.
Imported sender identity remains unverified. See [EDUCATION.md](EDUCATION.md).

Executable default-deny authorization and bounded request/concurrency controls
are supplied as optional server references. They are not connected to hosted
accounts, a database, gateway, WAF or public classroom service. Their unit
fixtures do not prove backend isolation or deployed bot resistance. See
[the adapter contract and acceptance gates](CLASSROOM-AUTHORIZATION.md).

Next: verify the full local handoff/revision loop, hostile import behavior,
backup/rekey preservation, cancellation/locking and narrow-screen/keyboard
states for the exact build. Record evidence in [VERIFICATION.md](VERIFICATION.md)
and complete physical-device and assistive-technology checks separately.
Measure whether an authorized adult usability pilot understands the disclosure
boundary before considering real school/minor-user material. No causal learning
gain is established by this implementation.

Hosted classrooms and LTI/roster/grade features require a demonstrated need and
separate institutional privacy, permission, safeguarding, retention and security
evidence. Future file exchange also needs isolated content handling; text-only
allowlists are not malware detection. Interchange mappings must state their
exact supported profile before claiming a standard's conformance.

Owner: project maintainer. Next action: review local integration evidence and
remaining release gates. Review date: 25 October 2026 or before a hosted
classroom implementation. The formal source security audit remains outstanding;
existing local checks are not a substitute. No claim of future-proof security or
protection years ahead of attacks is made.
