# Optional IndexedDB adapter

Import browser persistence separately from the provider-independent engine:

```ts
import {createIndexedDBCatalogStore} from '@open-learning-rooms/core/indexeddb';
import {createCatalog, createSession, sealCatalog} from '@open-learning-rooms/core';

const store = createIndexedDBCatalogStore({databaseName: 'my-private-library'});
const session = await createSession('replace with a private user-supplied passphrase');
const envelope = await sealCatalog({catalog: createCatalog(), content: new Map()}, session);
await store.write(envelope, null); // create only
const saved = await store.read();
```

Options are `databaseName` (default `open-library-engine`), `storeName`
(default `vaults`), `key` (default `catalog`) and optional `indexedDB: IDBFactory`.
Use a dedicated database with schema version 1 and out-of-line keys. Different
keys may share the same object store. For independent store names, use independent
databases. The adapter does not manage arbitrary schema upgrades or change an
existing incompatible database. A missing store or newer schema rejects.
Do not reuse the sample application's reserved library or legacy-backup records.

Construction/import opens nothing and works without browser globals. Operations
resolve the browser API lazily; unavailable storage rejects explicitly. Tests or
compatible environments may inject their own factory. The sample's generic-store
wrapper delegates to this adapter; its legacy vault migration remains separate.

Read success waits for the transaction to complete, not just its value request.
Writes/deletes compare expected revision and mutate in one transaction. Reused
revisions and stale operations reject; no automatic retry or unconditional write
occurs. Connections close after operations or version-change notifications. If a
blocked open rejects but later succeeds, the abandoned connection is closed.
Invalid saved records reject without replacement. Clearing/eviction of browser
storage remains possible: keep separate encrypted backups.

## Research and decision — 16 October 2026

The [W3C IndexedDB 3.0 working draft](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
distinguishes request success from transaction completion and describes atomic
commit/abort. Its [connection guidance](https://www.w3.org/TR/IndexedDB/#database-connection)
also covers version changes and blocked connections. We use those lifecycle rules
for this bounded adapter; this is not a standards-conformance certification.

The change removes application coupling without adding a database library,
connection cache, cloud account or new storage format. Web application JS/CSS
emitted filenames and Vite content hashes remain unchanged because its learning storage path is unchanged.
No runtime-speed improvement is claimed from this extraction.

## Checks

Run `pnpm build`, `pnpm test` and
`pnpm exec playwright test indexeddb.spec.ts`. New checks cover isolated database
names/keys, corrupted persisted records, schema mismatch, unavailable APIs,
blocked/late connections, and a read transaction aborted after request success.
The browser test serves only the built engine modules from an isolated localhost
fixture and exercises real storage, encrypted reopening and simultaneous writers.
It does not relax the web application's content security policy.

Physical-device testing and full application flows from the previous milestone
remain separate evidence. New adapter checks do not establish universal device
support or legal approval.
