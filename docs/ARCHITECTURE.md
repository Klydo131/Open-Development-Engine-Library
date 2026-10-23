# Architecture

The engine models a library independently of how a person learns from it.
Learn and Apply is one consumer of that engine. Applications can supply their
own interface and tools without adopting the sample's lesson or practice model.

## Boundaries

| Area | Responsibility |
| --- | --- |
| `packages/core/src/catalog.ts`, `dcmi.ts` | Catalog validation, mutations, collections, local metadata search, portable bundles and selected DCMI JSON fields |
| `packages/core/src/catalog-vault.ts` | Versioned authenticated encryption for catalog bundles |
| `packages/core/src/catalog-rekey.ts` | Pure preparation of a passphrase change; caller commits conditionally |
| `packages/core/src/catalog-store.ts` | Revision-aware ciphertext storage contract and memory reference store |
| `packages/core/src/model.ts`, `crypto.ts`, `recommendations.ts` | Compatibility with the original learning model and vaults |
| `packages/core/src/indexeddb-store.ts` | Optional standalone browser persistence via the `./indexeddb` package entry |
| `packages/education/src/index.ts` | Optional versioned briefs, private attempts, selected submissions, feedback and text exchange |
| `packages/education/src/authorization.ts`, `abuse-guard.ts` | Trusted-server permission and request-budget references; not web-app enforcement |
| `apps/web/src/education-store.ts` | Preserve the education namespace within encrypted catalog saves |
| `apps/web/src/education-exchange.ts` | Selected-text file encryption/decryption using an independent passphrase |
| `apps/web` | Example interface, legacy browser persistence and learning workflow |
| `packages/portal/src/index.ts`, `groups.ts`, `media.ts` | Provider-neutral account, course, support, group and media contracts with bounded runtime validators |
| `apps/web/portal.html`, `src/PortalPanel.tsx`, `GroupPanel.tsx`, `PortalTutorial.tsx` | Separate library entry: Learner/Admin tools, groups, teacher requests and optional role tutorials |
| `apps/web/src/portal-demo.ts`, `portal-demo-groups.ts`, `portal-media-demo.ts` | Memory-only course, support, group, invitation and mixed-media demonstration |
| `examples/postgres/course-portal-schema.sql` | Primary PostgreSQL account, admin, course and support schema; independent of an identity provider |
| `examples/postgres/group-workspace-schema.sql`, `group-workspace.ts`, `portal-rpc.ts` | Group membership, discussions, sessions, invitations, private teacher rooms and trusted-server RPC ports |
| `examples/postgres/media-schema.sql`, `media-store.ts` | Private media bytes, metadata/integrity checks and a dedicated server-only storage port |
| `examples/http/group-invitations.ts`, `library-media.ts`, `portal-services.ts` | Fetch handlers and client service adapters; injected verified authentication, email delivery and upload scanner |
| `examples/http/bounded-fetch.ts` | Response-size and elapsed-time bounds for provider transport |
| `examples/supabase/course-portal.ts`, `group-workspace.ts` | Optional email Auth/SDK course and group adapters |
| `examples/supabase/course-portal-schema.sql` | Optional Auth-to-account bridge installed after the portable PostgreSQL core schema |
| `examples/supabase/store.ts`, `schema.example.sql` | Optional reference adapter for the original learning-vault contract |
| `tests` | Core and browser verification with synthetic data |

The core uses platform capabilities such as Web Crypto, typed arrays and text
encoding. It has no React, database client, hosted service, analytics or network
dependency. The sample imports local source during development. The repository
builds three independent packages at `packages/core/dist`,
`packages/education/dist` and `packages/portal/dist`. Their main entry points
export `dist/index.js` and matching declarations; the core also exposes the
optional `./indexeddb` entry. All three packages have no runtime dependencies.
Packed-package tests exercise an isolated consumer; this does not publish them
to a registry. Supabase's SDK belongs only to the optional portal application
entry; the private room keeps `connect-src 'none'`.

The guided study view reuses existing education attempts and encrypted saves;
its stage/readability choices do not change the storage format. Institution
accounts and recovery never unlock a private vault. Course materials and selected
support messages, group discussions and uploaded course files are separate
service data when a provider is configured. See the
[portal guide](COURSE-PORTAL.md) and [study guide](AGE-INCLUSIVE-STUDY.md).

## Catalog and content

A resource is a catalog record: title, kind, description, creators, languages,
subjects, rights, provenance and references to assets.
A collection is a flat, ordered list of resource identifiers.
Assets describe named bytes with media type, length and SHA-256.

The catalog contains descriptors. A separate content map holds the actual bytes.
This makes the metadata boundary explicit and lets storage adapters operate
without embedding provider URLs, authentication identities or file blobs in
every resource. The current portable bundle still contains all asset bytes;
it is an in-memory snapshot, not a large-file streaming system.

