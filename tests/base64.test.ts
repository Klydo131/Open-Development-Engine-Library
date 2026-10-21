import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {fromBase64, toBase64} from '../packages/core/src/model.ts';

test('base64 matches RFC 4648 section 10 reference vectors', () => {
  const vectors = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
  for (const [plain, encoded] of vectors) {
    assert.equal(toBase64(new TextEncoder().encode(plain)), encoded);
    assert.equal(new TextDecoder().decode(fromBase64(encoded)), plain);
  }
});

test('every byte value decodes exactly against the Node Buffer oracle', () => {
  const expected = Buffer.from(Array.from({length: 256}, (_, index) => index));
  const encoded = expected.toString('base64');
  assert.deepEqual(Buffer.from(fromBase64(encoded)), expected);
  assert.equal(toBase64(fromBase64(encoded)), encoded);
});

test('binary content across encoding chunks and padding boundaries matches Node Buffer', () => {
  for (const length of [8191, 8192, 8193, 16385, 256 * 1024 + 2]) {
    const expected = Buffer.alloc(length);
    for (let index = 0; index < length; index++) expected[index] = (index * 73 + (index >>> 8) * 19) & 255;
    const encoded = expected.toString('base64');
    assert.equal(toBase64(expected), encoded);
    assert.deepEqual(Buffer.from(fromBase64(encoded)), expected);
  }
});

test('decoder preserves existing atob support for unpadded and whitespace-separated input', () => {
  assert.equal(new TextDecoder().decode(fromBase64('Zg')), 'f');
  assert.equal(new TextDecoder().decode(fromBase64(' Zm9v\nYmFy\t')), 'foobar');
});

test('decoder rejects invalid base64 instead of silently returning partial bytes', () => {
  for (const encoded of ['A', 'AA=', 'A===', '!!!!', 'Zm9v☃', 'Zm9v-']) {
    assert.throws(() => fromBase64(encoded), {name: 'InvalidCharacterError'});
  }
});
