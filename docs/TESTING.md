# Testing and local preview

Use Node 24 or later in a local workspace. Install with `pnpm install --frozen-lockfile`.

- `pnpm test`: model, crypto, migration, adapter and failure-recovery tests.
- `pnpm test:ci`: also requires and executes PostgreSQL/WASM policy fixtures.
- `pnpm test:packages`: packed offline ESM and TypeScript consumers after a build.
- `pnpm build`: type check, build the core package and produce the web application.
- `pnpm exec playwright install chromium firefox webkit`: install test browsers.
- `pnpm test:e2e`: complete browser checks and automated accessibility/reflow audit.
- `pnpm preview`: view the built app at http://127.0.0.1:4178.

The browser suite uses one worker to avoid oversubscribing shared local machines.
Separate tabs within the same test still exercise actual stale-write races.
Chromium/Firefox/WebKit desktop, iPhone/iPad-sized WebKit, Android-sized Chromium,
and a Chromium tablet are configured. The accessibility project alone bypasses
CSP to inject the audit tool; normal flow/security checks retain real headers.

Memory and IndexedDB run matching storage-contract tests. The unit IndexedDB
checks use fake-indexeddb; browser checks separately verify real IndexedDB-backed
persistence. Injected quota failures use synthetic state and prove the previous
saved vault is preserved. Legacy cloud tests mock fetch. Portal fixtures execute
PostgreSQL policies with synthetic Auth functions; real-SDK email tests mock
the service. Neither verifies hosted Auth, SMTP, gateway controls or live RLS.

Use fictional data. Do not commit downloaded private backups, traces, screenshots,
lab files, secrets or local runtime directories. Real phones/tablets/macOS Safari,
VoiceOver, file handling and storage-pressure behavior need recorded manual checks
before publishing specific hardware-support claims. An automated scan alone is
not a complete WCAG review or a security audit.

For a quick demonstration, choose **Explore a sample**. Changes last for that
sample session. Create a private room to try encrypted saving and backups.
The catalog keeps resource details/collections separate from personal learning
notes. Recommendations are off by default for new rooms and can be enabled locally.

Open `/portal.html` for the explicit learner/admin courses and support demonstration.
It sends no email and refresh clears its data. See [portal setup](COURSE-PORTAL.md)
and [CI and deployment boundaries](CI-CD.md).
