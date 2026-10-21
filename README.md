# Open Development Engine Library

[Source repository](https://github.com/Klydo131/Open-Development-Engine-Library) ·
[Development checks](https://github.com/Klydo131/Open-Development-Engine-Library/actions/workflows/ci.yml)

An open source library engine for organizing private collections of knowledge.
Learn and Apply is the example web application: gather sources, write notes,
recall what you learned, and turn lessons into small practical projects.

The engine is the foundation. A library should be usable without React,
a particular hosting provider, or an external recommendation service.

This is the project's provisional name. The Learn and Apply reference app was
previously called Open Learning Rooms. Existing `@open-learning-rooms/*` package
names, storage keys and backup identifiers remain unchanged for compatibility.

**Status: local alpha, under active development.** APIs and formats may change.
Keep separate backups of important source material. The project has no published
security audit or regulatory certification. Automated WebKit tests do not
establish compatibility with every Apple device.

## What is included

- A portable catalog of resources, creators, languages, subjects, rights and provenance.
- Flat collections and local metadata search.
- Asset bytes separated from catalog metadata, with bounded validation.
- Memory and IndexedDB storage with revision checks to reject stale writes.
- Versioned encrypted backups and a bridge for the original learning-library format.
- A responsive Learn and Apply sample with local practice suggestions.
- An optional education adapter and Briefs workspace: reusable tasks, private
  attempt revisions, selected text handoff and feedback.
- Exact portable-size preflight before asset encoding, with existing limits retained.
- Explicit field selection for descriptive [DCMI-term metadata](docs/DCMI.md).
- Optional hosting examples; the sample works without a cloud account.
- Optional guided study with Read, Try, Check and Plan, learner-controlled
  text size/spacing, and an inactivity warning before the private room locks.
- A separate course and support portal: memory-only local demonstration, plus
  a provider-neutral contract and Supabase email-account/RLS reference.

The first milestone is a private single-user engine. Circulation, institutional
identity beyond the optional course portal, collaborative editing, OCR, full-text indexing and
library interchange protocols are future work.

## Run locally

Use Node.js 24 LTS and pnpm 11.19.0, matching the repository's package-manager pin.
From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open the local address printed by Vite, normally
[http://127.0.0.1:4178](http://127.0.0.1:4178).
For a production build and local preview:

```sh
pnpm build
pnpm preview
```

The web build is written to `apps/web/dist`. Serve it over HTTPS outside localhost.
The core package builds to `packages/core/dist`. The optional education package
builds to `packages/education/dist`; the portal contract builds to
`packages/portal/dist`. These packages do not require React or a hosted
service; the application provides its own interface and persistence.

## Check a change

```sh
pnpm lint
pnpm typecheck
pnpm test:ci
pnpm build
pnpm check:bundle
pnpm test:packages
pnpm exec playwright install
pnpm test:e2e
```

The browser suite uses Chromium, Firefox and WebKit desktop, iPhone and iPad
profiles. A passing run means those automated scenarios passed in that
environment. It does not certify production authorization, accessibility
conformance, or physical-device compatibility.

## Privacy in the example application

Your library is encrypted before it is saved in browser storage or exported as
a whole-library backup.
The passphrase unlocks the local vault; it is not an online account.
Use a long, unique passphrase and keep it safe: this example has no recovery
service. Browser storage can be cleared or evicted; export encrypted backups.

Suggestions use lesson information on the device. The sample does not require
analytics, advertising, identity profiling, or a remote AI service. Links open
only after a deliberate action. Visiting an external source reveals information
to that website, including the visitor's IP address. Hosting operators can also
receive ordinary request metadata when serving the app.

Encryption protects saved content, not a compromised device, malicious browser
extension, or a modified application while the room is unlocked.
See [the security policy](SECURITY.md).

The **Briefs** workspace also lets you deliberately export one brief, selected
answer or feedback record. Its preview shows the outgoing text. Encrypted files
with a new, separate file passphrase are the default; readable JSON is an explicit
alternative. Neither mode verifies the sender or recipient. Private journals,
other attempts, private next actions, review dates and attachments are excluded.
Anything personal typed into the selected text is still disclosed to its reader.
See [the education workflow and sharing boundary](docs/EDUCATION.md).

## Documentation

- [Architecture and integration boundaries](docs/ARCHITECTURE.md)
- [Data formats, backups and migration](docs/FORMAT.md)
- [Hosting and optional Supabase example](docs/HOSTING.md)
- [Testing and local preview](docs/TESTING.md)
- [Local verification record](docs/VERIFICATION.md)
- [Apple and accessibility verification](docs/APPLE-TESTING.md)
- [Roadmap and release gates](docs/ROADMAP.md)
- [Teacher–student and security development research](docs/EDUCATION-AND-SECURITY-RESEARCH.md)
- [Learning briefs, selected handoff and feedback](docs/EDUCATION.md)
- [Optional classroom authorization and abuse-control reference](docs/CLASSROOM-AUTHORIZATION.md)
- [Age-inclusive guided study and its evidence limits](docs/AGE-INCLUSIVE-STUDY.md)
- [Institutional courses, email accounts and support](docs/COURSE-PORTAL.md)
- [CI checks and deployment boundaries](docs/CI-CD.md)
- [Contributing](CONTRIBUTING.md)

## License and content rights

See [third-party notices](THIRD_PARTY_NOTICES.md) for the checked runtime
dependency inventory and retained licenses. Preserve those notices when
distributing built assets; dependencies and library materials keep their own
rights.

Original project source and documentation are available under the
[MIT License](LICENSE). Personal and commercial use are permitted under its
terms, including retaining the copyright and permission notice.

The software license does not license a user's books, videos, music, documents
or other imported material. Recording rights and provenance helps a developer
preserve that distinction; it does not establish permission to redistribute
the material. Trademarks and third-party dependencies retain their own rights.

Installed direct dependencies currently declare these licenses:

| Dependency | Declared license |
| --- | --- |
| React, React DOM | MIT |
| Supabase JavaScript SDK (optional portal application) | MIT |
| Oxlint (development checks) | MIT |
| Lucide React | ISC |
| Vite | MIT |
| TypeScript, Playwright Test, fake-indexeddb, PGlite | Apache-2.0 |
| axe-core Playwright integration | MPL-2.0 |
| Node, React and React DOM type definitions | MIT |

Retain upstream license texts and applicable notices when distributing
dependencies or generated bundles. The lockfile also includes transitive
dependencies with their own terms; the table is not a complete distribution
notice inventory.

## Deployment responsibilities

The engine can support public or private library products, but each operator
must assess the actual service, users, content rights and applicable laws.
This alpha is not approved by the Philippines NPC, DICT, CICC, SEC or DTI and
does not claim universal legal compliance. Open source availability does not
replace privacy, business-registration, consumer, accessibility, child-safety,
copyright, or cross-border obligations for a particular deployment.

Automated coverage includes desktop Chromium/Firefox/WebKit, iPhone/iPad-sized WebKit, Android-sized Chromium and Chromium tablet layouts. These are browser/emulation checks, not physical-device certification. See docs/TESTING.md.

16 October 2026: optional standalone IndexedDB adapter is available through
`@open-learning-rooms/core/indexeddb`. See [the adapter guide](docs/INDEXEDDB.md).

16 October 2026: change your room passphrase or check a backup without replacing
your saved library. See [recovery guidance](docs/RECOVERY.md). Older downloaded
backups keep their original passphrases.

16 October 2026: unsaved-edit warnings protect supported room/source navigation
and new-source dialog closing. Drafts remain in memory; save before locking.
See [draft behavior and research](docs/DRAFTS.md).

Engine size limits and scaling research: [capacity guide](docs/CAPACITY.md).
Philippine and international deployment boundaries: [legal readiness](docs/LEGAL-READINESS.md).

18 October 2026: the local education workflow uses an optional namespaced
adapter, keeping the generic catalog independent of school records. Executable
authorization and bounded abuse-control references are available for future
server integrations. They are not wired to the web app and do not create hosted
accounts, classroom access control, a firewall or deployed bot protection.
