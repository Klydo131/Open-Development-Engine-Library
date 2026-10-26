# PostgreSQL portal setup

PostgreSQL 15+ is the portable portal database reference. The engine's catalog
and encrypted local storage do not require it. Database examples contain SQL,
strict TypeScript ports and small server adapters; they include no PostgreSQL
driver, account server or deployment platform dependency.

## Install on a disposable database first

Use a trusted database-owner connection. Provision `anon` and `authenticated`
roles before applying the schemas. For a fresh standalone database these can be
`NOLOGIN NOINHERIT` roles; an existing platform may already own their definitions.
Review those privileges rather than replacing platform roles.

| Order | SQL file | Purpose |
| --- | --- | --- |
| 1 | `examples/postgres/course-portal-schema.sql` | Trusted accounts, staff grants, courses, support and core authorization |
| 2 | `examples/postgres/group-workspace-schema.sql` | Groups, membership, sessions, posts, invitations and teacher rooms |
| 3 | `examples/postgres/media-schema.sql` | Private file bytes, storage quota and restricted media service role |
| 4, Supabase only | `examples/supabase/course-portal-schema.sql` | Supabase Auth identity override and account synchronization |

The core can be used alone by a custom course/support adapter. Groups are an
optional addition; media requires both core and groups. The configured reference
web portal exposes groups and files, so install all three portable schemas for
that entry before adding the Supabase bridge and deploying its HTTP functions.

Each file is a transaction for a fresh installation. It is not an idempotent
installer or a migration for a previously installed version. Back up the database
and rehearse a schema/data migration before upgrading. Reverting a frontend build
does not reverse a schema change. Keep the private schema unexposed by browser
Data APIs and review function ownership, grants and default privileges.

## Standalone identity integration

`portal_private.accounts` holds the trusted account UUID, current email and
verification state. Synchronize it from a verified identity service through a
server-only path. The browser must never insert accounts, change verification,
assign staff roles or supply an actor UUID as proof of identity.

The portable `portal_private.actor_id()` reads `library.actor_id`. This setting
is a trusted server assertion, not cryptographic authentication. A PostgreSQL
client allowed to execute arbitrary SQL can set it, so never expose database
credentials, raw SQL or a general query endpoint to users.

`examples/postgres/portal-rpc.ts` provides narrow pool/connection interfaces:

- `withPortalActor(pool, verifiedActorId, action)` opens a transaction, changes to
  the `authenticated` role, sets the actor transaction-locally, commits or rolls
  back, and releases the connection. Failed rollback discards the connection.
- `postgresPortalRpc(pool, verifiedActorId)` accepts only listed function names
  and exact parameter keys; all argument values use SQL parameters.
- `postgresInvitations(pool)` supplies the invitation handler's database port.

Verify bearer signature, issuer, audience, expiry, account confirmation and
current authority before deriving `verifiedActorId`. Use a dedicated server
login that can assume the client role and cannot grant itself database ownership.
Configure pool limits, statement/lock timeouts, connection deadlines and request
rate limits in the server. The helper does not implement those infrastructure
controls. Public metadata for anonymous visitors needs its own restricted `anon`
request path; the supplied actor helper handles verified account requests.

`examples/postgres/group-workspace.ts` supplies `rpcGroupWorkspace(client,
delivery?)`. It requires only a narrow RPC port, validates returned records and
maps stale writes to `PortalConflict`. It does not implement signup/recovery;
implement those methods when supplying a complete custom `CoursePortal`.

## Supabase identity bridge

The optional bridge replaces actor lookup with `auth.uid()` and rejects anonymous
Auth sessions. It ignores `library.actor_id`. A trusted trigger synchronizes Auth
email and confirmation changes into `portal_private.accounts`, including existing
users at installation. Email verification must be enabled and anonymous sign-ins
disabled in the actual project. Browser access uses the publishable key and
current user's bearer token, never a service-role/secret key.

Because this override deliberately ignores the portable actor setting,
`postgresPortalRpc`/`postgresInvitations` cannot establish identity merely by
setting `library.actor_id` on a bridged database. A Supabase invitation service
must call its narrow RPCs with the verified caller's user-authenticated context,
or use another reviewed server integration that establishes that context. Do not
replace this with a browser-supplied actor parameter. The media service uses a
separate explicit verified-actor path described below.

Assign or revoke staff only through a trusted database-owner connection after
the account is synchronized and confirmed:

```sql
insert into portal_private.administrators(user_id)
values ('CONFIRMED-USER-UUID');

delete from portal_private.administrators
where user_id = 'CONFIRMED-USER-UUID';
```

Never use self-signup, editable metadata or email domain as a staff grant. Role
revocation is checked from the trusted table on subsequent calls. Configure and
test Auth callbacks, SMTP and recovery separately; see [portal setup](COURSE-PORTAL.md).

## File-service privilege boundary

The media addition creates `library_media_service` as a non-login role without
superuser or RLS-bypass privileges. It can execute only the narrow private
`put_media` and `get_media` functions; it receives no direct blob-table access.
Use a dedicated trusted backend login authorized for that role. Never grant it
to `anon`, `authenticated` or a browser-facing login, and never expose its pool.

`createPostgresMediaStore(queryPort)` accepts a server-only driver port. Its
actor ID must come from verified server authentication, not request JSON or an
unverified token. The database rechecks verified account and current staff or
membership permissions. The upload HTTP service must scan bytes before calling
the store; direct database insertion does not run a malware scanner. See
[groups and media](GROUPS-AND-MEDIA.md) for formats, limits and handler wiring.

## Access and lifecycle

The core alone allows confirmed learners to read published lesson bodies. The
group addition replaces that policy with library membership: current staff or
membership in any ordinary group/private teacher room. This is one operator's
shared catalog. Discussion membership does not scope courses to individual
groups, and the schema is not multi-institution tenancy.

General support is visible to the owning learner and authorized staff. Group
posts/sessions are available to authorized group readers. Ordinary groups are
managed by staff; private teacher rooms are limited to the assigned staff member
and requesting learner. Member email lists are staff-only.

Account deletion needs a reviewed retention and handover process. Group
facilitator and media uploader foreign keys intentionally do not cascade, so
deleting an account that owns those records is blocked. Group identity and
facilitator are immutable through the public API; there is no public transfer,
group-delete, file-delete or archive operation. Assigned teacher requests also
reference their room. Plan controlled transfer, retention or deletion with a
trusted operator transaction, and test the complete plan before deleting an Auth
account. Revoking a staff grant does not perform this lifecycle work.

The examples reject over-limit responses rather than silently truncating them.
They do not provide pagination or automated retention. Test policy and lifecycle
changes with actual PostgreSQL and the intended gateway before serving users.

Support and teacher-request queues each accept at most 100 records across the
installation, including answered or assigned records. Inserts serialize the
capacity check under READ COMMITTED isolation before accepting a request, so
accepted requests cannot overflow the bounded staff reader. This is a capacity
boundary, not a substitute for request rate limits or a retention policy.

For an existing core-and-groups installation, rehearse
`examples/postgres/migrations/2026-10-26-request-capacity.sql` on a restored copy.
The migration locks both queues, aborts if either already exceeds 100 records,
and preserves all data. If it aborts, prepare an authorized retention or
pagination migration before retrying. Never delete learner requests merely to
make an upgrade pass. Fresh installations already include these guards.
