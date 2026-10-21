export const PORTAL_STORAGE_KEY = 'olr-portal-auth';
const verifierKey = `${PORTAL_STORAGE_KEY}-code-verifier`;
const indexKey = `${PORTAL_STORAGE_KEY}-flows-code-verifier`;
const slotPrefix = `${PORTAL_STORAGE_KEY}-flow-`;
const lifetime = 60 * 60 * 1000;
const maximumFlows = 5; // Exact pinned auth-js 2.118.0 contract.
type StoragePort = Pick<Storage, 'getItem'|'setItem'|'removeItem'|'key'|'length'>;
type Entry = {text: string; at: number};
function flowId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64 && !/[^A-Za-z0-9_-]/u.test(value);
}
function kind(key: string): 'verifier'|'index'|null {
  if (key === verifierKey) return 'verifier';
  if (key === indexKey) return 'index';
  if (key.startsWith(slotPrefix) && key.endsWith('-code-verifier') && flowId(key.slice(slotPrefix.length, -'-code-verifier'.length))) return 'verifier';
  return null;
}
function validText(key: string, text: unknown): text is string {
  if (typeof text !== 'string' || text.length > 1024) return false;
  try {
    const decoded = JSON.parse(text);
    return kind(key) === 'index'
      ? Array.isArray(decoded) && decoded.length <= maximumFlows && decoded.every(flowId) && new Set(decoded).size === decoded.length
      // oxlint-disable-next-line no-control-regex -- PKCE storage deliberately rejects C0 controls and DEL.
      : typeof decoded === 'string' && decoded.length > 0 && decoded.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(decoded);
  } catch { return false; }
}
/** Sessions/tokens stay in memory. Only bounded one-time PKCE verifiers and the
 * pinned SDK's five-flow index survive an email redirect, for at most one hour.
 * Re-run actual SDK callback tests whenever auth-js's storage contract changes.
 */
export function createPortalStorage(disk: StoragePort, now: () => number = Date.now) {
  const memory = new Map<string,string>();
  function keys(): string[] {
    const result: string[] = [];
    for (let i = 0, length = disk.length; i < length; i++) {
      const key = disk.key(i); if (key !== null && kind(key)) result.push(key);
    }
    return result;
  }
  function read(key: string): Entry|null {
    try {
      const raw = disk.getItem(key);
      if (!raw) return null;
      if (raw.length <= 1200) {
        const value = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value) &&
          Object.keys(value).length === 2 && Object.hasOwn(value,'text') && Object.hasOwn(value,'at') &&
          validText(key,value.text) && Number.isSafeInteger(value.at) && value.at >= 0 &&
          Number.isSafeInteger(now()) && now() >= value.at && now() - value.at < lifetime) return value;
      }
    } catch { /* An unavailable or corrupted verifier cannot establish a session. */ }
    try { disk.removeItem(key); } catch { /* Best effort with browser storage blocked. */ }
    return null;
  }
  function prune(protectedKey?: string): void {
    const entries = keys().map(key=>({key,entry:read(key)})).filter(item=>item.entry !== null);
    const index = entries.find(item=>item.key === indexKey);
    const order: string[] = index ? JSON.parse(index.entry!.text) : [];
    const slots = entries.filter(item=>item.key !== verifierKey && item.key !== indexKey && item.key !== protectedKey)
      .sort((a,b)=>a.entry!.at-b.entry!.at || order.indexOf(a.key.slice(slotPrefix.length,-'-code-verifier'.length))-order.indexOf(b.key.slice(slotPrefix.length,-'-code-verifier'.length)));
    let count = slots.length + (protectedKey?.startsWith(slotPrefix) && protectedKey !== indexKey ? 1 : 0);
    while (count > maximumFlows) { disk.removeItem(slots.shift()!.key); count--; }
  }
  try { prune(); } catch { /* The next email request must explicitly surface write failures. */ }
  return {
    getItem(key: string): string|null { return kind(key) ? read(key)?.text ?? null : memory.get(key) ?? null; },
    setItem(key: string, value: string): void {
      if (!kind(key)) { memory.set(key,value); return; }
      if (!validText(key,value)) throw new Error('Invalid or oversized email verification state.');
      const at = now(); if (!Number.isSafeInteger(at) || at < 0) throw new Error('Check the device clock before requesting an email link.');
      // Do not silently offer an email flow that cannot complete after redirect.
      disk.setItem(key,JSON.stringify({text:value,at})); prune(key);
    },
    removeItem(key: string): void { memory.delete(key); if (kind(key)) disk.removeItem(key); },
    clear(): void {
      memory.clear();
      try { for (const key of keys()) disk.removeItem(key); } catch { /* Best effort if storage is blocked. */ }
    },
  };
}
