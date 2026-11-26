/**
 * Personal chat-style notes for logged-in users: text, links and code in time order, plus files
 * (images, PDFs, documents) stored privately in R2. Only the owner can list, open or delete them.
 */
import type { Env } from './env';
import { ApiError, json, readJson } from './http';
import { limit, requireUser } from './services';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const QUOTA_BYTES = 1024 * 1024 * 1024;
const MAX_TEXT = 20_000;
const PAGE = 50;

const BLOCKED_TYPES = /^(text\/html|application\/xhtml|image\/svg|application\/javascript|text\/javascript)/i;

interface NoteRow {
  id: number;
  text: string;
  file_key: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: number;
  edited_at: number | null;
}

const publicNote = (n: NoteRow) => ({
  id: n.id,
  text: n.text,
  file: n.file_key ? { name: n.file_name, type: n.file_type, size: n.file_size, url: `/api/notes/${n.id}/file` } : null,
  createdAt: n.created_at,
  editedAt: n.edited_at,
});

/** SQL filter for each tab of the vault. */
const FILTERS: Record<string, string> = {
  all: '1 = 1',
  links: "text LIKE '%http%'",
  code: "text LIKE '%```%'",
  media: "file_type LIKE 'image/%' OR file_type LIKE 'video/%'",
  docs: "file_key IS NOT NULL AND file_type NOT LIKE 'image/%' AND file_type NOT LIKE 'video/%'",
};

export async function list(env: Env, request: Request): Promise<Response> {
  const { user } = await requireUser(env, request);
  const url = new URL(request.url);
  const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const filter = FILTERS[url.searchParams.get('filter') ?? 'all'] ?? FILTERS['all'];
  const rows = await env.DB.prepare(
    `SELECT id, text, file_key, file_name, file_type, file_size, created_at, edited_at FROM notes
     WHERE user_id = ? AND id < ? AND (${filter}) AND (? = '' OR text LIKE ? OR file_name LIKE ?)
     ORDER BY id DESC LIMIT ?`,
  )
    .bind(user.id, before, q, like, like, PAGE + 1)
    .all<NoteRow>();
  const usage = await env.DB.prepare('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM notes WHERE user_id = ?').bind(user.id).first<{ bytes: number }>();
  return json({
    notes: rows.results.slice(0, PAGE).reverse().map(publicNote),
    more: rows.results.length > PAGE,
    usage: { bytes: usage?.bytes ?? 0, quota: QUOTA_BYTES },
    uploads: !!env.FILES,
  });
}

export async function create(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ text?: string }>(request);
  const { user } = await requireUser(env, request);
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
  if (!text.trim()) throw new ApiError(400, 'Type a note first.');
  await limit(env, `notes:${user.id}`, 1000, 86_400_000, 'Too many notes today.');
  const row = await env.DB.prepare('INSERT INTO notes (user_id, text, created_at) VALUES (?, ?, ?) RETURNING id, text, file_key, file_name, file_type, file_size, created_at, edited_at')
    .bind(user.id, text, Date.now())
    .first<NoteRow>();
  return json({ note: publicNote(row!) }, 201);
}

/** Upload one file (multipart form: "file", optional "text" caption). */
export async function upload(env: Env, request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'This request came from another site.');
  const { user } = await requireUser(env, request);
  if (!env.FILES) throw new ApiError(503, 'File uploads are not switched on yet.');
  const size = Number(request.headers.get('content-length') ?? 0);
  if (size > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw new ApiError(400, 'Choose a file to upload.');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  if (!file.size) throw new ApiError(400, 'This file is empty.');
  await limit(env, `uploads:${user.id}`, 200, 86_400_000, 'Too many uploads today.');
  const used = await env.DB.prepare('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM notes WHERE user_id = ?').bind(user.id).first<{ bytes: number }>();
  if ((used?.bytes ?? 0) + file.size > QUOTA_BYTES) throw new ApiError(413, 'Your storage is full (1 GB). Delete some files first.');
  const key = `notes/${user.id}/${crypto.randomUUID()}`;
  const type = (file.type || 'application/octet-stream').slice(0, 100);
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: type } });
  const caption = String(form?.get('text') ?? '').slice(0, MAX_TEXT);
  const row = await env.DB.prepare(
    `INSERT INTO notes (user_id, text, file_key, file_name, file_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id, text, file_key, file_name, file_type, file_size, created_at, edited_at`,
  )
    .bind(user.id, caption, key, file.name.slice(0, 200) || 'file', type, file.size, Date.now())
    .first<NoteRow>();
  return json({ note: publicNote(row!) }, 201);
}

/** Streams the owner's file. Types a browser could run as a page are always downloaded, never shown. */
export async function file(env: Env, request: Request, id: string): Promise<Response> {
  const { user } = await requireUser(env, request);
  const row = await env.DB.prepare('SELECT file_key, file_name, file_type FROM notes WHERE id = ? AND user_id = ?')
    .bind(Number(id), user.id)
    .first<{ file_key: string | null; file_name: string; file_type: string }>();
  if (!row?.file_key || !env.FILES) throw new ApiError(404, 'This file does not exist.');
  const object = await env.FILES.get(row.file_key);
  if (!object) throw new ApiError(404, 'This file does not exist.');
  const download = new URL(request.url).searchParams.has('download') || BLOCKED_TYPES.test(row.file_type);
  const type = BLOCKED_TYPES.test(row.file_type) ? 'application/octet-stream' : row.file_type;
  const name = encodeURIComponent(row.file_name);
  return new Response(object.body, {
    headers: {
      'content-type': type,
      'content-length': String(object.size),
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      // No 'sandbox' here: it would stop the browser's PDF viewer. Page-like types are downloaded instead.
      'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

export async function edit(env: Env, request: Request, id: string): Promise<Response> {
  const body = await readJson<{ text?: string }>(request);
  const { user } = await requireUser(env, request);
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
  const row = await env.DB.prepare(
    'UPDATE notes SET text = ?, edited_at = ? WHERE id = ? AND user_id = ? RETURNING id, text, file_key, file_name, file_type, file_size, created_at, edited_at',
  )
    .bind(text, Date.now(), Number(id), user.id)
    .first<NoteRow>();
  if (!row) throw new ApiError(404, 'This note does not exist.');
  if (!row.text.trim() && !row.file_key) throw new ApiError(400, 'A note cannot be empty.');
  return json({ note: publicNote(row) });
}

export async function remove(env: Env, request: Request, id: string): Promise<Response> {
  await readJson(request);
  const { user } = await requireUser(env, request);
  const row = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ? RETURNING file_key').bind(Number(id), user.id).first<{ file_key: string | null }>();
  if (row?.file_key && env.FILES) await env.FILES.delete(row.file_key);
  return json({ ok: true });
}

/** When an account is deleted: its files in R2 (the rows go with the user). */
export async function deleteUserFiles(env: Env, userId: string): Promise<void> {
  if (!env.FILES) return;
  const rows = await env.DB.prepare('SELECT file_key FROM notes WHERE user_id = ? AND file_key IS NOT NULL').bind(userId).all<{ file_key: string }>();
  const keys = rows.results.map((r) => r.file_key);
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
}
