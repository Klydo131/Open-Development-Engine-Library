import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {initialBundleSize, requireBundleBudget, INITIAL_BUDGET} from '../scripts/check-bundle.ts';

test('initial budget includes shared static preloads once and excludes dynamic imports', () => {
  const source = Buffer.from('import("/assets/later.js");');
  const seen: string[] = [];
  const size = initialBundleSize('<script type="module" src="/assets/main.js"></script><link rel="modulepreload" href="/assets/shared.js"><link rel="modulepreload" href="/assets/shared.js"><link rel="stylesheet" href="/assets/main.css">', path => {seen.push(path); return source;});
  const compressed = gzipSync(source, {level: 9}).byteLength;
  assert.deepEqual(seen, ['/assets/main.js', '/assets/shared.js', '/assets/main.css']);
  assert.deepEqual(size, {javascript: compressed * 2, css: compressed});
});

test('budget accepts the exact boundary and fails either resource above it', () => {
  assert.doesNotThrow(() => requireBundleBudget(INITIAL_BUDGET));
  assert.throws(() => requireBundleBudget({...INITIAL_BUDGET, javascript: INITIAL_BUDGET.javascript + 1}), /javascript exceeds/u);
  assert.throws(() => requireBundleBudget({...INITIAL_BUDGET, css: INITIAL_BUDGET.css + 1}), /css exceeds/u);
});

test('missing, external or unexpected built assets fail instead of reporting a smaller bundle', () => {
  const missing = () => {throw new Error('Missing asset');};
  assert.throws(() => initialBundleSize('<script type="module" src="/assets/missing.js"></script>', missing), /Missing asset/u);
  for (const path of ['https://example.org/main.js', '/assets/../main.js', '/assets/%2e%2e/main.js']) {
    assert.throws(() => initialBundleSize(`<script type="module" src="${path}"></script>`, missing), /Unexpected/u);
  }
  assert.throws(() => initialBundleSize('<title>Empty build</title>', missing), /no module/u);
});
