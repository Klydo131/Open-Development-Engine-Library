# Open Development Engine Library

[Source repository](https://github.com/Klydo131/Open-Development-Engine-Library) ·
[Development checks](https://github.com/Klydo131/Open-Development-Engine-Library/actions/workflows/ci.yml)

A portable TypeScript engine for private digital libraries, with a reference web
application for collecting sources, writing notes and practicing from learning
briefs. The engine packages have no UI framework or hosted-service dependency.

**Status: alpha.** APIs and formats may change. Keep separate backups of important
material. No independent security audit or regulatory certification is published.

The reference application is called Learn and Apply. Existing
`@open-learning-rooms/*` package names, storage keys and backup identifiers remain
unchanged for compatibility.

## Included components

- Catalog records for resources, creators, languages, subjects, rights and provenance.
- Collections, local metadata search and selected-field DCMI-term mapping.
- Separate asset bytes, bounded validation and exact portable-size preflight.
- Revision-aware memory and IndexedDB storage, encrypted backups and legacy import.
- An optional education package for versioned briefs, private attempt revisions,
  selected-text exchange and feedback.
- A responsive reference application with guided study, reading controls and locking.
- A separate course/support portal with a temporary local demonstration and an
  optional Supabase email-account and database-policy example.

The catalog uses a bounded, single-user snapshot model. The course portal's
authorization applies to its own records; it does not grant access to private
vaults. See [Architecture](docs/ARCHITECTURE.md) for the component boundaries.

## Run locally

Use Node.js 24 LTS and pnpm 11.19.0, matching the package-manager pin.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open the address printed by Vite, normally
[http://127.0.0.1:4178](http://127.0.0.1:4178). The course/support demonstration is
available at `/portal.html`; its preview changes disappear on refresh and no email
is sent. Configuring a provider requires the separate
[portal setup](docs/COURSE-PORTAL.md).

```sh
pnpm build
pnpm preview
```

The web build is written to `apps/web/dist`; each portable package builds to its
own `dist` directory. Serve the web application over HTTPS outside localhost.

## Validation

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

See [Testing](docs/TESTING.md) for scoped commands and
[verification scope](docs/VERIFICATION.md) for what the checks establish.
Automated browser profiles do not certify physical-device compatibility or full
accessibility conformance.

## Privacy and recovery

The private room encrypts saved browser data and whole-library backups. Its
passphrase is a local decryption secret, not an online account. There is no
passphrase-recovery service; browser storage may be cleared or evicted, so keep
encrypted backups. Changing a passphrase does not change older downloaded backups.

Local practice suggestions require no analytics, advertising, identity profiling
or remote AI service. Opening an external source contacts that website. Hosting
operators may receive ordinary request metadata when serving the application.
Encryption cannot protect an unlocked room from a compromised device, browser
extension or application build.

Selected-text exchange previews the outgoing fields and uses a separate file
passphrase by default. Readable JSON is an explicit alternative. Private journals,
unrelated attempts, private plans, review dates and attachments are excluded.
Selected text can still identify someone; neither exchange mode verifies identity.
See [Education](docs/EDUCATION.md) and [Security](SECURITY.md).

## Documentation

- [Architecture and package boundaries](docs/ARCHITECTURE.md)
- [Data formats and migration](docs/FORMAT.md)
- [IndexedDB adapter](docs/INDEXEDDB.md)
- [Backup and passphrase controls](docs/RECOVERY.md)
- [Capacity and validation limits](docs/CAPACITY.md)
- [Unsaved edits](docs/DRAFTS.md)
- [Selected DCMI-term metadata](docs/DCMI.md)
- [Learning briefs and selected exchange](docs/EDUCATION.md)
- [Guided study](docs/AGE-INCLUSIVE-STUDY.md)
- [Classroom authorization and abuse-control references](docs/CLASSROOM-AUTHORIZATION.md)
- [Course and support portal](docs/COURSE-PORTAL.md)
- [Hosting examples](docs/HOSTING.md)
- [CI and deployment boundaries](docs/CI-CD.md)
- [Browser and accessibility testing](docs/APPLE-TESTING.md)
- [Contributing](CONTRIBUTING.md)

## License and operator responsibilities

Source and documentation are available under the [MIT License](LICENSE), including
personal and commercial use under its terms. Retain the applicable
[third-party notices](THIRD_PARTY_NOTICES.md) when distributing dependencies or
built assets. Imported books, recordings, videos and other materials retain their
own rights; the software license does not grant permission to redistribute them.

Operators are responsible for their service configuration, content permissions,
user access, privacy, retention, accessibility and applicable legal obligations.
Example hosting configuration and passing automated checks do not establish
production readiness or legal compliance.
