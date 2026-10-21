# Data formats and compatibility

These are project-specific alpha formats, version 1. They are not claims of
MARC, Dublin Core, OPDS or Readium conformance.
Use exported validators and serializers rather than inventing a parallel parser.

## Catalog: `open-library-catalog`

`Catalog` has the following top-level keys:

```ts
{
  format: 'open-library-catalog',
  version: 1,
  id: string,
  revision: string,
  createdAt: string,
  modifiedAt: string,
  resources: Resource[],
  assets: CatalogAsset[],
  collections: Collection[],
  extensions: Record<string, JsonValue>
}
```

Identifiers are 1–128 ASCII characters: an initial letter or digit followed
by letters, digits, period, underscore, colon or hyphen. Identifiers are unique
across resources, assets and collections. Catalog and resource timestamps use
UTC ISO strings; validators normalize accepted timestamps.

| Record | Fields |
| --- | --- |
| Resource | `id`, `title`, `kind`, `description`, `creators`, `languages`, `subjects`, `rights`, `provenance`, `assetIds`, `createdAt`, `modifiedAt`, `extensions` |
| Asset | `id`, `name`, `mime`, `size`, `sha256` |
| Collection | `id`, `title`, `description`, `resourceIds`, `extensions` |

Resource kinds are `link`, `document`, `audio`, `video`, `note` and `other`.
Creators, languages and subjects are text arrays. Languages are not currently
validated against a language-tag registry. Rights contain a text `statement`
and optional `licenseUrl`; provenance contains an optional `sourceUrl`.
An empty rights statement means unspecified rights, not public-domain status
or redistribution permission.

URLs must be HTTP or HTTPS and must not contain embedded username/password
credentials. Validation does not fetch a URL or establish that it is trustworthy.
Core assets allow syntactically valid MIME types and bounded arbitrary bytes.
Application consumers decide which formats they support and how to handle them.

A SHA-256 checksum verifies that bytes match the descriptor. It does not identify
an author, establish lawful possession, or prove that a file is free of malware.

Unknown ordinary fields are rejected. Application data belongs in bounded
reverse-domain-namespaced `extensions`, such as `org.example.learning`.
Extension values must be finite JSON data; unsafe keys, excessive nesting,
oversized values and non-JSON objects are rejected. Unfamiliar valid extensions
are preserved by validation.

## In-memory bundle

`CatalogBundle` is `{catalog: Catalog, content: Map<string, Uint8Array>}`.
Every declared asset must have exactly one matching content entry, with matching
length and SHA-256. Unlisted, duplicate, missing or damaged content is rejected.
`validateBundle` returns a validated snapshot with copied content bytes.

## Plain portable bundle: `open-library-bundle`

`exportCatalogBundle(bundle)` returns JSON text:

```ts
{
  format: 'open-library-bundle',
  version: 1,
  catalog: Catalog,
  content: Array<{id: string, base64: string}>
}
```

Asset base64 must be canonical with padding. `importCatalogBundle(text)`
validates size, structure, references and content hashes before returning a bundle.

**This portable bundle is plaintext.** Treat metadata and asset bytes as private
when handling or sharing it. The sample's encrypted backup flow is distinct from
this lower-level interoperability API.

## Encrypted catalog envelope: `open-library-catalog-vault`

`sealCatalog(bundle, session)` produces:

```ts
{
  format: 'open-library-catalog-vault',
  version: 1,
  revision: string,
  kdf: 'PBKDF2-SHA256',
  iterations: 600000,
  salt: string,
  iv: string,
  ciphertext: string
}
```

The payload is UTF-8 portable-bundle JSON, encrypted with AES-256-GCM.
A session comes from `createSession(passphrase)`, using PBKDF2-HMAC-SHA-256,
600,000 iterations, and a randomly generated 16-byte salt.
Each seal uses a fresh random 12-byte IV. Salt, IV and ciphertext use canonical
base64; ciphertext includes the authentication tag.

