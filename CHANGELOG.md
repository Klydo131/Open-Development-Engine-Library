# Changes

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
