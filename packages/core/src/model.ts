export type SourceKind = 'link' | 'video' | 'pdf' | 'audio' | 'note';
export type Attachment = { name: string; mime: string; data: string };
export type Lesson = {
  id: string; title: string; kind: SourceKind; url: string; tags: string[];
  notes: string; question: string; answer: string; learned: boolean;
  createdAt: string; attachment?: Attachment;
};
export type Practice = {
  id: string; lessonId: string; title: string; steps: string[]; completed: boolean[]; reflection: string;
};
export type Library = { version: 1; lessons: Lesson[]; practices: Practice[]; recommendations: boolean };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 30 * 1024 * 1024;
export const emptyLibrary = (): Library => ({ version: 1, lessons: [], practices: [], recommendations: true });
export function safeURL(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http or https link without a username or password.');
  if (value.length > 2048) throw new Error('This link is too long.');
  return url.href;
}
export function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}
export function inspectFile(name: string, bytes: Uint8Array): {kind: 'pdf' | 'audio'; mime: string} {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Choose a non-empty file of 10 MB or less.');
  const ext = name.toLowerCase().split('.').pop();
  const head = String.fromCharCode(...bytes.subarray(0, 16));
  if (ext === 'pdf' && head.startsWith('%PDF-')) return {kind: 'pdf', mime: 'application/pdf'};
  if (ext === 'mp3' && (head.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224))) return {kind: 'audio', mime: 'audio/mpeg'};
  if (ext === 'wav' && head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return {kind: 'audio', mime: 'audio/wav'};
  if (ext === 'm4a' && head.slice(4, 8) === 'ftyp') return {kind: 'audio', mime: 'audio/mp4'};
  throw new Error('Supported files: PDF, MP3, WAV and M4A. The file contents must match the extension.');
}
function string(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid or oversized library field.');
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid library data.');
}
export function validateLibrary(input: unknown): Library {
  object(input);
  if (input.version !== 1 || !Array.isArray(input.lessons) || input.lessons.length > 200 || !Array.isArray(input.practices) || input.practices.length > 400 || typeof input.recommendations !== 'boolean') throw new Error('Unsupported library version or capacity exceeded.');
  let attachmentBytes = 0;
  const ids = new Set<string>();
  const lessons: Lesson[] = input.lessons.map(item => {
    object(item);
    for (const key of ['id', 'title', 'kind', 'url', 'notes', 'question', 'answer', 'createdAt']) string(item[key], key === 'notes' ? 20000 : key === 'url' ? 2048 : key === 'answer' ? 5000 : 300);
    if (!item.id || ids.has(item.id as string) || !(item.title as string).trim() || !['link','video','pdf','audio','note'].includes(item.kind as string) || typeof item.learned !== 'boolean' || !Array.isArray(item.tags) || item.tags.length > 12 || !Number.isFinite(Date.parse(item.createdAt as string))) throw new Error('Invalid lesson.');
    ids.add(item.id as string);
    item.tags.forEach(tag => string(tag, 50));
    const url = item.url ? safeURL(item.url as string) : '';
    if (['link','video'].includes(item.kind as string) && !url) throw new Error('A link is required.');
    let attachment: Attachment | undefined;
    if (item.attachment !== undefined) {
      object(item.attachment); string(item.attachment.name, 255); string(item.attachment.mime, 80); string(item.attachment.data, Math.ceil(MAX_FILE_BYTES / 3) * 4);
      const bytes = fromBase64(item.attachment.data);
      attachmentBytes += bytes.length;
      const file = inspectFile(item.attachment.name, bytes);
      if (file.kind !== item.kind || file.mime !== item.attachment.mime) throw new Error('File type mismatch.');
      attachment = {name: item.attachment.name, mime: file.mime, data: item.attachment.data};
    }
    if (['pdf','audio'].includes(item.kind as string) && !attachment) throw new Error('Missing source file.');
    return {id: item.id as string, title: item.title as string, kind: item.kind as SourceKind, url, tags: item.tags as string[], notes: item.notes as string, question: item.question as string, answer: item.answer as string, learned: item.learned as boolean, createdAt: item.createdAt as string, ...(attachment ? {attachment} : {})};
  });
  if (attachmentBytes > 20 * 1024 * 1024) throw new Error('This first version supports 20 MB of files per library.');
  const practiceIds = new Set<string>();
  const practices: Practice[] = input.practices.map(item => {
    object(item); string(item.id, 300); string(item.lessonId, 300); string(item.title, 300); string(item.reflection, 20000);
    if (!item.id || practiceIds.has(item.id) || !ids.has(item.lessonId) || !Array.isArray(item.steps) || item.steps.length < 1 || item.steps.length > 10 || !Array.isArray(item.completed) || item.completed.length !== item.steps.length || item.completed.some(x => typeof x !== 'boolean')) throw new Error('Invalid practice plan.');
    item.steps.forEach(step => string(step, 500)); practiceIds.add(item.id);
    return {id: item.id, lessonId: item.lessonId, title: item.title, steps: item.steps as string[], completed: item.completed as boolean[], reflection: item.reflection};
  });
  const result: Library = {version: 1, lessons, practices, recommendations: input.recommendations};
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_LIBRARY_BYTES) throw new Error('Library capacity exceeded.');
  return result;
}
