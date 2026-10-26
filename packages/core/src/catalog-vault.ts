import {CATALOG_LIMITS, validateCatalogIdentifier, exportCatalogBundle, importCatalogBundle, type CatalogBundle} from './catalog.ts';
import {ITERATIONS, type VaultSession} from './crypto.ts';
import {fromBase64, toBase64} from './model.ts';
export type CatalogEnvelope = {
  format: 'open-library-catalog-vault'; version: 1; revision: string;
  kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; ciphertext: string;
};
const encoder = new TextEncoder();
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const maximumCiphertext = Math.ceil((CATALOG_LIMITS.bundleBytes + 16) / 3) * 4;
function canonicalBase64Length(value: unknown, expectedBytes?: number, maxLength = maximumCiphertext): number {
  if (typeof value !== 'string' || value.length > maxLength || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new Error('Invalid catalog vault encoding.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const end = value.length - padding;
  const length = value.length / 4 * 3 - padding;
  // Canonical padding has zero unused bits; validation needs no decoded buffer.
  if (value.indexOf('=') !== (padding ? end : -1) || (padding && (alphabet.indexOf(value[end - 1]) & (padding === 2 ? 15 : 3)) !== 0) || (expectedBytes !== undefined && length !== expectedBytes)) throw new Error('Invalid catalog vault encoding.');
  return length;
}
/** Strict bounded header validation happens before password derivation. */
export function validateCatalogEnvelope(value: unknown): CatalogEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported catalog vault.');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => !['format','version','revision','kdf','iterations','salt','iv','ciphertext'].includes(key)) || source.format !== 'open-library-catalog-vault' || source.version !== 1 || source.kdf !== 'PBKDF2-SHA256' || source.iterations !== ITERATIONS || typeof source.revision !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(source.revision)) throw new Error('Unsupported catalog vault.');
  validateCatalogIdentifier(source.revision);
  canonicalBase64Length(source.salt, 16, 24); canonicalBase64Length(source.iv, 12, 16);
  if (canonicalBase64Length(source.ciphertext) < 16) throw new Error('Damaged catalog vault.');
  return {format: 'open-library-catalog-vault', version: 1, revision: source.revision, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: source.salt as string, iv: source.iv as string, ciphertext: source.ciphertext as string};
}
function aad(envelope: Pick<CatalogEnvelope, 'revision' | 'salt'>): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(['open-library-catalog-vault', 1, envelope.revision, 'PBKDF2-SHA256', ITERATIONS, envelope.salt]));
}
/** Sessions come from createSession(); AES-GCM and PBKDF2 use the existing frozen parameters. */
export async function sealCatalog(bundle: CatalogBundle, session: VaultSession): Promise<CatalogEnvelope> {
  canonicalBase64Length(session.salt, 16, 24);
  const header = {revision: bundle.catalog.revision, salt: session.salt};
  const plain = encoder.encode(await exportCatalogBundle(bundle));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(header)}, session.key, plain);
  return {format: 'open-library-catalog-vault', version: 1, revision: header.revision, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: header.salt, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext))};
}
export async function unsealCatalog(value: unknown, passphrase: string): Promise<{bundle: CatalogBundle; session: VaultSession}> {
  const envelope = validateCatalogEnvelope(value);
  if (typeof passphrase !== 'string' || passphrase.length > 512) throw new Error('Passphrase is too long or invalid.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: fromBase64(envelope.salt), iterations: ITERATIONS, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  let plain: ArrayBuffer;
  try {plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: aad(envelope)}, key, fromBase64(envelope.ciphertext));}
  catch {throw new Error('Could not unlock catalog. Check your passphrase or use an undamaged backup.');}
  if (plain.byteLength > CATALOG_LIMITS.bundleBytes) throw new Error('Catalog vault capacity exceeded.');
  const bundle = await importCatalogBundle(new TextDecoder('utf-8', {fatal: true}).decode(plain));
  if (bundle.catalog.revision !== envelope.revision) throw new Error('Catalog vault revision mismatch.');
  return {bundle, session: {key, salt: envelope.salt}};
}