All engine mutations return validated catalogs with a fresh revision.
Identifiers must be unique across resources, assets and collections.
References must resolve. Removing a resource removes it from collections but
preserves its assets; applications may explicitly clean up assets that are no
longer needed. An asset still referenced by a resource cannot be deleted.

## Minimal use

From a TypeScript consumer in the repository root:

```ts
import {
  createCatalog, createResource, addResource,
  createCollection, addCollection, searchCatalog,
  createSession, sealCatalog, unsealCatalog, MemoryCatalogStore
} from './packages/core/src/index.ts';

let catalog = createCatalog();
const resource = createResource({
  title: 'Notes on motion',
  kind: 'note',
  creators: ['A learner'],
  languages: ['en'],
  subjects: ['Physics'],
  rights: {statement: 'Original notes by the learner.'}
});
catalog = addResource(catalog, resource);
catalog = addCollection(catalog, createCollection({
  title: 'Physics',
  resourceIds: [resource.id]
}));
const matches = searchCatalog(catalog, {query: 'motion', language: 'en'});

const session = await createSession('a unique example passphrase');
const store = new MemoryCatalogStore();
await store.write(await sealCatalog({catalog, content: new Map()}, session), null);

const saved = await store.read();
if (saved) {
  const restored = await unsealCatalog(saved, 'a unique example passphrase');
  console.log(matches.length, restored.bundle.catalog.resources.length);
}
```

The passphrase above is an example only. Do not hard-code real passphrases.
A file-backed resource additionally requires a descriptor from `createAsset`,
an `addAsset` mutation and matching bytes in the bundle content map.

## Search

Search validates the catalog, normalizes text with Unicode NFKC and lowercases
it. Every whitespace-separated query token must occur in the combined title,
description, creators, languages and subjects. Optional kind, collection,
subject and language filters restrict results. Subject and language filters
compare normalized whole values. Results sort deterministically by normalized
title and then identifier.

This is local metadata search. It does not fetch websites, inspect media,
extract PDF text, stem words, rank relevance or send interests to a remote model.

## Storage and concurrency

`CatalogStore` persists one encrypted envelope.
`read()` returns a detached snapshot or null.
`write(envelope, expectedRevision)` must compare and commit atomically;
null means create only. `remove(expectedRevision)` follows the same rule.
A successful update requires a fresh revision. Storage failure and conflicts
reject; callers retain unsaved data and choose how to resolve them.

A browser adapter uses a single IndexedDB read/write transaction for revision
comparison and mutation. The memory adapter demonstrates the same contract.
A remote adapter must enforce this operation on the server as well as tenant
authorization. Reading a record and later sending an unconditional update
cannot satisfy the contract.

Locking and asynchronous UI work are application responsibilities. The example
uses session-generation checks so that work started before lock cannot restore
a visible private session afterwards. Storing ciphertext is not sufficient if
the interface exposes plaintext after a delayed completion.

## Learning compatibility

Learning-specific questions, answers, practice plans, preferences and attachment
mapping belong to the learning bridge and application, not general catalog fields.
Migration must preserve that data explicitly while resources and asset descriptors
become reusable engine records. Legacy encrypted backups remain a distinct
format. Validate and decrypt before migration, then save only after the complete
new bundle is valid.

## Extension rules

Use reverse-domain namespaces in the `extensions` objects for application data,
for example `org.example.learning`. Ordinary unknown fields are rejected.
Extensions are bounded JSON data and must never be executed or blindly merged
into trusted configuration. A consumer may preserve unfamiliar extensions
without understanding their meaning.

## Optional education boundary

`@open-learning-rooms/education` is a separate, dependency-free TypeScript
adapter. The web sample stores its validated state in
`catalog.extensions['org.openlearningrooms.education']`. It does not add
education fields to every generic resource or make the core depend on React,
accounts, a school or a hosting provider. Unsupported education state is reported
without replacing the saved catalog. The web bridge preserves other namespaces
and the asset content map when it saves an education change.

Briefs have explicit versions; attempts append revisions bound to an exact brief
version. A submission snapshots only the selected answer, learner question and
brief. Feedback must match that submission, attempt revision and brief version.
Private next actions and review dates are part of private attempts, not
submissions. Validation returns detached frozen records. Import replays are
identified and conflicting records are rejected rather than merged silently.

The adapter's `exportExchange` produces a canonical readable JSON string for one
allowlisted record. It supplies no cryptography, storage or transmission. The
web app shows that selected text, then offers an encrypted file by default or an
explicit readable JSON download. Its encryption wrapper reuses the core's
authenticated encryption with a new file passphrase, salt and session. It never
accepts the room session or key. The wrapper accepts only its fixed,
exchange-only envelope and rejects whole-library backups through this import
path. No source assets, unrelated namespaces or private attempt history enter
the selected-text format.

