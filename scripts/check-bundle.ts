import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

export const INITIAL_BUDGET = Object.freeze({javascript: 160 * 1024, css: 20 * 1024});
type Size = {javascript: number; css: number};

/** Measure Vite's emitted entry resources, including static module preloads.
 * Dynamic imports are deliberately outside the initial transfer budget. */
export function initialBundleSize(html: string, readAsset: (path: string) => Uint8Array): Size {
  const assets = {javascript: new Set<string>(), css: new Set<string>()};
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/giu)) {
    const attrs = Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/gu), attr => [attr[1].toLowerCase(), attr[2]]));
    const kind = match[1].toLowerCase() === 'script' && attrs.type === 'module' ? 'javascript'
      : attrs.rel === 'modulepreload' ? 'javascript' : attrs.rel === 'stylesheet' ? 'css' : null;
    if (!kind) continue;
    const path = attrs.src ?? attrs.href;
    if (!path || !/^\/assets\/[A-Za-z0-9._-]+$/u.test(path)) throw new Error('Unexpected built entry asset path.');
    assets[kind].add(path);
  }
  if (!assets.javascript.size) throw new Error('Built entry has no module script or preload.');
  const sizes = {javascript: 0, css: 0};
  for (const kind of ['javascript', 'css'] as const) {
    for (const path of assets[kind]) sizes[kind] += gzipSync(readAsset(path), {level: 9}).byteLength;
  }
  return sizes;
}

export function requireBundleBudget(size: Size, budget: Size = INITIAL_BUDGET): void {
  for (const kind of ['javascript', 'css'] as const) {
    if (size[kind] > budget[kind]) throw new Error(`Initial ${kind} exceeds its ${budget[kind]}-byte gzip budget: ${size[kind]} bytes.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve('apps/web/dist');
  for (const entry of ['index.html', 'portal.html']) {
    const size = initialBundleSize(readFileSync(resolve(directory, entry), 'utf8'), path => readFileSync(resolve(directory, path.slice(1))));
    requireBundleBudget(size);
    console.log(`${entry}: JavaScript ${size.javascript}/${INITIAL_BUDGET.javascript} bytes gzip; CSS ${size.css}/${INITIAL_BUDGET.css} bytes gzip.`);
  }
}