Authenticated additional data is the UTF-8 JSON representation of this array,
in exactly this order:

```ts
['open-library-catalog-vault', 1, revision, 'PBKDF2-SHA256', 600000, salt]
```

The outer revision must match the decrypted catalog revision.
Strict header and size validation occurs before passphrase derivation.
`unsealCatalog(envelope, passphrase)` verifies authentication, decodes and
validates the complete bundle, and returns `{bundle, session}`.

The revision, format, version, cryptographic parameters, salt, IV and approximate
ciphertext size are visible to the storage provider. The catalog revision is
a concurrency token, not a trusted historical sequence.
Authenticated encryption detects modification of a saved envelope; it does not
prevent a malicious store from returning an older valid envelope.

## Current capacity

Limits are exported as `CATALOG_LIMITS`. Sizes use binary units.

| Limit | Value |
| --- | --- |
| Resources | 1,000 |
| Asset descriptors | 1,000 |
| Flat collections | 200 |
| One asset | 10 MiB |
| Combined declared asset bytes | 20 MiB |
| Catalog metadata JSON | 16 MiB |
| Portable bundle JSON | 31 MiB |
| One extension value JSON | 12 MiB |
| Extension nesting depth | 10 |

Field-specific string and reference limits also apply; consult the validator
for the complete bounds. This snapshot format base64-encodes assets and keeps
complete data in memory. It is intended for small private libraries at this
milestone. Browser quota may be lower than format limits.

## Original learning format

The first application used `Library {version: 1, lessons, practices,
recommendations}` and encrypted envelopes named `open-learning-rooms`,
version 1. Those envelopes use a separate encryption domain,
`open-learning-rooms:v1`, and remain distinct from catalog envelopes.

The learning bridge maps lessons into catalog resources, separates attachment
bytes into assets, and preserves learning fields in a namespaced extension.
It must preserve practice references, completion state, reflections and
recommendation preferences, not just resource titles.

Migration is an explicit validation/decryption/conversion step. Never label
a legacy envelope as a catalog envelope or reuse ciphertext under a different
format name. Export a valid backup before replacing legacy storage.

## Evolution

Reject unsupported format versions rather than guessing at their meaning.
A format change needs a documented migration, fixtures with synthetic data,
round-trip tests, size-bound tests and corrupted-data rejection tests.
Encryption parameter changes require a new documented compatibility decision.
Unknown versions must not silently replace a saved library.

## Learning consumer bridge

The example stores private notes, recall answers, progress and practice plans in
`org.openlearningrooms.learning` extensions. The core does not require them.
`apps/web/src/learning-vault.ts` maps legacy lessons to catalog resources and
separate asset bytes, preserving original learning IDs and other applications'
metadata/extensions. Existing v1 backups open without being overwritten. The
next successful save uses the catalog envelope; its encrypted original v1 copy
is retained locally and can be exported. Migrating another v1 library replaces
that recovery copy, so export it first if it is still needed. Removing the local library clears
both the active copy and that v1 recovery copy.

The learning example supports at most 200 sources and its original field bounds.
A generic engine catalog can hold up to 1,000 resources. Unsupported learning
fields or capacity are rejected before replacing saved data; use the engine API
for larger catalogs. A rejected save can export its own encrypted recovery copy,
which does not contain newer changes from a different tab and is not an automatic
merge.

## Passphrase changes and backup checks

`rekeyCatalog` authenticates the old catalog envelope and prepares a fresh key,
salt, IV and catalog revision without writing storage. Commit against the original
revision before adopting its session. The app performs this as one conditional
transaction and removes any retained old-key v1 recovery copy atomically.
Downloaded backups are unchanged and require their original passphrases.

The app can check v1 or catalog backups without restoring them. A check validates
decryption, structure, references and asset integrity using the existing bounded
import path. Only counts are displayed. It never merges, saves or opens the backup
as the current room. Checking cannot detect malware or guarantee external media
playback. See [recovery and passphrase guidance](RECOVERY.md).
