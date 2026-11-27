/**
 * Message assistant (logged-in users): turns rough notes into professional English or AI prompts,
 * suggests replies, polishes templates, and keeps a profile, history and favourites.
 */
import { generate } from './ai';
import type { Env } from './env';
import { ApiError, json, readJson } from './http';
import { limit, requireUser } from './services';

const DAILY_AI_LIMIT = 60;
const MAX_INPUT = 6000;

export interface Profile {
  yourName?: string;
  managerName?: string;
  signature?: string;
  project?: string;
  urls?: string;
  team?: string;
  favoriteTemplates?: string[];
  recipients?: string[];
  repos?: string[];
  envs?: string[];
}

type Task = 'refine' | 'prompt' | 'reply' | 'polish';
type Channel = 'email' | 'chat';
type Tone = 'formal' | 'crisp' | 'polite';

const TONES: Record<Tone, string> = {
  formal: 'formal and professional',
  crisp: 'crisp and direct: short sentences, no filler',
  polite: 'warm and polite, respectful without being wordy',
};

function profileNote(p: Profile): string {
  const lines = [
    p.yourName && `The writer's name: ${p.yourName}`,
    p.managerName && `The manager / usual recipient: ${p.managerName}`,
    p.project && `Project: ${p.project}`,
    p.team && `Team: ${p.team}`,
    p.urls && `Useful links (use only if relevant): ${p.urls}`,
    p.signature && `Sign emails with exactly this signature:\n${p.signature}`,
  ].filter(Boolean);
  return lines.length ? `\n\nDetails about the writer:\n${lines.join('\n')}` : '';
}

function channelNote(channel: Channel): string {
  return channel === 'email'
    ? 'Format it as an email: first line "Subject: ...", then a greeting, a clear body in short paragraphs, and a sign-off.'
    : 'Format it as a short instant message for Slack, Teams or WhatsApp: no subject line, no formal sign-off, 2-6 lines, bullet points only if they help.';
}

/** The system prompt for each task. Exported for tests. */
export function systemPrompt(task: Task, channel: Channel, tone: Tone, profile: Profile): string {
  const base =
    'You help an Indian software professional write workplace messages. Input may be rough English, Hinglish (Hindi written in Latin letters) or Hindi. ' +
    'Always answer in clear, natural, professional English. Keep every fact, name, date, number, URL and ticket ID exactly as given. ' +
    'Do not invent facts. Do not add explanations, notes or quotation marks around the answer; output only the final text.';
  switch (task) {
    case 'refine':
      return `${base}\nRewrite the notes as a message. Tone: ${TONES[tone]}. ${channelNote(channel)}${profileNote(profile)}`;
    case 'polish':
      return `${base}\nImprove this draft message: fix grammar and flow, fill obvious gaps naturally, keep its structure and all details. Tone: ${TONES[tone]}. ${channelNote(channel)}${profileNote(profile)}`;
    case 'prompt':
      return (
        `${base}\nTurn the notes into a well-structured prompt for an AI assistant (like ChatGPT or Claude). Use these sections with short headings: ` +
        'Role, Context, Task, Requirements (bullets), Output format. Make it specific and complete, keep it concise. Output only the prompt.'
      );
    case 'reply':
      return (
        `${base}\nThe user received the message below from a manager or client. Write exactly 3 different reply options the user could send: ` +
        `1) agreeing / confirming, 2) asking a clarifying question or giving a status, 3) politely declining or proposing another time if suitable (otherwise another good option). ` +
        `Tone: ${TONES[tone]}. ${channelNote(channel)} Separate the options with a line containing only ---.${profileNote(profile)}`
      );
  }
}

async function loadProfile(env: Env, userId: string): Promise<Profile> {
  const row = await env.DB.prepare('SELECT data FROM assistant_profiles WHERE user_id = ?').bind(userId).first<{ data: string }>();
  try {
    return row ? (JSON.parse(row.data) as Profile) : {};
  } catch {
    return {};
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
/** A de-duplicated list of short strings. */
const list = (v: unknown, count: number, length: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, length)).filter(Boolean))].slice(0, count) : [];

