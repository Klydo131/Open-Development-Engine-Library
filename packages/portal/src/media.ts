import {portalId} from './index.ts';

export type PortalMediaType = 'document' | 'audio' | 'video' | 'image';
export type PortalMedia = Readonly<{id: string; name: string; mime: string; size: number; sha256: string; mediaType: PortalMediaType}>;
export interface PortalMediaStore {
  upload(input: {name: string; bytes: Uint8Array}): Promise<PortalMedia>;
  download(id: string): Promise<{media: PortalMedia; bytes: Uint8Array}>;
}
export const MEDIA_LIMITS = Object.freeze({fileBytes: 10 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, files: 100});
const formats: Readonly<Record<string, {mime: string; mediaType: PortalMediaType}>> = Object.freeze({
  pdf: {mime: 'application/pdf', mediaType: 'document'},
  mp3: {mime: 'audio/mpeg', mediaType: 'audio'}, wav: {mime: 'audio/wav', mediaType: 'audio'}, m4a: {mime: 'audio/mp4', mediaType: 'audio'},
  mp4: {mime: 'video/mp4', mediaType: 'video'}, webm: {mime: 'video/webm', mediaType: 'video'},
  png: {mime: 'image/png', mediaType: 'image'}, jpg: {mime: 'image/jpeg', mediaType: 'image'}, jpeg: {mime: 'image/jpeg', mediaType: 'image'},
});
function filename(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\p{Cc}\\/]/u.test(value) || value === '.' || value === '..') throw new Error('Use a short filename without path separators or control characters.');
  return value;
}
export function validatePortalMedia(value: unknown): PortalMedia {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid media metadata.');
  const row = value as Record<string, unknown>, keys = ['id', 'name', 'mime', 'size', 'sha256', 'mediaType'];
  if (keys.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key))) throw new Error('Invalid media metadata.');
  const name = filename(row.name), format = formats[name.split('.').pop()!.toLowerCase()];
  if (!format || row.mime !== format.mime || row.mediaType !== format.mediaType || !Number.isSafeInteger(row.size) || (row.size as number) < 1 || (row.size as number) > MEDIA_LIMITS.fileBytes || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sha256)) throw new Error('Invalid or oversized media metadata.');
  return Object.freeze({id: portalId(row.id), name, mime: format.mime, size: row.size as number, sha256: row.sha256, mediaType: format.mediaType});
}
export function inspectPortalMedia(name: string, bytes: Uint8Array): {mime: string; mediaType: PortalMediaType} {
  filename(name);
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MEDIA_LIMITS.fileBytes) throw new Error('Choose a non-empty file of 10 MiB or less.');
  const extension = name.split('.').pop()!.toLowerCase(), format = formats[extension];
  const head = String.fromCharCode(...bytes.subarray(0, 16));
  const valid = extension === 'pdf' ? head.startsWith('%PDF-')
    : extension === 'mp3' ? head.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : extension === 'wav' ? head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE'
    : extension === 'm4a' || extension === 'mp4' ? head.slice(4, 8) === 'ftyp'
    : extension === 'webm' ? [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value)
    : extension === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : extension === 'jpg' || extension === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : false;
  if (!format || !valid) throw new Error('Choose a PDF, MP3, WAV, M4A, MP4, WebM, PNG or JPEG whose contents match its filename.');
  return {...format};
}
export async function describePortalMedia(name: string, bytes: Uint8Array, id: string = crypto.randomUUID()): Promise<PortalMedia> {
  const format = inspectPortalMedia(name, bytes);
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return validatePortalMedia({id, name, ...format, size: bytes.byteLength, sha256});
}
