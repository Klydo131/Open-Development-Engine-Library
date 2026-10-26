import test from 'node:test';
import assert from 'node:assert/strict';
import {ITERATIONS} from '../packages/core/src/crypto.ts';
import {validateCatalogEnvelope} from '../packages/core/src/catalog-vault.ts';
import {fromBase64, toBase64} from '../packages/core/src/model.ts';
import {CATALOG_LIMITS} from '../packages/core/src/catalog.ts';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const envelope = {format: 'open-library-catalog-vault', version: 1, revision: 'revision-1', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toBase64(new Uint8Array(16)), iv: toBase64(new Uint8Array(12)), ciphertext: toBase64(new Uint8Array(16))};
const accepts = (ciphertext: string) => {
  try {validateCatalogEnvelope({...envelope, ciphertext}); return true;}
  catch {return false;}
};

test('envelope padding validation agrees with canonical decoding for every padded suffix', () => {
  const prefix = 'AAAA'.repeat(6);
  for (const a of alphabet) for (const b of alphabet) {
    const encoded = prefix + a + b + '==';
    assert.equal(accepts(encoded), toBase64(fromBase64(encoded)) === encoded, encoded);
  }
  for (const last of alphabet) {
    const encoded = prefix + 'AA' + last + '=';
    assert.equal(accepts(encoded), toBase64(fromBase64(encoded)) === encoded, encoded);
  }
  for (let value = 0; value < 65536; value++) {
    const encoded = prefix + toBase64(Uint8Array.of(value >>> 8, value & 255));
    assert.equal(accepts(encoded), true, encoded);
  }
});

test('envelope validation rejects whitespace, internal padding and non-base64 input', () => {
  for (const suffix of ['\n', '\r', '\r\n', ' ', '\t', '\u2028', '\u00a0', '!', '-', '_', '=']) {
    for (const field of ['salt', 'iv', 'ciphertext'] as const) {
      assert.throws(() => validateCatalogEnvelope({...envelope, [field]: envelope[field] + suffix}));
    }
  }
  for (const ciphertext of ['====', 'A===', 'AA=A', '=AAA', 'AA==AAAA', 'AAAA====', 'AAAA=AAA']) assert.equal(accepts(ciphertext), false);
});

test('envelope validation enforces byte lengths and bounded ciphertext before key derivation', () => {
  assert.equal(accepts(toBase64(new Uint8Array(15))), false);
  assert.equal(accepts(toBase64(new Uint8Array(16))), true);
  assert.equal(accepts(toBase64(new Uint8Array(17))), true);
  assert.throws(() => validateCatalogEnvelope({...envelope, salt: toBase64(new Uint8Array(15))}));
  assert.throws(() => validateCatalogEnvelope({...envelope, iv: toBase64(new Uint8Array(13))}));
  const maximum = Math.ceil((CATALOG_LIMITS.bundleBytes + 16) / 3) * 4;
  assert.equal(accepts('A'.repeat(maximum)), true);
  assert.equal(accepts('A'.repeat(maximum + 4)), false);
});
