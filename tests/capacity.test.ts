import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_LIMITS, createAsset, createCatalog, createResource, estimateCatalogBundleSize,
  exportCatalogBundle, hashContent, validateCatalog, type CatalogBundle
} from '../packages/core/src/index.ts';

const encoder = new TextEncoder();
async function assertExact(bundle: CatalogBundle): Promise<void> {
  const measured = estimateCatalogBundleSize(bundle);
  const exported = await exportCatalogBundle(bundle);
  const parsed = JSON.parse(exported);
  assert.equal(measured.bundleBytes, encoder.encode(exported).length);
  assert.equal(measured.metadataBytes, encoder.encode(JSON.stringify(parsed.catalog)).length);
  assert.equal(measured.encodedContentBytes, parsed.content.reduce((total: number, entry: {base64: string}) => total + entry.base64.length, 0));
  assert.equal(measured.bundleBytes, measured.metadataBytes + measured.framingBytes + measured.encodedContentBytes);
  assert.equal(measured.limitBytes, CATALOG_LIMITS.bundleBytes);
  assert.equal(measured.withinLimit, true);
}

test('empty and Unicode catalogs match actual UTF-8 export including JSON escapes', async () => {
  await assertExact({catalog: createCatalog(), content: new Map()});
  const catalog = createCatalog();
  catalog.resources.push(createResource({
    title: '物理 علم café 👩🏽‍🏫', description: 'Quotes " and backslash \\ and lines\n\t\b\f\r\u0001 plus lone surrogate \ud800',
    creators: ['先生', 'معلمة'], languages: ['zh', 'ar'],
    extensions: {'org.example.lesson': {'a"b': ['☃', 'e\u0301', 1e-7, false, null]}}
  }));
  await assertExact({catalog, content: new Map()});
});

test('each asset padding boundary is counted separately and map order cannot change the size', async () => {
  const catalog = createCatalog(); const content = new Map<string, Uint8Array>();
  for (const length of [1, 2, 3, 4, 5, 6, 8191, 8192, 8193]) {
    const bytes = new Uint8Array(length).fill(length & 255);
    const asset = await createAsset(bytes, {id: `asset-${length}`, name: `先生-${length}.txt`, mime: 'text/plain'});
    catalog.assets.push(asset); content.set(asset.id, bytes);
  }
  const bundle = {catalog, content: new Map([...content].reverse())};
  const measured = estimateCatalogBundleSize(bundle);
  assert.equal(measured.contentBytes, [...content.values()].reduce((sum, bytes) => sum + bytes.length, 0));
  assert.equal(measured.encodedContentBytes, [...content.values()].reduce((sum, bytes) => sum + Math.ceil(bytes.length / 3) * 4, 0));
  await assertExact(bundle);
});

test('maximum many-small-asset count includes every entry and comma', async () => {
  const bytes = new Uint8Array([102]); const sha256 = await hashContent(bytes);
  const catalog = createCatalog(); const content = new Map<string, Uint8Array>();
  for (let index = 0; index < CATALOG_LIMITS.assets; index++) {
    const id = `asset-${index}`;
    catalog.assets.push({id, name: 'a.txt', mime: 'text/plain', size: 1, sha256}); content.set(id, bytes);
  }
  assert.equal(estimateCatalogBundleSize({catalog, content}).encodedContentBytes, CATALOG_LIMITS.assets * 4);
  await assertExact({catalog, content});
});

test('preflight measures canonical metadata rather than caller property order and URL spelling', async () => {
  const catalog = createCatalog();
  catalog.resources.push(createResource({title: 'Canonical resource'}));
  catalog.createdAt = '2026-01-02T03:04:05Z';
  catalog.resources[0].provenance = {sourceUrl: 'https://EXAMPLE.org:443/a b'};
  catalog.resources[0].rights = {licenseUrl: 'https://EXAMPLE.org:443/', statement: 'Unknown permission'};
  await assertExact({catalog, content: new Map()});
});

