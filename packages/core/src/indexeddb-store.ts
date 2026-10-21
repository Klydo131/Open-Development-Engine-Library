import {validateCatalogIdentifier} from './catalog.ts';
import {validateCatalogEnvelope, type CatalogEnvelope} from './catalog-vault.ts';
import {CatalogConflictError, type CatalogStore} from './catalog-store.ts';

export type IndexedDBCatalogOptions = {
  databaseName?: string;
  storeName?: string;
  key?: string;
  /** Optional injection for workers, isolated tests, or another compatible environment. */
  indexedDB?: IDBFactory;
};

/** Optional browser adapter. Importing this module does not open a database. */
export function createIndexedDBCatalogStore(options: IndexedDBCatalogOptions = {}): CatalogStore {
  const databaseName = options.databaseName ?? 'open-library-engine';
  const storeName = options.storeName ?? 'vaults';
  const key = options.key ?? 'catalog';
  for (const name of [databaseName, storeName]) {
    // oxlint-disable-next-line no-control-regex -- Database names deliberately reject C0 controls and DEL.
    if (typeof name !== 'string' || !name.length || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Invalid catalog database name.');
  }
  validateCatalogIdentifier(key);
  // Capture configuration; resolve the browser API only when an operation starts.
  const suppliedFactory = options.indexedDB;
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const factory = suppliedFactory ?? globalThis.indexedDB;
      if (!factory) { reject(new Error('IndexedDB is unavailable in this environment.')); return; }
      let abandoned = false;
      const request = factory.open(databaseName, 1);
      request.onblocked = () => { abandoned = true; reject(new Error('Catalog storage is blocked. Close other connections and try again.')); };
      request.onerror = () => reject(new Error('Could not open catalog storage. Check browser permissions and database version.'));
      request.onupgradeneeded = () => {
        if (abandoned) { request.transaction?.abort(); return; }
        request.result.createObjectStore(storeName);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned) { db.close(); return; }
        db.onversionchange = () => db.close();
        if (!db.objectStoreNames.contains(storeName)) { db.close(); reject(new Error('Catalog object store is missing. Use a dedicated version-1 database.')); return; }
        resolve(db);
      };
    });
  }
  async function transaction(next: CatalogEnvelope | null | undefined, expected?: string | null): Promise<CatalogEnvelope | null> {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, next === undefined ? 'readonly' : 'readwrite');
        const store = tx.objectStore(storeName);
        let result: CatalogEnvelope | null = null;
        let failure: Error | undefined;
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            result = request.result === undefined ? null : validateCatalogEnvelope(request.result);
            if (next === undefined) return;
            if ((result?.revision ?? null) !== expected) { failure = new CatalogConflictError(); tx.abort(); return; }
            if (next === null) store.delete(key); else store.put(next, key);
          } catch {
            failure = new Error('Could not save or validate catalog. The previous saved catalog is intact.');
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure ?? new Error('Catalog transaction failed. The previous saved catalog is intact.'));
        tx.onerror = () => { /* The default request error aborts the transaction; settle on abort. */ };
      });
    } finally { db.close(); }
  }
  return {
    read: () => transaction(undefined),
    async write(value, expectedRevision) {
      if (expectedRevision !== null) validateCatalogIdentifier(expectedRevision);
      const next = validateCatalogEnvelope(value);
      if (next.revision === expectedRevision) throw new CatalogConflictError();
      await transaction(next, expectedRevision);
    },
    async remove(expectedRevision) {
      validateCatalogIdentifier(expectedRevision);
      await transaction(null, expectedRevision);
    }
  };
}
