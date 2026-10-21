import {validateEnvelope, type Envelope, type VaultStore} from '../../packages/core/src/index.ts';
/** Legacy learning-room envelope/schema example; not the active app adapter or catalog store.
 * Requires schema.example.sql ownership policies. Never pass a service-role key.
 */
export function supabaseStore(options: {url: string; publishableKey: string; userId: string; accessToken: () => Promise<string>}): VaultStore {
  const base = new URL(options.url);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('A trusted HTTPS Supabase endpoint is required.');
  const endpoint = new URL('/rest/v1/learning_room_vaults', base);
  async function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', expectedIv: string | null, envelope?: Envelope) {
    // A 12-byte AES-GCM IV has exactly 16 canonical base64 characters. Never
    // allow a missing or malformed revision to turn a conditional mutation into one without its filter.
    if ((method === 'PATCH' || method === 'DELETE') && (typeof expectedIv !== 'string' || expectedIv.length !== 16 || !/^[A-Za-z0-9+/]{16}$/.test(expectedIv))) {
      throw new Error('A valid encrypted backup revision is required.');
    }
    const body = method === 'POST' || method === 'PATCH' ? JSON.stringify(method === 'POST'
      ? {owner_id: options.userId, envelope: validateEnvelope(envelope)}
      : {envelope: validateEnvelope(envelope)}) : undefined;
    const url = new URL(endpoint);
    if (method !== 'POST') url.searchParams.set('owner_id', `eq.${options.userId}`);
    if (method === 'PATCH' || method === 'DELETE') url.searchParams.set('envelope->>iv', `eq.${expectedIv}`);
    const token = await options.accessToken();
    if (typeof token !== 'string' || !token.trim()) throw new Error('Sign in to your chosen provider first.');
    const result = await fetch(url, {method, redirect:'error', referrerPolicy:'no-referrer', cache:'no-store', headers: {
      apikey: options.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type':'application/json', Prefer:'return=representation'
    }, ...(body === undefined ? {} : {body})});
    if (!result.ok) throw new Error(`Encrypted backup request failed (${result.status}).`);
    let rows: unknown;
    try { rows = await result.json(); }
    catch { throw new Error('Invalid encrypted backup response.'); }
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid encrypted backup response.');
    return rows.map(row => {
      if (!row || typeof row !== 'object' || !('envelope' in row)) throw new Error('Invalid encrypted backup response.');
      return validateEnvelope(row.envelope);
    });
  }
  return {
    async read() {const rows=await request('GET', null); return rows[0] ?? null;},
    async write(value, expectedIv) {
      const rows=await request(expectedIv===null?'POST':'PATCH',expectedIv,value);
      if(rows.length!==1) throw new Error('Remote backup changed. Fetch it and resolve the conflict before writing.');
    },
    async remove(expectedIv) {const rows=await request('DELETE',expectedIv); if(rows.length!==1)throw new Error('Remote backup changed or is already absent.');}
  };
}
