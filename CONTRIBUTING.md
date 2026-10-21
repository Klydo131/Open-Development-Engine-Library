# Contributing

Build a small, reusable library engine that respects the people who use it.
A change should solve a concrete library problem and explain why it belongs
in the engine, an adapter, or the example application.

## Local development

Use Node.js 24 LTS and pnpm 11.19.0. Install with
`pnpm install --frozen-lockfile` and run `pnpm dev`.
The source layout is described in [Architecture](docs/ARCHITECTURE.md).

Keep the catalog and storage contracts independent of UI frameworks and hosted
services. Add provider-specific code in examples or adapters. Use explicit
user actions for third-party requests, imports, exports and destructive changes.
Do not include telemetry or send library content to an external service by default.

## Before proposing a change

1. Describe the problem, expected behavior and affected data boundary.
2. Add meaningful tests for validation, privacy, conflict handling or migration
   when that behavior changes.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
   `pnpm check:bundle`, `pnpm test:packages` and relevant browser tests.
4. Explain format compatibility and migration for persisted-data changes.
5. Record user-visible changes in the sample application's update feed.
6. Document remaining limitations and the checks actually performed.

`test:ci` requires the pinned PostgreSQL/WASM fixture instead of silently
skipping database-policy checks. Keep the three portable packages free of app
and provider runtime dependencies. Use failed tests to reproduce behavior before
changing it; do not lower budgets or disable checks to make a change pass.
See [CI and deployment gates](docs/CI-CD.md). A local pass does not activate
repository protection or authorize a release.

Use synthetic examples and test files. Do not attach real user libraries,
passphrases, access tokens or identifiable screenshots to public issues,
test fixtures, traces or pull requests. Browser traces can contain private
material; inspect and redact them before sharing.

Security reports follow [SECURITY.md](SECURITY.md).
Do not post exploit details or private user data in a public issue.

## Source and licensing

Contribute only material you have the right to contribute. Identify adapted
third-party code and preserve its license notices. Original contributions are
submitted under the project's MIT License; imported library content has separate
rights. Dependency additions need a reason, pinned versions and lockfile updates.

When distributing a package or web build, retain the project's license and
the upstream licenses and notices that apply to included dependencies. Review
transitive dependencies as well as direct ones.

## Review expectations

Prefer direct code over abstractions that anticipate unimplemented features.
Keep accessibility, keyboard use, international text and narrow screens usable.
Do not call a service safe, encrypted end to end, legally compliant, certified,
or compatible with a device unless the implementation and evidence support the
precise claim.
