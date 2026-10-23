import {describePortalMedia, inspectPortalMedia, MEDIA_LIMITS, portalEmail, portalId, validateGroupInvitation, validatePortalMedia, type PortalMediaStore} from '../../packages/portal/src/index.ts';
import type {GroupDelivery} from '../postgres/group-workspace.ts';

export interface PortalFunctionClient {
  invoke(name: string, options: {method?: 'GET' | 'POST'; body?: Record<string, unknown> | ArrayBuffer; headers?: Record<string, string>}): PromiseLike<{data: unknown; error: unknown; response?: Response}>;
}
export function portalServices(client: PortalFunctionClient): {groupDelivery: GroupDelivery; media: PortalMediaStore} {
  return {
    groupDelivery: {async inviteLearner(groupId, email) {
      const response = await client.invoke('group-invitations', {body: {groupId: portalId(groupId), email: portalEmail(email)}});
      if (response.error) throw new Error('Invitation delivery could not be confirmed. Review pending invitations before trying again.');
      const invitation = validateGroupInvitation(response.data);
      if (invitation.groupId !== groupId || invitation.email.toLowerCase() !== email.trim().toLowerCase()) throw new Error('The invitation service returned an invalid receipt.');
      return invitation;
    }},
    media: {
      async upload(input) {
        inspectPortalMedia(input.name, input.bytes);
        const bytes = new Uint8Array(input.bytes);
        const response = await client.invoke('library-media', {method: 'POST', body: bytes.buffer, headers: {'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(input.name)}});
        if (response.error) throw new Error('The file upload could not be confirmed. Check the configured file service before trying again.');
        const media = validatePortalMedia(response.data), actual = await describePortalMedia(input.name, bytes, media.id);
        if (JSON.stringify(media) !== JSON.stringify(actual)) throw new Error('The file service returned mismatched metadata.');
        return media;
      },
      async download(id) {
        const checkedId = portalId(id), response = await client.invoke('library-media', {method: 'GET', headers: {'X-Media-Id': checkedId}});
        if (response.error || !(response.data instanceof Blob) || !response.response || response.data.size > MEDIA_LIMITS.fileBytes) throw new Error('This file is not available to the current account.');
        let media;
        try { media = validatePortalMedia(JSON.parse(decodeURIComponent(response.response.headers.get('X-Library-Media') ?? ''))); } catch { throw new Error('The file service returned invalid metadata.'); }
        if (media.id !== checkedId || media.size !== response.data.size) throw new Error('The file service returned mismatched metadata.');
        const bytes = new Uint8Array(await response.data.arrayBuffer()), actual = await describePortalMedia(media.name, bytes, media.id);
        if (JSON.stringify(media) !== JSON.stringify(actual)) throw new Error('The downloaded file did not match its stored metadata.');
        return {media, bytes};
      },
    },
  };
}
