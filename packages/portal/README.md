# Optional course portal

Provider-neutral contracts and strict, detached, immutable record validation for a course catalog, email account adapter, learner support and optional group/media services. The generic package has no runtime dependencies, React, network calls, storage or account implementation. It carries no private library, journal or encryption passphrase. Public course previews can have empty lesson arrays; publishing must require actual material in the provider.

Limits: 100 courses per response, 50 lessons and 256 KiB per course, 20,000 characters per lesson, 100 support threads per response and 5,000 characters per support message/reply. Responses are capped at 4 MiB. Pagination is required before a deployment exceeds these bounds. Text is plain text; links allow HTTP(S) without credentials. Render as text, not HTML. Link checks are syntax checks, not content safety endorsements.

The runnable local demo has simulated identities. PostgreSQL is the primary shared-service database reference; Supabase supplies an optional email Auth bridge. Both require trusted identity integration, private server-owned administrator roles, database row policies and transactional revision checks. Hosted email delivery, abuse defenses, retention, moderation and child-facing legal arrangements still require operator setup and testing. Never use an account password as a private-room encryption key.

`CoursePortal.groups` optionally provides study groups, discussion posts, scheduled
sessions, email invitations and teacher requests. Only an administrator creates a
private teacher room for its requesting learner; other administrators cannot read
that room through the normal API. These shared conversations are separate from
encrypted personal vaults. `CoursePortal.media` optionally supplies supported
attachment upload/download. Metadata contains a file ID, type, size and SHA-256;
file bytes do not travel in course JSON. The server upload example requires a
configured malware scanner. The package's signature checks are not malware scans.

See the [PostgreSQL guide](https://github.com/Klydo131/Open-Development-Engine-Library/blob/main/docs/POSTGRESQL.md)
and [groups/media guide](https://github.com/Klydo131/Open-Development-Engine-Library/blob/main/docs/GROUPS-AND-MEDIA.md)
for schema order, service ports, authorization and bounded-workspace limits.

## Custom adapters

Implement `CoursePortal` in trusted application code and inject it into the portal
view. Use a stable `kind` string for your provider. The bundled view reserves
`demo` for its simulated-account controls; other identifiers use the normal
account interface. The package does not discover or execute external plugins.

Validate incoming records with the exported validators. Enforce authorization,
publication rules and atomic revision checks on the server; browser validation
does not grant access. `saveCourse` and `replySupport` must reject stale revisions
with `PortalConflict`. Account listeners must return an unsubscribe function.
Treat provider errors as untrusted data and keep credentials out of UI messages.

The portable validators check already-decoded values. Apply byte limits and
deadlines in the transport before parsing remote bodies. The
[bounded JSON transport example](https://github.com/Klydo131/Open-Development-Engine-Library/blob/main/docs/HTTP-TRANSPORT.md) is used by the
reference portal and can be supplied to another fetch-compatible client.
