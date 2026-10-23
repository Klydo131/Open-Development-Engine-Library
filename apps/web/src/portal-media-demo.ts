import {describePortalMedia, inspectPortalMedia, MEDIA_LIMITS, portalId, type PortalAccount, type PortalMedia, type PortalMediaStore} from '../../../packages/portal/src/index.ts';

export function createDemoMedia(account: () => PortalAccount, canRead: (id: string) => Promise<boolean>): PortalMediaStore & {has(media: PortalMedia): boolean} {
  const files = new Map<string, {media: PortalMedia; bytes: Uint8Array}>();
  let total = 0;
  return {
    async upload(input) {
      if (account().user?.role !== 'admin') throw new Error('Only an assigned admin can upload library files.');
      inspectPortalMedia(input.name,input.bytes);
      const bytes = new Uint8Array(input.bytes), media = await describePortalMedia(input.name, bytes);
      if (account().user?.role !== 'admin') throw new Error('The account changed before this upload completed.');
      if (files.size >= MEDIA_LIMITS.files || total + bytes.byteLength > MEDIA_LIMITS.totalBytes) throw new Error('The demonstration file limit is reached. Refresh to clear its temporary files.');
      files.set(media.id, {media, bytes}); total += bytes.byteLength;
      return media;
    },
    async download(id) {
      const user = account().user;
      const checkedId = portalId(id);
      if (!user || !(await canRead(checkedId)) || account().user?.id !== user.id) throw new Error('This file is not available to the current account.');
      const file = files.get(checkedId);
      if (!file) throw new Error('This temporary file is no longer available.');
      return {media: file.media, bytes: new Uint8Array(file.bytes)};
    },
    has(media) {
      const stored = files.get(media.id)?.media;
      return Boolean(stored && Object.keys(stored).every(key => stored[key as keyof PortalMedia] === media[key as keyof PortalMedia]));
    },
  };
}
