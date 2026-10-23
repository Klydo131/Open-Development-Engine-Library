import {portalId} from '../../packages/portal/src/index.ts';
import type {GroupRpcClient} from './group-workspace.ts';
import type {InvitationService} from '../http/group-invitations.ts';
import {validateGroupInvitation} from '../../packages/portal/src/index.ts';

export interface PortalConnection {
  query(sql: string, values?: readonly unknown[]): Promise<{rows: Record<string, unknown>[]} >;
  release(error?: Error): void;
}
export interface PortalPool {connect(): Promise<PortalConnection>;}
const calls: Readonly<Record<string, readonly string[]>> = Object.freeze({
  portal_role: [], portal_list_courses: [], portal_support: [],
  portal_save_course: ['p_course', 'p_expected_revision'], portal_ask_support: ['p_question'], portal_reply_support: ['p_id', 'p_reply', 'p_expected_revision'],
  portal_groups: [], portal_save_group: ['p_group', 'p_expected_revision'], portal_group_sessions: ['p_group_id'],
  portal_save_group_session: ['p_session', 'p_expected_revision'], portal_group_posts: ['p_group_id'], portal_add_group_post: ['p_group_id', 'p_body'],
  portal_remove_group_post: ['p_group_id', 'p_id'], portal_group_invitations: ['p_group_id'], portal_revoke_group_invitation: ['p_group_id', 'p_id'],
  portal_accept_group_invitation: ['p_token'], portal_group_members: ['p_group_id'], portal_remove_group_member: ['p_group_id', 'p_user_id'],
  portal_teacher_requests: [], portal_request_teacher: ['p_request'], portal_create_private_room: ['p_request_id', 'p_title', 'p_description'],
  portal_create_group_invitation: ['p_group_id', 'p_email', 'p_token_hash'],
});
export async function withPortalActor<T>(pool: PortalPool, verifiedActorId: string, action: (connection: PortalConnection) => Promise<T>): Promise<T> {
  const id = portalId(verifiedActorId), connection = await pool.connect(); let discard: Error | undefined;
  try {
    await connection.query('begin');
    await connection.query('set local role authenticated');
    await connection.query("select set_config('library.actor_id',$1,true)", [id]);
    const value = await action(connection);
    await connection.query('commit'); return value;
  } catch (error) {
    try { await connection.query('rollback'); } catch { discard = new Error('Connection rollback failed.'); }
    throw error;
  } finally { connection.release(discard); }
}
export function postgresPortalRpc(pool: PortalPool, verifiedActorId: string): GroupRpcClient {
  const actorId = portalId(verifiedActorId);
  return {async rpc(name, parameters = {}) {
    const keys = Object.hasOwn(calls, name) ? calls[name] : undefined;
    if (!keys || Object.keys(parameters).length !== keys.length || keys.some(key => !Object.hasOwn(parameters, key))) return {data: null, error: {code: '22023'}};
    try {
      const data = await withPortalActor(pool, actorId, async connection => {
        const response = await connection.query(`select public.${name}(${keys.map((_, index) => '$' + (index + 1)).join(',')}) as value`, keys.map(key => parameters[key]));
        if (response.rows.length !== 1) throw new Error('Invalid database response.');
        return response.rows[0].value;
      });
      return {data, error: null};
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '08000';
      return {data: null, error: {code}};
    }
  }};
}
export function postgresInvitations(pool: PortalPool): InvitationService {
  return {
    async create(actorId, groupId, email, tokenHash) {
      const result = await postgresPortalRpc(pool, actorId).rpc('portal_create_group_invitation', {p_group_id: groupId, p_email: email, p_token_hash: tokenHash});
      if (result.error) throw new Error('Invitation could not be created.');
      return validateGroupInvitation(result.data);
    },
    async revoke(actorId, groupId, id) {
      const result = await postgresPortalRpc(pool, actorId).rpc('portal_revoke_group_invitation', {p_group_id: groupId, p_id: id});
      if (result.error) throw new Error('Invitation could not be revoked.');
    },
  };
}
