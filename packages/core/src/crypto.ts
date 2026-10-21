import { MAX_LIBRARY_BYTES, fromBase64, toBase64, validateLibrary, type Library } from './model.ts';
export const ITERATIONS = 600000;
export type Envelope = {format: 'open-learning-rooms'; version: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; ciphertext: string};
export type VaultSession = {key: CryptoKey; salt: string};
const aad = new TextEncoder().encode('open-learning-rooms:v1');
export function validateEnvelope(value: unknown): Envelope {
  const e = value as Envelope;
  if (!e || e.format !== 'open-learning-rooms' || e.version !== 1 || e.kdf !== 'PBKDF2-SHA256' || e.iterations !== ITERATIONS || typeof e.salt !== 'string' || e.salt.length !== 24 || typeof e.iv !== 'string' || e.iv.length !== 16 || typeof e.ciphertext !== 'string' || e.ciphertext.length > (MAX_LIBRARY_BYTES + 16) * 4 / 3 + 4) throw new Error('Unsupported or oversized encrypted backup.');
  if (fromBase64(e.salt).length !== 16 || fromBase64(e.iv).length !== 12 || fromBase64(e.ciphertext).length < 16) throw new Error('Damaged encrypted backup.');
  return {format: e.format, version: 1, kdf: e.kdf, iterations: ITERATIONS, salt: e.salt, iv: e.iv, ciphertext: e.ciphertext};
}
async function derive(passphrase: string, salt: string): Promise<VaultSession> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: fromBase64(salt), iterations: ITERATIONS, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  return {key, salt};
}
export async function createSession(passphrase: string): Promise<VaultSession> {
  if (passphrase.length < 12 || passphrase.length > 512) throw new Error('Use a passphrase between 12 and 512 characters.');
  return derive(passphrase, toBase64(crypto.getRandomValues(new Uint8Array(16))));
}
export async function seal(library: Library, session: VaultSession): Promise<Envelope> {
  const plain = new TextEncoder().encode(JSON.stringify(validateLibrary(library)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, session.key, plain);
  return {format: 'open-learning-rooms', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: session.salt, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(cipher))};
}
export async function unseal(input: unknown, passphrase: string): Promise<{library: Library; session: VaultSession}> {
  if (passphrase.length > 512) throw new Error('Passphrase is too long.');
  const envelope = validateEnvelope(input);
  const session = await derive(passphrase, envelope.salt);
  let plain: ArrayBuffer;
  try { plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: aad}, session.key, fromBase64(envelope.ciphertext)); }
  catch { throw new Error('Could not unlock. Check your passphrase or use an undamaged backup.'); }
  return {library: validateLibrary(JSON.parse(new TextDecoder().decode(plain))), session};
}
/** Implementations must reject stale expectedIv values atomically. null means create only. */
export interface VaultStore {
  read(): Promise<Envelope | null>;
  write(value: Envelope, expectedIv: string | null): Promise<void>;
  remove(expectedIv: string): Promise<void>;
}