export async function run(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ task?: string; text?: string; channel?: string; tone?: string; title?: string; kind?: string }>(request);
  const { user } = await requireUser(env, request);
  const task = (['refine', 'prompt', 'reply', 'polish'].includes(String(body.task)) ? body.task : 'refine') as Task;
  const channel = (body.channel === 'chat' ? 'chat' : 'email') as Channel;
  const tone = (['formal', 'crisp', 'polite'].includes(String(body.tone)) ? body.tone : 'polite') as Tone;
  const input = text(body.text, MAX_INPUT).trim();
  if (!input) throw new ApiError(400, 'Type or paste some text first.');
  await limit(env, `ai:${user.id}`, DAILY_AI_LIMIT, 86_400_000, `You have used today's ${DAILY_AI_LIMIT} AI requests. Please try again tomorrow.`);
  const profile = await loadProfile(env, user.id);
  const answer = await generate(env, systemPrompt(task, channel, tone, profile), input, task === 'reply' ? 1400 : 900);
  const outputs = task === 'reply' ? splitOptions(answer) : [answer];
  const title = text(body.title, 120) || input.split('\n')[0].slice(0, 80);
  const kind = task === 'polish' ? 'template' : task;
  const row = await env.DB.prepare('INSERT INTO assistant_history (user_id, kind, title, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(user.id, kind, title, input, outputs.join('\n\n---\n\n'), Date.now())
    .first<{ id: number }>();
  return json({ outputs, historyId: row?.id ?? null });
}

/** The reply options, split on "---" lines (and cleaned of "Option 1:" labels). */
export function splitOptions(answer: string): string[] {
  const parts = answer
    .split(/\n\s*-{3,}\s*\n/)
    .map((p) => p.replace(/^\s*(?:\*\*)?(?:option|reply)\s*\d+\s*[:.)-]?(?:\*\*)?\s*/i, '').trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 3) : [answer];
}

export async function getProfile(env: Env, request: Request): Promise<Response> {
  const { user } = await requireUser(env, request);
  return json({ profile: await loadProfile(env, user.id) });
}

export async function saveProfile(env: Env, request: Request): Promise<Response> {
  const body = await readJson<Profile>(request);
  const { user } = await requireUser(env, request);
  const profile: Profile = {
    yourName: text(body.yourName, 100),
    managerName: text(body.managerName, 100),
    signature: text(body.signature, 500),
    project: text(body.project, 150),
    team: text(body.team, 100),
    urls: text(body.urls, 1000),
    favoriteTemplates: list(body.favoriteTemplates, 100, 60),
    recipients: list(body.recipients, 200, 100),
    repos: list(body.repos, 200, 100),
    envs: list(body.envs, 50, 60),
  };
  await env.DB.prepare('INSERT INTO assistant_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(user.id, JSON.stringify(profile), Date.now())
    .run();
  return json({ profile });
}

/** Saves a message made without AI (a filled template), so it shows in history too. */
export async function saveHistory(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ kind?: string; title?: string; input?: string; output?: string }>(request);
  const { user } = await requireUser(env, request);
  const output = text(body.output, 20000);
  if (!output.trim()) throw new ApiError(400, 'Nothing to save.');
  await limit(env, `history:${user.id}`, 300, 86_400_000, 'Too many saves today.');
  const row = await env.DB.prepare('INSERT INTO assistant_history (user_id, kind, title, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(user.id, text(body.kind, 20) || 'template', text(body.title, 120) || 'Message', text(body.input, MAX_INPUT), output, Date.now())
    .first<{ id: number }>();
  return json({ id: row?.id ?? null });
}

export async function history(env: Env, request: Request): Promise<Response> {
  const { user } = await requireUser(env, request);
  const url = new URL(request.url);
  const fav = url.searchParams.get('favorites') === '1';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await env.DB.prepare(
    `SELECT id, kind, title, input, output, favorite, created_at FROM assistant_history
     WHERE user_id = ? AND (? = 0 OR favorite = 1) AND (? = '' OR title LIKE ? OR output LIKE ? OR input LIKE ?)
     ORDER BY id DESC LIMIT 100`,
  )
    .bind(user.id, fav ? 1 : 0, q, like, like, like)
    .all();
  return json({ items: rows.results });
}

export async function toggleFavorite(env: Env, request: Request, id: string): Promise<Response> {
  const body = await readJson<{ favorite?: boolean }>(request);
  const { user } = await requireUser(env, request);
  await env.DB.prepare('UPDATE assistant_history SET favorite = ? WHERE id = ? AND user_id = ?').bind(body.favorite ? 1 : 0, Number(id), user.id).run();
  return json({ ok: true });
}

export async function deleteHistory(env: Env, request: Request, id: string): Promise<Response> {
  await readJson(request);
  const { user } = await requireUser(env, request);
  await env.DB.prepare('DELETE FROM assistant_history WHERE id = ? AND user_id = ?').bind(Number(id), user.id).run();
  return json({ ok: true });
}
