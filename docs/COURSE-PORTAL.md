# Course portal and human support

The optional portal provides course browsing, institution email accounts, lesson
materials, support, study groups and teacher requests. It is separate from the
encrypted personal library. Private-room notes, files and passphrases are not
uploaded or exposed to portal administrators.

Optional [teaching guides](TEACHING-GUIDES.md) structure a lesson around a goal,
worked example, practice and explanatory question. Learner practice responses
stay in the mounted screen; sharing for support remains an explicit action.

## Try the local demonstration

Open `/portal.html` in the local preview. Signed-out visitors see published
course titles and purposes, without lesson bodies or drafts. Choose **Preview
learner** to read sample lessons, discuss in a group, view scheduled sessions or
request a teacher. Choose **Preview admin** to create and publish courses, invite
group members, schedule sessions, respond to teacher requests and answer support.
The demo can show an invitation code for local testing; it sends no email.

The **Getting started** guide follows the current role. It can be closed and
reopened without changing courses or marking anyone trained. The learner guide
explains sign-in, materials, groups, teacher support and privacy. The admin guide
covers publication, invitations, sessions, moderation and configured services.
There is no tutorial-completion tracking or learning assessment.

All demonstration identities, courses, groups, messages and uploaded files are
temporary memory data. Refreshing the page resets them. Role preview buttons are
not authentication and must not be used as a deployed authorization system.

Materials support plain text, credited HTTP(S) links and optional file
attachments. Read → Try → Check → Plan offers a simple lesson structure. Reading
size changes presentation for the current page; it does not change material or
assess ability. External sources open only after a learner chooses them and
confirms leaving the application. Attachments download as files rather than
embedding active content. See [groups and media](GROUPS-AND-MEDIA.md).

Course and support forms retain unsaved text after failed saves. Internal
navigation and refresh warn about unsaved edits. Mutations disable the relevant
controls while pending. Identity, role or recovery changes clear working portal
data; a same-account token refresh does not discard drafts. Password fields are
excluded from the in-memory draft tracker. The tracker writes no drafts to disk.

## Portable interfaces

`packages/portal/src/index.ts` provides strict records and a provider-neutral
`CoursePortal`, without React, networking, account storage or private-room data.
An adapter supplies verified identity and service operations. Optional `groups`
and `media` properties expose additional capabilities; adapters without them can
continue to provide courses and support.

| Interface | Purpose |
| --- | --- |
| `account`, `onAccountChange` | Verified identity, assigned role and recovery state |
| `signUp`, `signIn`, `requestPasswordReset`, `updatePassword`, `signOut` | Provider-managed email account lifecycle |
| `listCourses`, `saveCourse(course, expectedRevision)` | Visible courses and administrator editing with revision comparison |
| `getSupport`, `askSupport`, `replySupport(id, reply, expectedRevision)` | Selected learner questions and authorized staff replies |
| `groups: GroupWorkspace` | Membership, discussions, sessions, invitations and teacher rooms |
| `media: PortalMediaStore` | Validated file upload and authorized download |

A course has UUID identifiers/revisions, title, purpose, language, draft/published
status and ordered materials. Each material has title, text, source link, creator
credit and rights, with optional media type and attachment metadata. File bytes
are held separately from course JSON. Published materials require text, a link or
an attachment, and explicit credit and rights statements. These checks establish
that information was supplied; they do not verify copyright or external safety.
The software's MIT license does not license third-party course content.

A support thread contains only the selected subject/message, optional course,
owning learner ID, reply, status and revision. General support is visible to
authorized support administrators. Private teacher-room discussions have a
separate, narrower access boundary. Neither transfers personal-library journals,
attempts or encryption keys. The education package's versioned briefs and selected
exchange remain separate features.

Course edits use compare-and-swap against the latest revision. Immutable published
editions, completion tracking, grades, live calls and automatic personal-library
submission are not implemented. Limits include 100 courses/support threads per
response, 50 materials per course, 256 KiB per course, 20,000 characters per
material and 5,000 per support message/reply. Larger deployments need authorized
pagination and retention design.

## Database and service setup

[PostgreSQL setup](POSTGRESQL.md) defines the installation order and trusted
identity boundary. The reference web portal's configured adapter uses Supabase
Auth and PostgreSQL, but its portable contracts and schemas do not require that
provider. A different provider must implement account verification, recovery and
transport; choosing PostgreSQL alone does not supply an account service.

For the configured reference portal, install the portable course core, group
schema and media schema, then the optional Supabase Auth bridge. Deploy the
invitation and file handlers described in [groups and media](GROUPS-AND-MEDIA.md).
The SQL files are transactional examples, not rerunnable installers or automatic
migrations. An existing deployment needs an explicit tested migration and backup.

## Supabase account configuration

