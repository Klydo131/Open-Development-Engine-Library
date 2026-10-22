# Course portal and human support

The optional portal provides course browsing, institution accounts, lesson text and support messages. Private-room data is not uploaded or exposed to administrators. The default demonstration uses simulated identities and Physics/Music samples, with no email or password storage. Its changes disappear when the page reloads.

## Using the demonstration

Open `/portal.html` in the local preview. Signed-out visitors see published course metadata, not lesson bodies or drafts. Choose **Preview learner** to read the original samples and submit a selected support message. Choose **Preview admin** to prepare a course draft, review its text and rights, publish it and reply to support. Return to the learner preview to read the reply. These switches are explicitly local demonstrations, not authentication or a reusable access-control implementation.

Lessons use plain text with optional credited source links. The samples offer Read → Try → Check → Plan. Standard/larger reading text is a preference for the current page; it does not change lesson content or assess ability. These controls do not establish learning effectiveness.

Material creation and support forms preserve unsaved text after a failed save. Internal navigation and page refresh warn about unsaved edits. A form is disabled while its mutation is in flight. Course structure changes, including adding or removing lessons, also count as edits. A verified account identity, role or recovery change clears institutional working data; a same-account token refresh does not discard drafts. Password inputs are excluded from the private in-memory draft tracker; email and content field baselines retire when their forms unmount. No draft tracker writes to disk.

## Provider contract and records

`packages/portal/src/index.ts` supplies a provider-neutral `CoursePortal` contract and strict record validators, without React, networking, account storage or private-room data. The web interface depends on this contract; `examples/supabase/course-portal.ts` implements the optional provider adapter.

| Operation | Purpose |
| --- | --- |
| `account`, `onAccountChange` | Verified institution identity, assigned role and recovery state |
| `signUp`, `signIn`, `requestPasswordReset`, `updatePassword`, `signOut` | Provider-managed email account lifecycle |
| `listCourses`, `saveCourse(course, expectedRevision)` | Published metadata/materials and administrator editing with revision comparison |
| `getSupport`, `askSupport`, `replySupport(id, reply, expectedRevision)` | Explicit learner messages and authorized staff replies |

A course carries a UUID identifier/revision, title, purpose, language, draft/published status and ordered materials. Each material has title, plain text, optional HTTP(S) source, creator credit and content rights. A support thread contains only the selected subject/message, optional course, owning learner ID, reply, status and revision. There is no private-room bundle, journal, encryption key, attached file, age or public roster in these records. Account email is shown only for the current account in this interface.

Published courses require at least one material and explicit creator/rights statements. Publication checks establish that information is supplied, not that a claimed license is legally valid or an outside link is safe. The software's MIT license does not license third-party course content. The sample writing is original and separately labeled CC BY 4.0.

The current portal edits the latest course revision with compare-and-swap. It does **not** archive immutable published editions, enroll cohorts, track completion, grade answers, assign individual tutors or transfer private-room submissions automatically. The education adapter's versioned briefs and selected exchanges remain a separate feature. Limits are 100 courses/threads per response, 50 materials per course, 256 KiB per course, 20,000 characters per material and 5,000 per support message/reply. Larger deployments need authorized pagination and retention design.

## Optional Supabase setup

Use a separate, disposable project to verify the example before applying it to any live installation. No real account project, delivery service or external recipient is configured merely by running the local demonstration.

