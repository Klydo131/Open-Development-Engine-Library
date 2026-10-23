import {portalId} from '../../packages/portal/src/index.ts';
import {describePortalMedia, validatePortalMedia, type PortalMedia} from '../../packages/portal/src/media.ts';

/** Inject a server-only PostgreSQL connection authorized as library_media_service.
 * The caller supplies an ID from trusted, verified bearer authentication. Never
 * expose this connection or accept an actor ID from browser input. */
export interface PostgresMediaQuery {
  query(sql: string, values: unknown[]): Promise<{rows: readonly unknown[]}>;
}
export interface LibraryMediaStore {
  put(actorId: string, media: PortalMedia, bytes: Uint8Array): Promise<void>;
  get(actorId: string, id: string): Promise<{media: PortalMedia; bytes: Uint8Array} | null>;
}
export async function verifyMediaBytes(value: unknown, bytes: unknown): Promise<{media: PortalMedia; bytes: Uint8Array}> {
  try {
    const media = validatePortalMedia(value);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== media.size) throw new Error();
    // Own the buffer while hashing so a driver or scanner cannot change it later.
    const copy = new Uint8Array(bytes);
    const actual = await describePortalMedia(media.name, copy, media.id);
    if (actual.sha256 !== media.sha256) throw new Error();
    return {media, bytes:copy};
  } catch { throw new Error('Invalid media data.'); }
}
export function createPostgresMediaStore(database: PostgresMediaQuery): LibraryMediaStore {
  return {
    async put(actorId, value, bytes) {
      const actor = portalId(actorId), checked = await verifyMediaBytes(value,bytes);
      try {
        await database.query('select portal_private.put_media($1::uuid,$2::jsonb,$3::bytea)',[actor,JSON.stringify(checked.media),checked.bytes]);
      } catch { throw new Error('Media storage is unavailable.'); }
    },
    async get(actorId, id) {
      const actor = portalId(actorId), target = portalId(id);
      let result: {rows: readonly unknown[]};
      try { result = await database.query('select media,bytes from portal_private.get_media($1::uuid,$2::uuid)',[actor,target]); }
      catch { throw new Error('Media storage is unavailable.'); }
      if (!Array.isArray(result.rows) || result.rows.length > 1) throw new Error('Invalid media data.');
      if (!result.rows.length) return null;
      const row = result.rows[0] as {media?:unknown;bytes?:unknown} | null;
      const checked = await verifyMediaBytes(row?.media,row?.bytes);
      if (checked.media.id !== target) throw new Error('Invalid media data.');
      return checked;
    },
  };
}
