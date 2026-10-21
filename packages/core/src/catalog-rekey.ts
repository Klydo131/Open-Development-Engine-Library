import {createRevision, type CatalogBundle} from './catalog.ts';
import {sealCatalog, unsealCatalog, type CatalogEnvelope} from './catalog-vault.ts';
import {createSession, type VaultSession} from './crypto.ts';

/**
 * Prepare a passphrase change without writing to storage. Commit the returned envelope
 * against the original revision, then adopt its bundle/session only after that succeeds.
 */
export async function rekeyCatalog(value: unknown, currentPassphrase: string, newPassphrase: string): Promise<{bundle: CatalogBundle; session: VaultSession; envelope: CatalogEnvelope}> {
  if (typeof newPassphrase !== 'string' || newPassphrase.length < 12 || newPassphrase.length > 512) throw new Error('Use a passphrase between 12 and 512 characters.');
  if (newPassphrase === currentPassphrase) throw new Error('Choose a different passphrase.');
  const opened = await unsealCatalog(value, currentPassphrase);
  const bundle: CatalogBundle = {catalog: {...opened.bundle.catalog, revision: createRevision(), modifiedAt: new Date().toISOString()}, content: opened.bundle.content};
  const session = await createSession(newPassphrase);
  const envelope = await sealCatalog(bundle, session);
  return {bundle, session, envelope};
}
