# @open-learning-rooms/core

A small digital-library engine for JavaScript and TypeScript applications.
Catalog resources, flat collections, creators, languages, rights and provenance;
search local metadata; validate portable bundles; protect snapshots with
versioned authenticated encryption.

The engine has no React, provider, database-client or network dependency. It
requires Web Crypto, typed arrays, text encoding and structured cloning.
The web application is one consumer, with its own learning/practice extension.
Legacy learning exports remain for v1 compatibility.

## Example

```js
import {createCatalog, createResource, addResource, searchCatalog} from '@open-learning-rooms/core';
let catalog = createCatalog();
catalog = addResource(catalog, createResource({title: 'An idea', kind: 'note', subjects: ['Physics']}));
console.log(searchCatalog(catalog, {query: 'idea'}));
```

`CatalogBundle` separates descriptors from a `Map` of asset bytes. Portable
bundle export includes those bytes; this alpha does not stream large files.
`sealCatalog` / `unsealCatalog` use AES-GCM and passphrase-derived keys;
`MemoryCatalogStore` specifies atomic revision checks. Optional browser storage
is available from `@open-learning-rooms/core/indexeddb`; the main entry point
does not load or open IndexedDB.

```js
import {createIndexedDBCatalogStore} from '@open-learning-rooms/core/indexeddb';
const store = createIndexedDBCatalogStore({databaseName: 'my-private-library'});
// await store.write(encryptedEnvelope, null); // create only
```

Use a dedicated version-1 database. Optional storeName/key select the ciphertext
record; an injected indexedDB factory supports isolated environments. Existing
incompatible schemas reject. This adapter does not provide cloud sync or manage
schema upgrades. Keep encrypted backups outside browser storage.

Current bounds: 1,000 resources/assets, 200 collections, 10 MiB per asset,
20 MiB total content, 16 MiB metadata, 12 MiB per namespaced extension,
and 31 MiB serialized bundle. A smaller client may impose tighter limits.
SHA-256 detects byte changes; it does not classify files as safe.

Original code is MIT licensed. Imported media, names and dependencies keep
their own rights. This local alpha is not a legal, security, preservation or
device-support certification. See the repository's format and security docs.

`rekeyCatalog(envelope, currentPassphrase, newPassphrase)` prepares a replacement
encrypted catalog with a fresh key/salt/IV and revision. It does not write storage.
Commit against the previous revision and adopt its session only after success.
Previously exported copies retain their original passphrases.
