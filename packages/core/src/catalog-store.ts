import {validateCatalogIdentifier} from './catalog.ts';
import {validateCatalogEnvelope, type CatalogEnvelope} from './catalog-vault.ts';
/**
 * An adapter stores exactly one encrypted vault. Implementations MUST compare the expected
 * revision and commit the write/remove in the same transaction. null means create only.
 * Successful writes require a fresh revision. Reads return detached snapshots. Storage
 * failures and conflicts reject; callers retain their unsaved state and must not auto-retry.
 */
export interface CatalogStore {
  read(): Promise<CatalogEnvelope | null>;
  write(value: CatalogEnvelope, expectedRevision: string | null): Promise<void>;
  remove(expectedRevision: string): Promise<void>;
}
export class CatalogConflictError extends Error {
  constructor() {super('Catalog changed in another tab or session. Unlock the latest copy before saving.'); this.name = 'CatalogConflictError';}
}
/** Reference adapter for tests and ephemeral sessions. No persistence or global state. */
export class MemoryCatalogStore implements CatalogStore {
  #value: CatalogEnvelope | null = null;
  async read(): Promise<CatalogEnvelope | null> {return this.#value === null ? null : {...this.#value};}
  async write(value: CatalogEnvelope, expectedRevision: string | null): Promise<void> {
    if(expectedRevision!==null)validateCatalogIdentifier(expectedRevision);
    const next = validateCatalogEnvelope(value);
    if ((this.#value?.revision ?? null) !== expectedRevision || next.revision === this.#value?.revision) throw new CatalogConflictError();
    this.#value = next;
  }
  async remove(expectedRevision: string): Promise<void> {
    validateCatalogIdentifier(expectedRevision);
    if (!this.#value || this.#value.revision !== expectedRevision) throw new CatalogConflictError();
    this.#value = null;
  }
}
