import {fromBase64} from './model.ts';

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type Extensions = Record<string, JsonValue>;
export type ResourceKind = 'link' | 'document' | 'audio' | 'video' | 'note' | 'other';
export type Resource = {
  id: string; title: string; kind: ResourceKind; description: string;
  creators: string[]; languages: string[]; subjects: string[];
  rights: {statement: string; licenseUrl?: string}; provenance: {sourceUrl?: string};
  assetIds: string[]; createdAt: string; modifiedAt: string; extensions: Extensions;
};
export type CatalogAsset = {id: string; name: string; mime: string; size: number; sha256: string};
export type Collection = {id: string; title: string; description: string; resourceIds: string[]; extensions: Extensions};
export type Catalog = {
  format: 'open-library-catalog'; version: 1; id: string; revision: string;
  createdAt: string; modifiedAt: string; resources: Resource[]; assets: CatalogAsset[];
  collections: Collection[]; extensions: Extensions;
};
export type ContentMap = Map<string, Uint8Array>;
export type CatalogBundle = {catalog: Catalog; content: ContentMap};
export type CatalogBundleSize = {
  metadataBytes: number; contentBytes: number; encodedContentBytes: number;
  framingBytes: number; bundleBytes: number; limitBytes: number; withinLimit: boolean;
};
export const CATALOG_LIMITS = Object.freeze({resources: 1000, assets: 1000, collections: 200, fileBytes: 10 * 1024 * 1024, contentBytes: 20 * 1024 * 1024, metadataBytes: 16 * 1024 * 1024, bundleBytes: 31 * 1024 * 1024, extensionBytes: 12 * 1024 * 1024, extensionDepth: 10});
const encoder = new TextEncoder();
const namespace = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
const kinds: ResourceKind[] = ['link', 'document', 'audio', 'video', 'note', 'other'];
function fail(message: string): never {throw new Error(message);}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Expected a plain catalog object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unknown catalog field. Store application data in a namespaced extension.');
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) fail('Invalid or oversized catalog text.');
  return value;
}
export function validateCatalogIdentifier(value:unknown):string {if(typeof value!=='string'||value.length<1||value.length>128||!/^[A-Za-z0-9]/.test(value)||/[^A-Za-z0-9._:-]/.test(value))fail('Invalid catalog identifier.');return value;}
function id(value:unknown):string{return validateCatalogIdentifier(value);}
function list(value: unknown, max: number): unknown[] {if (!Array.isArray(value) || value.length > max) fail('Catalog collection capacity exceeded.'); return value;}
function strings(value: unknown, count: number, length: number): string[] {return list(value, count).map(item => text(item, length, true));}
function unique(values: string[], label: string): string[] {if (new Set(values).size !== values.length) fail(`Duplicate ${label}.`); return values;}
function ids(value: unknown, max: number): string[] {return unique(list(value, max).map(id), 'catalog reference');}
function timestamp(value: unknown): string {
  const result = text(value, 40, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail('Invalid catalog timestamp.');
  return new Date(result).toISOString();
}
function link(value: unknown): string {
  const source = text(value, 2048, true); let result: URL;
  try {result = new URL(source);} catch {return fail('Invalid catalog URL.');}
  if (!['https:', 'http:'].includes(result.protocol) || result.username || result.password) fail('Use an HTTP or HTTPS URL without credentials.');
  return result.href;
}
function json(value: unknown, depth: number, budget: {nodes: number}): JsonValue {
  if (depth > CATALOG_LIMITS.extensionDepth || --budget.nodes < 0) fail('Catalog extension is too complex.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {if (!Number.isFinite(value)) fail('Invalid extension number.'); return value;}
  if (typeof value === 'string') return text(value, CATALOG_LIMITS.extensionBytes);
  if (Array.isArray(value)) return value.map(item => json(item, depth + 1, budget));
  const source = record(value); const result: {[key: string]: JsonValue} = {};
  for (const [key, item] of Object.entries(source)) {
    if (key.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsafe or oversized extension key.');
    result[key] = json(item, depth + 1, budget);
  }
  return result;
}
function extensions(value: unknown): Extensions {
  const source = record(value); if (Object.keys(source).length > 20) fail('Too many catalog extensions.');
  const result: Extensions = {};
  for (const [key, item] of Object.entries(source)) {
    if (key.length > 120 || (!namespace.test(key)||/[\r\n]/.test(key))) fail('Extensions require a reverse-domain namespace.');
    const parsed = json(item, 0, {nodes: 50000});
    if (encoder.encode(JSON.stringify(parsed)).length > CATALOG_LIMITS.extensionBytes) fail('Catalog extension capacity exceeded.');
    result[key] = parsed;
  }
  return result;
}
function resource(value: unknown): Resource {
  const source = record(value);
  keys(source, ['id','title','kind','description','creators','languages','subjects','rights','provenance','assetIds','createdAt','modifiedAt','extensions']);
  if (!kinds.includes(source.kind as ResourceKind)) fail('Unsupported resource kind.');
  const rights = record(source.rights); keys(rights, ['statement','licenseUrl']);
  const provenance = record(source.provenance); keys(provenance, ['sourceUrl']);
  return {
    id: id(source.id), title: text(source.title, 500, true), kind: source.kind as ResourceKind, description: text(source.description, 20000),
    creators: strings(source.creators, 50, 300), languages: strings(source.languages, 20, 80), subjects: strings(source.subjects, 100, 200),
    rights: {statement: text(rights.statement, 2000), ...(rights.licenseUrl === undefined ? {} : {licenseUrl: link(rights.licenseUrl)})},
    provenance: provenance.sourceUrl === undefined ? {} : {sourceUrl: link(provenance.sourceUrl)},
    assetIds: ids(source.assetIds, 50), createdAt: timestamp(source.createdAt), modifiedAt: timestamp(source.modifiedAt), extensions: extensions(source.extensions)
  };
}
/** Validate one resource without requiring its asset bytes or catalog context. */
export {resource as validateResource};
function asset(value: unknown): CatalogAsset {
  const source = record(value); keys(source, ['id','name','mime','size','sha256']);
  if (!Number.isSafeInteger(source.size) || (source.size as number) < 1 || (source.size as number) > CATALOG_LIMITS.fileBytes) fail('Invalid or oversized asset length.');
  if (typeof source.sha256 !== 'string' || source.sha256.length!==64 || !/^[a-f0-9]{64}$/.test(source.sha256)) fail('Invalid asset SHA-256.');
  const mime = text(source.mime, 100, true);
  if (/\s/.test(mime) || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime)) fail('Invalid asset media type.');
  return {id: id(source.id), name: text(source.name, 255, true), mime, size: source.size as number, sha256: source.sha256};
}
function collection(value: unknown): Collection {
  const source = record(value); keys(source, ['id','title','description','resourceIds','extensions']);
  return {id: id(source.id), title: text(source.title, 500, true), description: text(source.description, 20000), resourceIds: ids(source.resourceIds, CATALOG_LIMITS.resources), extensions: extensions(source.extensions)};
}
export function createRevision(): string {return crypto.randomUUID();}
export function createCatalog(): Catalog {
  const now = new Date().toISOString();
  return {format: 'open-library-catalog', version: 1, id: crypto.randomUUID(), revision: createRevision(), createdAt: now, modifiedAt: now, resources: [], assets: [], collections: [], extensions: {}};
}
export function createResource(input: Partial<Resource> & Pick<Resource, 'title'>): Resource {
  const now = new Date().toISOString();
  return resource({id: crypto.randomUUID(), kind: 'other', description: '', creators: [], languages: [], subjects: [], rights: {statement: ''}, provenance: {}, assetIds: [], createdAt: now, modifiedAt: now, extensions: {}, ...input});
}
export function createCollection(input: Partial<Collection> & Pick<Collection, 'title'>): Collection {
  return collection({id: crypto.randomUUID(), description: '', resourceIds: [], extensions: {}, ...input});
}
export function validateCatalog(value: unknown): Catalog {
  const source = record(value); keys(source, ['format','version','id','revision','createdAt','modifiedAt','resources','assets','collections','extensions']);
  if (source.format !== 'open-library-catalog' || source.version !== 1) fail('Unsupported catalog format or version.');
  const result: Catalog = {format: 'open-library-catalog', version: 1, id: id(source.id), revision: id(source.revision), createdAt: timestamp(source.createdAt), modifiedAt: timestamp(source.modifiedAt), resources: list(source.resources, CATALOG_LIMITS.resources).map(resource), assets: list(source.assets, CATALOG_LIMITS.assets).map(asset), collections: list(source.collections, CATALOG_LIMITS.collections).map(collection), extensions: extensions(source.extensions)};
  unique([...result.resources, ...result.assets, ...result.collections].map(item => item.id), 'catalog identifier');
  const assetIds = new Set(result.assets.map(item => item.id));
  const resourceIds = new Set(result.resources.map(item => item.id));
  if (result.resources.some(item => item.assetIds.some(ref => !assetIds.has(ref))) || result.collections.some(item => item.resourceIds.some(ref => !resourceIds.has(ref)))) fail('Catalog contains a dangling reference.');
  if (result.assets.reduce((sum, item) => sum + item.size, 0) > CATALOG_LIMITS.contentBytes) fail('Catalog content capacity exceeded.');
  if (encoder.encode(JSON.stringify(result)).length > CATALOG_LIMITS.metadataBytes) fail('Catalog metadata capacity exceeded.');
  return result;
}
function changed(catalog: Catalog): Catalog {return validateCatalog({...catalog, revision: createRevision(), modifiedAt: new Date().toISOString()});}
export function addResource(catalog: Catalog, value: Resource): Catalog {return changed({...validateCatalog(catalog), resources: [...catalog.resources, value]});}
export function updateResource(catalog: Catalog, resourceId: string, patch: Partial<Omit<Resource, 'id' | 'createdAt'>>): Catalog {
  const current = validateCatalog(catalog); const index = current.resources.findIndex(item => item.id === resourceId);
  if (index === -1) fail('Resource does not exist.');
  const original = current.resources[index];
  current.resources[index] = {...original, ...patch, id: original.id, createdAt: original.createdAt, modifiedAt: new Date().toISOString()};
  return changed(current);
}
export function deleteResource(catalog: Catalog, resourceId: string): Catalog {
  const current = validateCatalog(catalog);
  if (!current.resources.some(item => item.id === resourceId)) fail('Resource does not exist.');
  return changed({...current, resources: current.resources.filter(item => item.id !== resourceId), collections: current.collections.map(item => ({...item, resourceIds: item.resourceIds.filter(ref => ref !== resourceId)}))});
}
export function addCollection(catalog: Catalog, value: Collection): Catalog {return changed({...validateCatalog(catalog), collections: [...catalog.collections, value]});}
export function updateCollection(catalog: Catalog, collectionId: string, patch: Partial<Omit<Collection, 'id'>>): Catalog {
  const current = validateCatalog(catalog); const index = current.collections.findIndex(item => item.id === collectionId);
  if (index === -1) fail('Collection does not exist.');
  current.collections[index] = {...current.collections[index], ...patch, id: collectionId};
  return changed(current);
}
export function setCollectionMembers(catalog: Catalog, collectionId: string, resourceIds: string[]): Catalog {return updateCollection(catalog, collectionId, {resourceIds});}
export function deleteCollection(catalog: Catalog, collectionId: string): Catalog {
  const current = validateCatalog(catalog);
  if (!current.collections.some(item => item.id === collectionId)) fail('Collection does not exist.');
  return changed({...current, collections: current.collections.filter(item => item.id !== collectionId)});
}
export async function hashContent(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function createAsset(bytes: Uint8Array, input: {id?: string; name: string; mime: string}): Promise<CatalogAsset> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > CATALOG_LIMITS.fileBytes) fail('Invalid or oversized asset length.');
  return asset({...input, id: input.id ?? crypto.randomUUID(), size: bytes.length, sha256: await hashContent(bytes)});
}
export function addAsset(catalog: Catalog, value: CatalogAsset): Catalog {return changed({...validateCatalog(catalog), assets: [...catalog.assets, value]});}
export function deleteAsset(catalog: Catalog, assetId: string): Catalog {
  const current = validateCatalog(catalog);
  if (!current.assets.some(item => item.id === assetId)) fail('Asset does not exist.');
  if (current.resources.some(item => item.assetIds.includes(assetId))) fail('Remove resource references before deleting this asset.');
  return changed({...current, assets: current.assets.filter(item => item.id !== assetId)});
}
export type CatalogSearch = {query?: string; kind?: ResourceKind; collectionId?: string; subject?: string; language?: string};
function normalized(value: string): string {return value.normalize('NFKC').toLowerCase();}
export function searchCatalog(catalog: Catalog, filter: CatalogSearch = {}): Resource[] {
  const options = record(filter); keys(options, ['query', 'kind', 'collectionId', 'subject', 'language']);
  const kind = options.kind;
  if (kind !== undefined && !kinds.includes(kind as ResourceKind)) fail('Unsupported resource kind.');
  const tokens = normalized(text(options.query === undefined ? '' : options.query, 2000)).split(/\s+/u).filter(Boolean);
  const collectionId = options.collectionId === undefined ? undefined : id(options.collectionId);
  const subject = options.subject === undefined ? undefined : normalized(text(options.subject, 200));
  const language = options.language === undefined ? undefined : normalized(text(options.language, 80));
  const current = validateCatalog(catalog);
  const selected = collectionId === undefined ? undefined : current.collections.find(item => item.id === collectionId);
  if (collectionId !== undefined && !selected) return [];
  const matches = current.resources.filter(item => {
    if (kind !== undefined && item.kind !== kind) return false;
    if (selected && !selected.resourceIds.includes(item.id)) return false;
    if (subject !== undefined && !item.subjects.some(value => normalized(value) === subject)) return false;
    if (language !== undefined && !item.languages.some(value => normalized(value) === language)) return false;
    const searchable = normalized([item.title, item.description, ...item.creators, ...item.languages, ...item.subjects].join('\n'));
    return tokens.every(token => searchable.includes(token));
  });
  return matches.sort((a, b) => {const left = normalized(a.title); const right = normalized(b.title); return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;});
}
export async function validateBundle(value: CatalogBundle): Promise<CatalogBundle> {
  const catalog = validateCatalog(value.catalog);
  if (!(value.content instanceof Map) || value.content.size !== catalog.assets.length) fail('Catalog content must contain exactly the declared assets.');
  const content: ContentMap = new Map();
  for (const descriptor of catalog.assets) {
    const original = value.content.get(descriptor.id);
    if (!(original instanceof Uint8Array) || original.length !== descriptor.size) fail('Missing asset content or length mismatch.');
    const bytes = Uint8Array.from(original);
    if (await hashContent(bytes) !== descriptor.sha256) fail('Asset SHA-256 integrity mismatch.');
    content.set(descriptor.id, bytes);
  }
  return {catalog, content};
}
function encodeBytes(bytes: Uint8Array): string {
  let result = ''; for (let offset = 0; offset < bytes.length; offset += 8192) result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(result);
}
function decodeBytes(value: unknown, expectedSize: number): Uint8Array {
  if (typeof value !== 'string' || value.length !== Math.ceil(expectedSize / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Invalid asset base64 content.');
  const bytes = fromBase64(value);
  if (bytes.length !== expectedSize || encodeBytes(bytes) !== value) fail('Non-canonical asset base64 content.');
  return bytes;
}
/** Exact size of a canonical portable bundle, without encoding, copying or hashing asset bytes.
 * Validates metadata and content lengths only; export still verifies every asset hash.
 */
export function estimateCatalogBundleSize(value: CatalogBundle): CatalogBundleSize {
  const catalog = validateCatalog(value.catalog);
  if (!(value.content instanceof Map) || value.content.size !== catalog.assets.length) fail('Catalog content must contain exactly the declared assets.');
  const metadataBytes = encoder.encode(JSON.stringify(catalog)).length;
  // Replace the four ASCII bytes of null with the serialized catalog. Content entries
  // contain validated ASCII IDs and base64, so their character counts equal UTF-8 bytes.
  let framingBytes = JSON.stringify({format: 'open-library-bundle', version: 1, catalog: null, content: []}).length - 4;
  let contentBytes = 0; let encodedContentBytes = 0;
  for (const descriptor of catalog.assets) {
    const bytes = value.content.get(descriptor.id);
    if (!(bytes instanceof Uint8Array) || bytes.length !== descriptor.size) fail('Missing asset content or length mismatch.');
    contentBytes += bytes.length;
    encodedContentBytes += 4 * Math.ceil(bytes.length / 3);
    framingBytes += JSON.stringify({id: descriptor.id, base64: ''}).length;
  }
  framingBytes += Math.max(0, catalog.assets.length - 1);
  const bundleBytes = metadataBytes + framingBytes + encodedContentBytes;
  return {metadataBytes, contentBytes, encodedContentBytes, framingBytes, bundleBytes, limitBytes: CATALOG_LIMITS.bundleBytes, withinLimit: bundleBytes <= CATALOG_LIMITS.bundleBytes};
}
export async function exportCatalogBundle(value: CatalogBundle): Promise<string> {
  if (!estimateCatalogBundleSize(value).withinLimit) fail('Portable catalog bundle capacity exceeded.');
  const bundle = await validateBundle(value);
  const result = JSON.stringify({format: 'open-library-bundle', version: 1, catalog: bundle.catalog, content: bundle.catalog.assets.map(item => ({id: item.id, base64: encodeBytes(bundle.content.get(item.id)!)}))});
  if (encoder.encode(result).length > CATALOG_LIMITS.bundleBytes) fail('Portable catalog bundle capacity exceeded.');
  return result;
}
export async function importCatalogBundle(input: string): Promise<CatalogBundle> {
  if (typeof input !== 'string' || input.length > CATALOG_LIMITS.bundleBytes || encoder.encode(input).length > CATALOG_LIMITS.bundleBytes) fail('Portable catalog bundle capacity exceeded.');
  let parsed: unknown; try {parsed = JSON.parse(input);} catch {return fail('Invalid portable catalog JSON.');}
  const source = record(parsed); keys(source, ['format','version','catalog','content']);
  if (source.format !== 'open-library-bundle' || source.version !== 1) fail('Unsupported portable catalog bundle.');
  const catalog = validateCatalog(source.catalog); const items = list(source.content, CATALOG_LIMITS.assets);
  if (items.length !== catalog.assets.length) fail('Catalog bundle content count mismatch.');
  const descriptors = new Map(catalog.assets.map(item => [item.id, item])); const content: ContentMap = new Map();
  for (const item of items) {
    const entry = record(item); keys(entry, ['id','base64']); const assetId = id(entry.id); const descriptor = descriptors.get(assetId);
    if (!descriptor || content.has(assetId)) fail('Unknown or duplicate catalog bundle asset.');
    content.set(assetId, decodeBytes(entry.base64, descriptor.size));
  }
  return validateBundle({catalog, content});
}
