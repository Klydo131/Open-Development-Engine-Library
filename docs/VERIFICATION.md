# Local verification — 2026-10-15

Version 0.2.0 is a local alpha. This record describes development evidence, not a
certification or a promise of support for every device or deployment.

| Check | Result |
| --- | --- |
| Type check, core build and web build | Passed |
| Engine, learning migration and storage/adapter tests | 50 passed |
| Browser and accessibility checks | 57 passed |
| Isolated JavaScript and TypeScript package consumers | Passed |
| Dependency advisory audit | No known advisories reported at check time |

The browser matrix covers desktop Chromium, Firefox and WebKit, iPhone/iPad-sized
WebKit, Android-sized Chromium and a Chromium tablet. Functional scenarios include
creation, notes/recall/practice, locking, encrypted export/restore, rejected corrupt
backups, concurrent tabs, encrypted unsaved recovery, metadata/collections and
successive legacy migrations. Storage tests include injected transaction failure.

Automated accessibility checks cover selected Home, Learn and Catalog states.
Reflow checks use widths of 320, 390, 768 and 1280 pixels. Fictional sample views
were also inspected at desktop and phone sizes. Neither emulation nor an automated
accessibility scan establishes physical-device or full WCAG conformance.

The local check used Windows, Node 24.19.0 and a pnpm command reporting 11.25.0;
the repository declares pnpm 11.19.0. No package was published and no hosted
Supabase/Vercel environment was created. Remote adapter checks mocked network
responses; live RLS and production authorization remain unverified.

Before release, complete the manual device, file/codec, storage-pressure and
VoiceOver checks in [APPLE-TESTING.md](APPLE-TESTING.md), the publication review in
[ROADMAP.md](ROADMAP.md), and deployment-specific security/legal assessment.
See [TESTING.md](TESTING.md) for reproducible commands.

Final homepage copy spacing was rebuilt and rechecked with the automated
accessibility/reflow project and phone visual review.

## Follow-up — 2026-10-16

Optional engine IndexedDB adapter: 56 unit/contract tests and seven new real-browser
profile checks passed, with no failures or skips. Packaged main/optional imports
were checked. The app JavaScript and CSS hashes remain identical to 15 October;
the prior full 57-check application suite was not repeated for this engine-only
change. See [INDEXEDDB.md](INDEXEDDB.md) for design, research and test commands.

## Passphrase and backup controls — 2026-10-16

Build/typecheck, 68 unit/contract tests and the complete 121 browser/accessibility
checks passed with zero failures/skips/flakes. Two workers were used for this
lab run; the configured default remains one. The suite includes eight new vault
scenarios across seven flow profiles and private settings/dialog accessibility
and 320/390/768/1280-pixel reflow. Standalone packed JS/TS rekey imports passed.
Six synthetic phone/desktop views were visually reviewed. Physical hardware,
VoiceOver, real storage pressure and deployment-specific legal/cloud checks remain
unverified. See [RECOVERY.md](RECOVERY.md) for behavior and research sources.

## Unsaved-work protection and capacity research — 2026-10-16

Build/typecheck, 82 unit/contract tests and the complete 199 browser/accessibility
checks passed, with zero failures/skips/flakes. Eleven new navigation/save-race
scenarios ran across all seven functional profiles. The new accessibility case
covers dirty catalog notices and new-source dialogs, including 320/390/768/1280
reflow. Four synthetic desktop/phone screenshots were visually reviewed.

Packed 21-file core, four JavaScript scenarios and three isolated TypeScript
consumers passed. Five new core cases cover reference vectors and binary
compatibility/malformed input. Shared decoding now avoids iterable conversion.

A separate isolated Node experiment round-tripped synthetic catalogs containing
0/1/10/20 MiB of assets. This is a single observation per size, not a browser or
physical-device benchmark. Current caps and format remain unchanged. See
[DRAFTS.md](DRAFTS.md) and [CAPACITY.md](CAPACITY.md) for researched limits and next
work. Physical-device lifecycle, VoiceOver and capacity tests remain pending.
No dependency audit or live-cloud check was newly run in this
pass; earlier results remain historical evidence.

## Local learning workflows and abuse references — 2026-10-19

Build/typecheck and 137 unit/contract checks passed. The 256-case browser matrix
passed 255 cases and exposed one iPhone test-helper race: the helper tried to
close a selected-text dialog that the app had already closed after download.
The corrected helper waits for the dialog to disappear. A final 11-case run
passed the encrypted two-room exchange across all seven functional profiles and
all four accessibility cases. All 256 distinct cases therefore have passing
evidence across the broad run and targeted recheck; this is not a claim that the
first broad run was entirely green. Neither run skipped cases or used retries.