Use a disposable project and controlled test mail sink before a live service.
Running the demonstration configures no real accounts, SMTP or external recipient.

1. Enable email confirmation and disable anonymous sign-ins. The adapter rejects
   unconfirmed/anonymous users and the identity bridge checks trusted Auth state.
   Set an exact HTTPS site URL and allowlist the `/portal.html` callback; loopback
   callbacks belong only to local development. Verify the templates and redirect
   behavior. See [password flow](https://supabase.com/docs/guides/auth/passwords),
   [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) and
   [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
2. Provision administrators only through a trusted database-owner connection,
   using confirmed account UUIDs. Never derive staff access from self-signup,
   editable metadata, email domains or browser controls. The exact SQL is in
   [PostgreSQL setup](POSTGRESQL.md).
3. Configure production SMTP, Auth rate limits and accessible abuse defenses.
   Test delivery and recovery with synthetic accounts. The reset UI always gives
   a generic next step and does not promise delivery. See
   [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
4. Deploy group-invitation and file services with verified caller authentication,
   appropriate database access and bounded infrastructure. The browser wires
   `portalServices(client.functions)` into `supabaseCoursePortal`; it expects
   functions named `group-invitations` and `library-media` on the configured
   provider origin. Missing services fail with a visible error.

### Public build settings

Leave both settings empty for the demonstration. For a configured service, set
`VITE_PORTAL_SUPABASE_URL` to its exact HTTPS origin and
`VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY` to a modern `sb_publishable_` key. Use an
ignored local environment file or deployment settings. The build rejects partial
configuration, URLs with credentials/paths/queries, secret keys and legacy role
JWTs. HTTP is accepted only for a loopback development provider. These are public
browser settings; no secret/service-role key belongs in either variable.

The trusted callback is the current origin's `/portal.html`. The pinned official
SDK handles PKCE exchange before rendering. Callback query/fragment state is
removed from history, including on failure. Recovery comes from the SDK event,
not a query flag. An email reset cannot recover a personal-library passphrase.

Account access/refresh tokens remain in memory and disappear on refresh or page
exit. SDK storage persists only the PKCE verifier and bounded per-flow records
for at most one hour. Consumed records are removed; corrupt, expired or
clock-rollback state fails closed. Pending expired records are cleaned on access
or the next initialization, not by a background deletion service. Blocked browser
storage can prevent account callbacks from completing.

Open account email links in the browser/device where the request began. This is
a [PKCE constraint](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
The pinned SDK's experimental per-flow redirect identifier supports overlapping
requests; rerun actual-SDK mocked-service tests before SDK upgrades. Cross-browser
recovery needs a separately reviewed server/OTP flow. After verifying an account,
reopen its original group-invitation link if the temporary invitation code was
lost. Joining still requires an explicit action with the invited verified email.

Only the portal entry loads the SDK and permits requests to its configured
origin. The private entry keeps `connect-src 'none'`. Run
`pnpm configure:portal` after setting public configuration and review the
portal-only CSP in `vercel.json`. A Vercel build rejects a policy/configuration
mismatch. Other hosts must serve equivalent headers; local preview middleware
does not configure production response headers.

## Authorization and verification scope

The PostgreSQL example is a single-operator library. Visitors read published
metadata. With the group schema installed, a verified learner needs membership
in at least one group or teacher room for published lesson bodies and files.
This grants the deployment's shared published catalog; it does not create a
separate course catalog per group. Administrators curate all courses and general
support, but only the assigned administrator sees a private teacher room.
Multi-institution tenancy requires additional authorization design.

Client-facing tables use RLS with read grants and policies. Direct client writes
are not granted. Public invoker wrappers call private privileged functions that
check identity, permissions and revisions inside the transaction. Keep
`portal_private` out of browser-facing schema exposure. Review owners, privileges
and [RLS configuration](https://supabase.com/docs/guides/database/postgres/row-level-security)
when adapting these examples. A frontend role label is not authorization.

`pnpm test:ci` explicitly loads the pinned development-only PGlite PostgreSQL
engine and executes contract, adapter, SQL-policy and service tests. Database
tests invoked directly without `OLR_PGLITE_MODULE` are explicitly skipped. These
fixtures do not verify hosted JWT issuance, SMTP, actual malware scanning or
production gateways. Before release, test the configured service directly with
anonymous users, unrelated confirmed learners, two administrators, revoked staff,
expired/reused invitations, malformed requests and stale revisions. Verify the
complete email callback/recovery flow and deployed response headers separately.

Operators must define retention, export/deletion, moderation, staff access,
backups, incident response and account lifecycle. Removing membership or staff
access prevents future authorized requests; it cannot erase downloaded copies.
Tests and schema examples establish neither production readiness nor legal,
security or accessibility certification.
