# Changes

## Unreleased — 27 October 2026

- Optional teaching guides give lessons a learning goal, familiar connection,
  worked example, practice and a reasoning explanation learners can reveal.
  Administrators can save unfinished guides in draft courses; practice responses
  stay on the current screen and are not submitted or graded. Existing lessons
  remain supported, with a data-preserving PostgreSQL validation upgrade.
- Runtime maintenance checks enforce reviewed security minimums and review
  deadlines, with bounded official advisory checks and executable inventory.
  Daily repository checks and dependency update proposals support patch review;
  maintenance tooling is tested on Linux, Windows and macOS.
- Compatible application and test-tool updates refresh rendering, build,
  database-fixture and accessibility checks. Platform guidance distinguishes
  automated browser coverage from physical-device verification.

## Unreleased — 26 October 2026

- Hosted media uploads share a bounded admission limit, including scans that
  outlive their response deadline. Saturated handlers reject before reading
  another upload; late clean results cannot store an expired upload. Developer
  guides explain deployment security layers and artifact-aware patch review.
- The course-library homepage presents course previews, local metadata search,
  available-language filters and clear links to learning and study spaces.
  Layout and reading-size controls adapt to smaller screens. Course visibility
  continues to follow the configured provider's permissions.
- Catalog backup headers validate canonical encoding without decoding and
  re-encoding the full ciphertext. Encryption and backup formats are unchanged.
- Course and group navigation remains usable when the separate support or
  teacher-request service is temporarily unavailable, with an explicit retry.
- Portal browser settings and security headers use the same root environment
  directory, including when the configuration command runs from another folder.
- PostgreSQL request creation now enforces the same shared capacity as staff
  inbox reads. Existing installations have a data-preserving upgrade script;
  see [database setup](docs/POSTGRESQL.md).
- CI uses Node.js 24.22.1 and pnpm 11.28.8, installing the patched runtime before
  the package manager. Dependency lifecycle scripts remain disabled.

## Unreleased — 23 October 2026

- The course portal includes optional Learner/Admin guides, study-group
  discussions, scheduled sessions, email-invitation acceptance and teacher
  requests. Only administrators can create private teacher rooms; access is
  limited to the requesting learner and assigned administrator.
- Administrators can prepare lessons with text, credited links or supported
  file attachments. The temporary demonstration stores files in memory. The
  server example requires a configured malware scanner before accepting uploads.
- PostgreSQL is the portable portal database reference. Apply its core schema
  before the group and media additions. The Supabase SQL file is now an optional
  Auth bridge, **not a standalone schema installer**. Existing installations need
  a reviewed migration; do not rerun the examples over a live schema. See
  [database setup](docs/POSTGRESQL.md).
- With the group schema installed, learners need membership in at least one
  group or assigned teacher room to read published lesson bodies and attachments.
  Published course metadata remains public. Group membership grants access to
  the deployment's shared published catalog, not a separate catalog per group.
- JSON provider responses remain bounded at 4 MiB; the configured file-download
  route permits up to 10 MiB. Both use a 30-second browser fetch deadline.
- CI runs unit and database fixture files with at most two concurrent workers.

## Earlier unreleased changes — 22 October 2026

- The project is now **Open Development Engine Library**. Existing package
  names, saved rooms and encrypted backup identifiers remain compatible.
- Catalog search rejects malformed filters with an error instead of silently
  ignoring them. JavaScript integrations should correct unknown fields and
  respect the documented [search option bounds](docs/SEARCH.md).
- Web builds include the project license and dependency notices. Keep these
  files with distributed assets; the bundle check verifies their contents.
- The configured course portal bounds provider responses to 4 MiB and applies a
  30-second deadline per fetch. Failed or canceled writes may still have reached
  the server; refresh the record before repeating them.
- Course portal adapters can use their own provider identifier through the
  portable interface. No provider SDK is required by the engine package.

The project remains an alpha. These changes do not establish production,
security, accessibility or regulatory certification.
