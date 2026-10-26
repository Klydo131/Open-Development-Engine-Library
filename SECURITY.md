# Security Policy

## Status and reporting

This repository is a local alpha. It has no independent security audit,
guaranteed response time, regulatory approval or production support commitment.
Only the current development tree is being maintained; no supported release
series has been established.

If a GitHub repository is published and private vulnerability reporting is
enabled, use its **Security → Report a vulnerability** channel.
Until that channel exists, contact the maintainer through the project channel
already available to you and request a private reporting method. Do not put
vulnerabilities, passphrases, tokens, personal data or real library exports in
public issues. No dedicated security email address is currently designated.

Include affected versions or commit, environment, a minimal synthetic
reproduction, expected behavior, observed impact, and any workaround.
Coordinate disclosure with the maintainer; this document promises no fixed
disclosure schedule.

## System and scope

The core package provides catalog validation, asset boundaries, search,
encrypted backups, storage contracts and legacy learning migration.
The web app is an example local, single-user library. Its passphrase gate is
a local encryption control, not server authentication.

The optional Supabase reference adapter adds authenticated remote ciphertext
storage. It is not connected to the sample by default. The example SQL and
client code have not established isolation in a live deployment.
Hosting headers, dependencies, migration and storage adapters remain part of
security review.

The separate course-library application uses provider-neutral contracts and
PostgreSQL reference schemas for institutional accounts, roles, courses,
support, groups, invitations and private teacher rooms. These shared records
are readable by the service and authorized participants; they are not the
personal passphrase vault and are not end-to-end encrypted. The default portal
is a temporary in-memory demonstration, not a production account service.

Optional Fetch handlers deliver invitations and accept scanned file uploads.
Their authentication callbacks, mailer, scanner, hosting and database pool
are trusted operator integrations. Reuse a handler instance to share its upload
admission state; fleet-wide traffic limits and worker isolation belong to the
deployment. See [security layers](docs/SECURITY-LAYERS.md) and
[security maintenance](docs/SECURITY-MAINTENANCE.md) for code boundaries,
operator controls and patch verification.

## Threat model and trust boundaries

Treat library imports, backup envelopes, links, filenames, file contents,
provider responses and all stored records as untrusted input. A person can
supply hostile data through a source or backup, and a stale tab can try to
replace a newer library.

The browser and application code are trusted while running. A compromised
device, malicious same-origin script, browser extension or changed web build
can read content while unlocked. Passphrase-derived encryption does not
remove this trust boundary. A host serving a modified application can also
undermine client-side encryption.

Library content may reveal sensitive interests or personal information even
when no identity profile is deliberately collected. A remote service sees
request metadata and account identifiers when that service is enabled.

## Required security properties

- Validate and bound records, references, files and envelope parameters before
  accepting them. Reject unsupported versions and malformed authenticated data.
- Encrypt saved library content and backups with the implemented authenticated
  envelope. Do not persist the passphrase or an extractable raw key.
- Locking must clear the visible private session; delayed asynchronous work must
  not reopen a locked room or expose private content after lock.
- Stale writes and deletions must fail atomically. A failed or corrupted import
  must not silently replace an existing saved library.
- Render imported text as text. Do not execute document scripts, HTML, macros,
  source URLs or imported code as application instructions.
- Allow external navigation only through an explicit action. Do not automatically
  fetch link previews, external embeds, identity profiles or remote recommendations.
- Never place Supabase service-role keys, secret keys or privileged credentials
  in a browser bundle. Remote authorization must restrict every operation
  to the authenticated owner's records and preserve revision checks.
- Errors, tests and operational logs must not disclose library plaintext,
  passphrases or access tokens.
- Institutional access must verify current accounts, roles and resource
  permissions at the service/database boundary, including group membership
  and assigned teacher-room participants.
- Hosted uploads require an actual clean scanner result. Bound concurrent
  work, keep timed-out scans accounted for until they actually settle, and
  never persist an upload from a late clean result after its scan deadline.

## Findings and severity context

Report a reachable failure of these properties, including plaintext leakage,
cross-user access, authentication or authorization bypass, executable import
content, destructive stale writes, lock races, unsafe envelope handling,
and resource exhaustion through accepted untrusted inputs.

Assess impact using the actual deployment and an attainable attack path.
A sample or alpha label is not a reason to suppress a real vulnerability.
No security finding classes or components are excluded by this policy.

## Known limitations

File extension and signature checks are not malware detection. The sample
avoids embedded PDF execution, but downloading and opening an untrusted file
still depends on the user's operating system and viewer. File parsers, audio
decoders and browsers need current security updates.

Encrypted snapshots do not prevent offline passphrase guessing, ciphertext
rollback by a malicious storage operator, deletion, or denial of service.
Revision checks prevent ordinary stale writes; they are not an authenticated
history or collaboration protocol. Automatic or multi-key rotation, recovery,
secure-memory erasure and large-file streaming need further work. Institutional
permissions have reference implementations and tests; live isolation still
requires deployment-specific verification.

Browser storage can be evicted or cleared. Locking drops application references;
JavaScript cannot guarantee immediate zeroization of memory.
Automated WebKit testing does not replace physical Apple device testing.
Public institutional service, processing children's data, and live remote
storage require deployment-specific review and verification.