Import checking/decryption is separate from adding records to the encrypted
local library. Neither a successful decrypt nor a recipient label establishes
identity or permission. Imported feedback is marked `imported-unverified`.
See [the workflow guide](EDUCATION.md) for content and key-sharing limits.

The optional authorization function requires server-verified identities and
authoritative tenant/course/membership/assignment records. Its caller must
enforce decisions in the same trusted transaction as the protected operation.
The in-memory abuse guard demonstrates payload, request and concurrency budgets
with bounded key storage. It is single-process, resets on restart and has no
network effect in the local web sample. A real service needs gateway limits,
shared atomic budgets, deadlines, private storage and tested backend permissions.
See [the server reference contract](CLASSROOM-AUTHORIZATION.md).

## Scope

The core remains a bounded single-user snapshot engine. The optional portal
adds shared service permissions in its PostgreSQL reference implementation;
these do not alter the personal vault's encryption or storage model. Neither
package implements circulation, a public publishing platform, federated
identity or an institutional metadata exchange protocol. Selected DCMI JSON
metadata is a descriptive export, not an RDF or catalog federation service.

## Library service boundary

PostgreSQL 15+ is the primary service database. Install the portable core schema,
then the group schema, then the media schema if uploads are offered. The
Supabase schema is an optional identity bridge, not a replacement for the core.
The generic server adapter requires a pool connection port and a verified actor;
it starts a transaction, assumes the restricted `authenticated` role and sets
`library.actor_id` only for that transaction. The operator must authenticate the
request and synchronize authoritative account/verification state first. Raw SQL,
database credentials and the actor-context setter must never be exposed to a
browser client. With the Supabase bridge installed, identity comes from
`auth.uid()` and anonymous JWTs are rejected instead of trusting that context.

Accounts and content roles are separate. Signup cannot grant admin access.
Guests can see published course summaries. With the group schema installed,
learners require library membership to read published lesson content; admins can
curate drafts. Membership in any group grants access to the same shared
published catalog. Groups are not separate institutional tenants or per-course
entitlements.

Regular group discussions and sessions are visible to group members and library
admins. Learners can request a teacher, but only an admin can create the resulting
private room. The creating admin becomes its assigned teacher; other admins
cannot read that room through the provided permission functions. Shared rooms
and support messages are service data, not end-to-end encrypted personal vault
content. Removing membership blocks future authorized requests, not copies
already received. Referenced facilitator accounts require an operator-managed
transfer or closure process before deletion.

Invitations bind a hashed random token to an email address and group. Joining
requires a verified account with that email and explicit acceptance before the
token expires. Opening a link does not accept it. The invitation Fetch handler
injects an email service and verified staff authentication; it does not send mail
without those integrations. Scheduled sessions represent discussion times and
do not establish audio/video calls.

Links and uploaded files remain distinct. Admins can record credited HTTP(S)
sources or attach supported files. Hosted uploads require an injected malware
scanner that returns `clean` before storage; a missing or unavailable scanner
rejects the upload. Byte-signature and SHA-256 checks validate format/integrity,
not malware safety. The media database role has access only to its private store
functions. Learner downloads require membership and an exact attachment in a
published course; files are returned as downloads rather than embedded code.
The reference capacity is 10 MiB per file, 100 files and 100 MiB aggregate upload
storage. This is a bounded byte store, not a streaming or transcoding service.

The default web portal uses temporary in-memory implementations. Refresh clears
its accounts, edits, files, discussions and simulated invitations; it sends no
email and stores no account passwords. Role tutorials only explain the available
workflows and do not persist training results or mutate records. A connected
service requires real identity, email, scanner, database and hosting
configuration. Body/response deadlines do not replace operator limits for
authentication, pool/query work, mail delivery or the gateway.

## Adapter and delivery boundary

Applications can supply a `CatalogStore`, `CoursePortal`, `GroupWorkspace` or
`PortalMediaStore`, and servers can implement the narrow pool/query,
authentication, scanner and mailer ports. Catalog extensions are bounded data;
there is no arbitrary plugin code loader or sandbox. Keep provider code outside
the three dependency-free packages.

The CI workflow checks lint, types, SQL permission behavior, builds, bundle
budgets, dependency advisories, isolated package consumers and browser journeys.
Pinned action commits, read-only workflow permissions and a frozen install
reduce unnecessary supply-chain access. Browser checks run in three shards with
one worker each; unit/SQL test files use bounded concurrency. The workflow has no
deployment job. Passing these checks does not establish physical-device coverage,
live email/scanner operation or completion of an independent security review.
