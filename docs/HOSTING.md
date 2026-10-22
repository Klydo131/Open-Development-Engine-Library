# Hosting and optional providers

The sample is a static web build. The catalog and storage contracts are reusable
without Vercel or Supabase. A provider adapter belongs outside the catalog model.

## Static hosting

Run `pnpm install --frozen-lockfile` and `pnpm build`.
Serve `apps/web/dist` over HTTPS. Use a stable origin: browser storage belongs
to an origin, and changing the host, scheme or port can make the previous local
vault unavailable to the new origin. Export a backup before moving hosts.

The repository's `vercel.json` is an optional example containing build settings
and security headers. Deploying elsewhere requires translating those headers
to the chosen server. Verify the deployed responses as well as the local preview.

The default Content Security Policy disallows remote connections and frames.
The separate `/portal.html` entry permits same-origin connections in demo mode.
It alone can allow one configured provider origin; the private room retains
`connect-src 'none'`. See [portal configuration](COURSE-PORTAL.md).
Keep it restrictive. Enabling a remote adapter requires a reviewed
`connect-src` change for the exact trusted HTTPS endpoint and renewed browser
tests. Avoid broad wildcard permissions.

Hosting providers can log visitors' IP addresses and other request metadata
even when library content stays in encrypted browser storage. Operators must
choose retention, region, access controls and a privacy notice appropriate
to their actual service.

No deployment is created by this repository's local build, and the examples
do not establish production suitability.

## Supabase example

`examples/supabase/schema.example.sql` and `examples/supabase/store.ts` illustrate
an opt-in encrypted snapshot store. They are not connected to the sample UI.
The example uses the legacy learning-vault envelope contract; do not pass
catalog-engine bundles to it without a deliberately versioned adapter and
matching schema.

Use a separate development project first. Review the SQL before running it;
it is a reference schema, not an idempotent production migration.

The account identifier used for authorization is separate from encrypted
library content. A client may use a publishable API key with a current user
access token. A publishable key identifies the application; ownership still
needs database authorization. Keep secret and service-role keys server-side.
See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

The example enables Row Level Security and owner policies for each operation.
Grants control access to the table; RLS controls access to rows. Review both.
Updates need a SELECT policy and matching USING/WITH CHECK ownership checks.
See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Before using remote storage with real data, verify in a disposable project:

1. Signed-out requests cannot read or mutate vaults.
2. User A cannot read, create, update, delete or reassign user B's vault.
3. Missing, invalid and expired tokens fail.
4. Two requests using the same expected revision cannot both overwrite a record.
5. Invalid envelopes and oversized requests are rejected without replacing data.
6. Account deletion, provider backup retention, session revocation and exported
   backups behave according to the operator's published policy.

Mock HTTP tests can verify adapter request handling. They do not prove that
a live database enforces its RLS policies. The example requires verification
against the configured deployment.

Consult the [Supabase changelog](https://supabase.com/changelog) before adapting
the example. Provider behavior and supported clients change over time.

The [course/support portal](COURSE-PORTAL.md) is a distinct adapter and
schema. It is not vault synchronization. The [CI gates](CI-CD.md) run checks
without deploying either service.
