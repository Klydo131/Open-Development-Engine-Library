import {
  createCatalog, createResource, createSession, sealCatalog, unsealCatalog,
  validateCatalogEnvelope, type CatalogBundle, type CatalogEnvelope
} from '../../../packages/core/src/index.ts';
import {parseExchange, type Exchange} from '../../../packages/education/src/index.ts';

/** Encoded file bound, checked before JSON parsing or key derivation. */
export const EDUCATION_FILE_LIMIT = 1024 * 1024;
const format = 'open-learning-exchange-encrypted';
const payloadNamespace = 'org.openlearningrooms.exchange';
const catalogId = 'education-exchange';
const resourceId = 'selected-exchange';
const title = 'Selected learning exchange';
const encoder = new TextEncoder();
type EncryptedExchange = {format: typeof format; version: 1; vault: CatalogEnvelope};

function readFile(text: string): unknown {
  if (typeof text !== 'string' || text.length > EDUCATION_FILE_LIMIT || encoder.encode(text).length > EDUCATION_FILE_LIMIT) throw new Error('This learning exchange file is too large.');
  try {return JSON.parse(text);} catch {throw new Error('This is not valid learning exchange JSON.');}
}
function encryptedEnvelope(value: unknown): EncryptedExchange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported encrypted learning exchange.');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || Object.keys(item).some(key => !['format', 'version', 'vault'].includes(key)) || item.format !== format || item.version !== 1) throw new Error('Unsupported encrypted learning exchange.');
  return {format, version: 1, vault: validateCatalogEnvelope(item.vault)};
}
function canonicalExchange(text: string): string {
  const canonical = JSON.stringify(parseExchange(text), null, 2);
  // Pretty canonical framing can be larger than a compact accepted input.
  parseExchange(canonical);
  return canonical;
}
function payload(bundle: CatalogBundle): Exchange {
  const catalog = bundle.catalog, item = catalog.resources[0];
  if (catalog.id !== catalogId || catalog.resources.length !== 1 || catalog.assets.length || catalog.collections.length || Object.keys(catalog.extensions).length || bundle.content.size || catalog.createdAt !== catalog.modifiedAt || !item || item.id !== resourceId || item.kind !== 'note' || item.title !== title || item.description !== '' || item.creators.length || item.languages.length || item.subjects.length || item.assetIds.length || Object.keys(item.provenance).length || Object.keys(item.rights).length !== 1 || item.rights.statement !== '' || item.createdAt !== catalog.createdAt || item.modifiedAt !== catalog.modifiedAt || Object.keys(item.extensions).length !== 1 || typeof item.extensions[payloadNamespace] !== 'string') throw new Error('This file is not a selected learning exchange. Whole library backups cannot be imported here.');
  const text = item.extensions[payloadNamespace];
  const parsed = parseExchange(text);
  if (JSON.stringify(parsed, null, 2) !== text) throw new Error('Unsupported learning exchange payload encoding.');
  return parsed;
}

/** Uses a separate transfer passphrase; never accepts a room vault session or key. */
export async function encryptEducationExchange(plainCanonicalJson: string, passphrase: string): Promise<string> {
  const canonical = canonicalExchange(plainCanonicalJson);
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 512) throw new Error('Use a transfer passphrase between 12 and 512 characters.');
  const catalog = {...createCatalog(), id: catalogId};
  catalog.resources = [createResource({id: resourceId, title, kind: 'note', createdAt: catalog.createdAt, modifiedAt: catalog.modifiedAt, extensions: {[payloadNamespace]: canonical}})];
  const vault = await sealCatalog({catalog, content: new Map()}, await createSession(passphrase));
  const result = JSON.stringify({format, version: 1, vault});
  if (encoder.encode(result).length > EDUCATION_FILE_LIMIT) throw new Error('This learning exchange file is too large.');
  return result;
}

/** Pure validation only; malformed, plain and unrelated files return false. */
export function isEncryptedEducationExchange(text: string): boolean {
  try {encryptedEnvelope(readFile(text)); return true;} catch {return false;}
}

/** Check/decrypt only. Nothing is persisted, accepted, uploaded or identity-verified. */
export async function openEducationExchange(text: string, passphrase?: string): Promise<Exchange> {
  const value = readFile(text);
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).format !== format) return parseExchange(text);
  const encrypted = encryptedEnvelope(value);
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 512) throw new Error('Enter the transfer passphrase, between 12 and 512 characters.');
  const {bundle} = await unsealCatalog(encrypted.vault, passphrase);
  return payload(bundle);
}
