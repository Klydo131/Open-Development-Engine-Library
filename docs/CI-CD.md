# Safe, bounded delivery checks

The [GitHub Actions workflow](https://github.com/Klydo131/Open-Development-Engine-Library/actions/workflows/ci.yml)
runs checks only. It configures no deployment or release. Hosted results and
timing must be read from the actual run; local checks do not prove Linux runner
behavior or repository protection settings.

## Gates and speed

The engine job installs the frozen lockfile with lifecycle scripts disabled,
runs pinned Oxlint correctness checks and TypeScript before the unit/SDK/PostgreSQL fixtures, builds the portable packages and both web
entries, tests packed packages in an isolated offline consumer, then checks
known high/critical dependency advisories. A registry failure fails the audit
gate. Lint warnings fail the job. The few intentional C0/DEL rejection expressions
have line-specific explanations; unused suppression directives also fail lint.
Type checking also runs as part of the build.

`pnpm check:bundle` guards each built entry at 160 KiB JavaScript and 20 KiB CSS
gzip (level 9), counting module scripts, static module preloads and stylesheets
once per entry. Missing assets fail the check. Dynamic imports are excluded
from this initial transfer budget. These deterministic byte limits are regression
checks, not a claim about device response time or Core Web Vitals.

The same check requires built `LICENSE` and `THIRD_PARTY_NOTICES.md` to match
their source files. The build emits these assets through the
[Vite plugin interface](https://vite.dev/guide/api-plugin.html), using the
[bundler's asset emission](https://rolldown.rs/reference/Interface.PluginContext#emitfile).
Copy the complete output directory when distributing or deploying it.

Local build measured on 2026-10-21:

| Entry | Initial JavaScript gzip | Initial CSS gzip |
| --- | ---: | ---: |
| Private rooms | 107,303 bytes | 8,562 bytes |
| Courses and support | 136,919 bytes | 10,432 bytes |

Re-run the command for the current build. The provider SDK bundled in the portal
is included; service response times and device work are not measured here.

The browser job starts only after the engine passes. Three bounded shards cover
the complete configured browser matrix, each with one worker. Local development
retains one worker because memory pressure has caused timeouts. Compare actual
run duration and runner cost before increasing shards. No speed multiplier is
claimed without data. [Playwright sharding](https://playwright.dev/docs/test-sharding)
describes the mechanism.

The package-manager content store is cached by lockfile. Build output,
`node_modules`, credentials, test traces and user data are not cached or uploaded.
Superseded runs are canceled. Jobs have explicit time limits. The stable final
`ci` job requires every gate to succeed; configure it as required when the owner
supplies the repository. There are no path filters that leave a required check
pending on documentation-only pull requests.

`pnpm test:ci` sets the local PGlite module explicitly, so database authorization
tests cannot silently skip. `pnpm test:packages` checks offline tarball imports
and an external TypeScript consumer, including the optional IndexedDB entry.
Neither command publishes packages.

## Trust boundaries

Only push, pull-request and manual checks are configured. There is no privileged
pull-request workflow, self-hosted runner, automatic merge, publication or deploy
command. The token receives repository contents read permission; checkout does
not persist credentials. Actions use reviewed full commit IDs. Node and pnpm
versions are explicit; dependency resolutions/integrity stay in the lockfile.
Dependabot proposes bounded updates for human review after repository creation.

Do not give untrusted PR code deployment keys, production data or protected
environment credentials. Pinning is not a guarantee of trustworthy code. Follow
[GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use)
and [cache boundaries](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows).
Fork approvals, branch protection and review requirements must be set in the
actual repository; a YAML file cannot enable or prove these settings.

## Deployment boundary

The owner reviews the local application before GitHub publication. After a
hosting project is chosen, require a protected production environment and a
least-privilege deployment identity. Provider configuration, schema changes and
account/mail testing stay separate from untrusted PR jobs. Run
`pnpm configure:portal` locally after setting public provider values, review
the exact origin in `vercel.json`, and test the deployed response policy.

For Vercel, stage an approved production build without assigning domains, test
it, then promote that same production deployment. Promoting a preview can rebuild
with different environment values. See
[Vercel's promotion guidance](https://vercel.com/docs/deployments/promoting-a-deployment).
Database changes need their own tested recovery plan; reverting a frontend
does not undo a schema change.

No automatic deployment is configured until repository, project, approval
settings and recovery are concrete. Private records, raw research and browser
state do not belong in public artifacts or customer feeds. CI validates tested
behavior for its commit; it is not security, legal or accessibility certification.