1. Inspect `examples/supabase/course-portal-schema.sql` and apply it through a trusted PostgreSQL 15+ database-owner connection. It is a transactional **schema example**, not an automatically discovered migration or an idempotent rerunnable installer. Do not expose the `portal_private` schema through the Data API.
2. Enable email confirmation and disable anonymous sign-ins. The adapter rejects unconfirmed/anonymous users, while the database assumes the provider issues ordinary authenticated sessions under that configuration. Set an exact trusted HTTPS site/callback URL and allowlist the portal callback; keep local loopback callbacks limited to development. Confirm the email template uses the intended redirect and test the complete callback flow. [Password flow](https://supabase.com/docs/guides/auth/passwords), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
3. Provision the first administrator from the trusted database connection using a confirmed user's UUID. Never grant this role from self-signup, user-editable metadata, email domain or a browser setting:

   ```sql
   insert into portal_private.administrators(user_id)
   values ('CONFIRMED-USER-UUID');
   -- Revoke through the same trusted owner connection:
   delete from portal_private.administrators
   where user_id = 'CONFIRMED-USER-UUID';
   ```

4. Connect the pinned official SDK client to `supabaseCoursePortal(client, {redirectTo})` with a **publishable** key. No secret/service-role key belongs in a browser build. The adapter checks identity with `getUser`; the server-owned administrator table decides staff access. The browser role label only controls presentation.
5. Configure production SMTP, provider Auth rate limits and accessible abuse defenses; verify delivery and recovery with synthetic accounts and a controlled mail sink. These controls are operator work, not guarantees supplied by the local in-memory limiter. The reset UI gives a generic next-step message and never claims that an email was delivered. [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

### Build configuration and token storage

Leave both public environment settings empty for the demonstration. To configure
an institution, set `VITE_PORTAL_SUPABASE_URL` to its exact HTTPS origin and
`VITE_PORTAL_SUPABASE_PUBLISHABLE_KEY` to a modern `sb_publishable_` key in a
local ignored environment file or the deployment's settings. The build rejects
partial configuration, URLs with credentials/paths/queries, secret keys and
legacy role JWTs. HTTP is accepted only for a loopback development provider.
These are public browser settings; no private key belongs in either variable.

The trusted callback is exactly the current origin's `/portal.html`. Allowlist
that URL in Auth and verify its email templates. The pinned official SDK handles
PKCE code exchange before the portal renders. Callback query/fragment state is
removed from browser history, including failures. Recovery state comes from
the SDK event after exchange, not a query flag. An email reset does not establish
a private-room decryption key.

Account access/refresh tokens remain in memory and are lost on refresh or page
exit. The custom SDK storage persists only its one-time PKCE verifier, bounded
per-flow slots and five-flow index for at most one hour. Consumed state is
removed; corrupt, expired or clock-rollback state fails closed. Nothing in that
storage contains private-room notes or passwords. Pending expired records are
removed on access or next portal initialization; there is no background service
that deletes browser data at an exact wall-clock time. Blocked browser storage
can prevent email redirects from completing.

Open email links in the same browser/device where the request began. This is a
[PKCE constraint](https://supabase.com/docs/guides/auth/sessions/pkce-flow), not an
all-device account recovery promise. The example opts into the pinned SDK's
experimental per-flow redirect identifier to support overlapping requests;
its key formats and callback behavior have actual-SDK mocked-service tests.
Review and rerun these tests before SDK upgrades. Account recovery on a different
browser needs a separate reviewed server/OTP flow; it is not silently weakened
to bypass the verifier. No configured live SMTP or Auth project was exercised.

Only the portal entry loads the provider SDK and permits connections to its
configured service origin. The private entry keeps `connect-src 'none'`. After
setting public configuration, run `pnpm configure:portal` locally and review
the portal-only CSP in `vercel.json`. A Vercel build rejects a mismatch between
that policy and provider configuration. The command writes the public origin
policy, never the key. Other hosts must serve equivalent response headers;
Vite preview middleware is not production security configuration.

## Server authorization and checks

The SQL example is a **single operator** model: anonymous visitors read published metadata; signed-in non-anonymous users read published materials and their own support; provisioned administrators manage all courses and support for that deployment. Drafts and another learner's messages must remain unavailable when calling the Data API directly. Multi-institution or assigned-tutor isolation is not implemented here and cannot be obtained by adding a frontend filter.

Every exposed table enables RLS. Client roles receive read grants and matching policies, without direct INSERT/UPDATE/DELETE grants. Public mutation wrappers run as invoker and call narrowly scoped private privileged functions that check current identity/administrator membership and revision inside the database transaction. Administrator revocation is read from the trusted table on the next call. Review privileged function ownership and grants when adapting the example. RLS and grants are separate protections; inspect both. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Run the ordinary contract, adapter and local demonstration checks from the repository:

```powershell
node --experimental-strip-types --test tests/portal.test.ts tests/portal-adapter.test.ts tests/portal-demo.test.ts tests/portal-config.test.ts
```

`pnpm test:ci` executes SQL against a PostgreSQL engine provided by the exact-pinned
development-only PGlite dependency. The lower-level fixture can also run when
`OLR_PGLITE_MODULE` points to a reviewed entry module:

```powershell
$env:OLR_PGLITE_MODULE = '<absolute path to the reviewed local PGlite entry module>'
node --experimental-strip-types --test tests/portal-schema.test.ts
```

Without that variable, the database test is explicitly skipped. Its synthetic Auth functions exercise database grants, row policies and mutations; they do not verify Supabase JWT issuance, email confirmation, SMTP, HTTP gateway limits or an actual hosted project. Before release, repeat direct API tests with anonymous, two unrelated confirmed learners, a provisioned administrator, a revoked administrator and malformed/stale requests on the configured service. Test email expiry/reuse/tampering, sign-out/session handling, password recovery, error states and same-browser callbacks separately. Run database advisors and the deployment's own tests after adapting the schema.

## Recovery and operator responsibilities

Recovering an institution password restores that account only. It cannot decrypt a private room whose passphrase only its owner possesses. The UI states this separation before recovery. Users still need their private-room passphrase and encrypted backups.

Institution support messages are personal data visible to authorized institutional staff; this is a different privacy boundary from device-encrypted notes. The operator must define access, retention, export/deletion, moderation, backups, incident response, staff authentication and enrollment arrangements before public use. Deployment-specific security, privacy and accessibility checks remain necessary.