test('preflight rejects invalid catalogs, missing/extra content and byte-length mismatches', async () => {
  const bytes = new Uint8Array([1, 2]);
  const asset = await createAsset(bytes, {id: 'asset', name: 'a.bin', mime: 'application/octet-stream'});
  const catalog = {...createCatalog(), assets: [asset]};
  assert.throws(() => estimateCatalogBundleSize({catalog, content: new Map()}), /exactly/);
  assert.throws(() => estimateCatalogBundleSize({catalog, content: new Map([['other', bytes]])}), /Missing/);
  assert.throws(() => estimateCatalogBundleSize({catalog, content: new Map([['asset', bytes], ['other', bytes]])}), /exactly/);
  assert.throws(() => estimateCatalogBundleSize({catalog, content: new Map([['asset', new Uint8Array(1)]])}), /length/);
  assert.throws(() => estimateCatalogBundleSize({catalog, content: new Map([['asset', [1, 2] as never]])}), /length/);
  assert.throws(() => estimateCatalogBundleSize({catalog: {...catalog, assets: [{...asset, id: 'unsafe"id'}]}, content: new Map([['asset', bytes]])}), /identifier/);
  assert.throws(() => estimateCatalogBundleSize({catalog: {...catalog, resources: Array(CATALOG_LIMITS.resources + 1).fill({})}, content: new Map([['asset', bytes]])}), /capacity/);
});

test('size measurement does not encode, copy or hash asset bytes; export still rejects corruption', async t => {
  const bytes = new Uint8Array([1, 2, 3]);
  const asset = await createAsset(bytes, {id: 'asset', name: 'a.bin', mime: 'application/octet-stream'});
  const bundle = {catalog: {...createCatalog(), assets: [asset]}, content: new Map([['asset', bytes]])};
  const clone = t.mock.method(Uint8Array, 'from', () => {throw new Error('Unexpected byte clone.');});
  const digest = t.mock.method(crypto.subtle, 'digest', () => {throw new Error('Unexpected hash.');});
  const encode = t.mock.method(globalThis, 'btoa', () => {throw new Error('Unexpected base64 encoding.');});
  assert.equal(estimateCatalogBundleSize(bundle).contentBytes, 3);
  assert.equal(clone.mock.callCount(), 0); assert.equal(digest.mock.callCount(), 0); assert.equal(encode.mock.callCount(), 0);
  t.mock.restoreAll();
  bytes[0] ^= 1;
  assert.equal(estimateCatalogBundleSize(bundle).withinLimit, true);
  await assert.rejects(() => exportCatalogBundle(bundle), /integrity mismatch/);
});

test('the exact portable cap is inclusive and oversize export stops before byte clones and hashes', async t => {
  const bytes = new Uint8Array(CATALOG_LIMITS.fileBytes);
  const sha256 = await hashContent(bytes);
  const catalog = {...createCatalog(), assets: ['a', 'b'].map(id => ({id, name: 'a.bin', mime: 'application/octet-stream', size: bytes.length, sha256})), extensions: {'org.example.padding': ''}};
  const content = new Map([['a', bytes], ['b', bytes]]);
  const paddingLength = CATALOG_LIMITS.bundleBytes - estimateCatalogBundleSize({catalog, content}).bundleBytes;
  assert.ok(paddingLength > 0 && paddingLength < CATALOG_LIMITS.extensionBytes);
  const padded = (offset: number): CatalogBundle => ({catalog: {...catalog, extensions: {'org.example.padding': 'x'.repeat(paddingLength + offset)}}, content});
  assert.equal(estimateCatalogBundleSize(padded(-1)).bundleBytes, CATALOG_LIMITS.bundleBytes - 1);
  assert.equal(estimateCatalogBundleSize(padded(-1)).withinLimit, true);
  const exact = padded(0);
  assert.equal(estimateCatalogBundleSize(exact).bundleBytes, CATALOG_LIMITS.bundleBytes);
  assert.equal(estimateCatalogBundleSize(exact).withinLimit, true);
  assert.equal(encoder.encode(await exportCatalogBundle(exact)).length, CATALOG_LIMITS.bundleBytes);
  const oversized = padded(1);
  validateCatalog(oversized.catalog); // Metadata and raw content are independently within their caps.
  assert.equal(estimateCatalogBundleSize(oversized).bundleBytes, CATALOG_LIMITS.bundleBytes + 1);
  assert.equal(estimateCatalogBundleSize(oversized).withinLimit, false);
  const clone = t.mock.method(Uint8Array, 'from', () => {throw new Error('Unexpected byte clone.');});
  const digest = t.mock.method(crypto.subtle, 'digest', () => {throw new Error('Unexpected hash.');});
  const encode = t.mock.method(globalThis, 'btoa', () => {throw new Error('Unexpected base64 encoding.');});
  await assert.rejects(() => exportCatalogBundle(oversized), /Portable catalog bundle capacity exceeded/);
  assert.equal(clone.mock.callCount(), 0); assert.equal(digest.mock.callCount(), 0); assert.equal(encode.mock.callCount(), 0);
});