The first two-worker attempt also had browser startup/download timeouts under
low available memory. Four isolated catalog cases and the broad/final recheck
used one worker. Existing Learn navigation test selectors were made precise
after the new Learning briefs label exposed their ambiguity.

New evidence covers exact-size bounds, private revision preservation, selected
text canaries, encrypted feedback exchange, replay/conflict/malformed imports,
backup/rekey preservation, inert markup, unsafe links and served headers.
Keyboard disclosure/dialog focus, selected-state axe checks and reflow at
320/390/768/1280px were included. Final copy clarifies temporary sample data and
the examples/source credits included in a shared brief; narrow selects use
16px text. These final copy/style changes were rebuilt before the recheck.

Isolated packed core and education packages passed ESM and external TypeScript
consumption without React/app/runtime dependencies. A current pnpm advisory
response reported zero known vulnerabilities; it is not a security or license
audit. Three synthetic desktop/phone views were reviewed. No physical Apple or
Android device, assistive-technology user, real learner or school was tested.

Authorization and fixed-window/concurrency/payload guards are executable server
references only. A synthetic single-process burst enforced its configured
budgets before protected work; no live backend, distributed limiter, WAF or
network DDoS test was performed. The prior formal security scan startup error
remains unresolved. Hosted isolation, physical devices and operator-specific
legal/privacy review remain release gates. No GitHub/package publication or
hosted deployment occurred.

## Guided study, course portal and CI preparation — 2026-10-21

Lint, TypeScript and production build passed. The 190 unit/contract/official-SDK/
PostgreSQL checks passed without failures or skips, including 13 PostgreSQL
results (the parent plus 12 subtests). Three packed engine packages, the optional
IndexedDB entry and an external TypeScript consumer passed without app/React
dependencies. CI configuration passed actionlint; its GitHub-hosted execution,
timing and repository protection settings remain untested.

The selected 217-case functional run passed 216 and exposed one WebKit desktop
review-date failure. Its trace showed an empty date before Save, rather than a
populated date lost by encrypted storage. An unchanged focused run and five
instrumented flows passed; the exact trigger remains unconfirmed. Guided study
now commits step-heading focus before paint rather than deferring it to an
animation frame. The test waits for Plan focus and asserts the date before Save,
while retaining the post-unlock assertion.

After rebuilding, all 76 scoped rechecks passed: 70 study/portal cases across
the seven functional profiles and six accessibility cases. Thus all 223 distinct
cases in this selected scope have passing evidence across the broad and scoped
runs. Neither run skipped cases, used automatic retries or reported flakes;
the original broad failure is retained. This does not repeat every historical
browser scenario. Native date entry still needs physical-device verification.

Selected-state keyboard/axe checks and reflow at 320/390/768/1280 pixels include
guided study, reading choices, course materials and support/editor views. Three
synthetic desktop/phone views were visually reviewed. No physical devices,
VoiceOver user, real learner or child participated; learning effectiveness and
full WCAG conformance are not established.

Initial gzip bytes are 107,303 JavaScript/8,562 CSS for the private entry and
136,919/10,432 for the portal, within the 160/20 KiB per-entry budgets. These
are transfer-size measurements, not device-speed benchmarks. A fresh advisory
query found three Vite 8.3.0 findings; exact Vite 8.3.3 and the updated lockfile
returned zero known advisories in the subsequent response.

Actual-SDK mocked-service tests exercise sequential fresh-client signup/recovery/
expired-code exchanges and bounded verifier storage. They do not establish
concurrent overlapping flows or live email delivery. Local HTTP checks verify
the demo portal's self-only connection policy and the private entry's disabled
connections; configured-provider and deployed headers remain untested. Callback
query/fragment state is removed after initialization, including failures; the
demo browser check also verifies disposable callback-state cleanup.

The optional schema uses actual PostgreSQL with synthetic Auth functions. Live
SMTP/Auth/JWT/Data API behavior, distributed abuse defenses, staff MFA enforcement,
hosted isolation and operator-specific legal/privacy review remain release gates.
Formal Codex Security review remains incomplete after the prior scan-start error.
The source remains a local alpha; no GitHub publication or deployment occurred.
See [study evidence](AGE-INCLUSIVE-STUDY.md), [portal setup](COURSE-PORTAL.md) and
[CI/CD boundaries](CI-CD.md).
