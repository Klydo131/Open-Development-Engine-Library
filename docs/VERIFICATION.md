# Verification scope

Validation results apply to the exact source revision and environment tested.
Use the [GitHub Actions runs](https://github.com/Klydo131/Open-Development-Engine-Library/actions/workflows/ci.yml)
to inspect hosted results; this document does not assert that a particular run passed.

## Reproduce checks

From the repository root, using Node.js 24 LTS and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm lint
pnpm typecheck
pnpm test:ci
pnpm build
pnpm check:bundle
pnpm test:packages
pnpm exec playwright install
pnpm test:e2e
```

The [testing guide](TESTING.md) describes scoped browser commands. The
[CI guide](CI-CD.md) describes the configured gates and their trust boundaries.

## Coverage and limits

| Check | Scope |
| --- | --- |
| Lint and TypeScript | Configured correctness rules and static types |
| Unit and contract tests | Catalog validation, formats, encryption, revision conflicts, adapter contracts and selected-data boundaries using synthetic fixtures |
| PostgreSQL fixtures | Example schema grants, row policies and mutations with synthetic Auth functions |
| SDK fixtures | Pinned SDK behavior against mocked service responses |
| Package consumers | Packed engine imports and an isolated TypeScript consumer |
| Bundle budgets | Initial compressed entry sizes against configured byte limits |
| Browser tests | Configured workflows, storage, navigation, locking, import/export and selected accessibility states |
| Dependency advisory check | Known advisories reported by the registry at the time of the query |

Browser coverage includes desktop Chromium, Firefox and WebKit, iPhone/iPad-sized
WebKit, Android-sized Chromium and a Chromium tablet. These profiles are not
physical hardware or complete copies of released Safari. Automated accessibility
checks cover only the rendered states exercised. See
[manual device and accessibility checks](APPLE-TESTING.md).

The native review-date control requires physical-device verification. Behavioral
tests do not establish learning effectiveness. Database and SDK fixtures do not
verify live email delivery, JWT issuance, deployed row policies, gateway behavior,
distributed abuse controls or staff authentication. Follow the
[portal deployment checks](COURSE-PORTAL.md) for a configured service.

Independent security review, assistive-technology evaluation and deployment-specific
privacy/legal assessment remain separate from these automated checks. Passing CI
does not enable repository protection, publish packages or deploy the application.
