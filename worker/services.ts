/** Email, CAPTCHA, rate limits and sessions: the building blocks the API routes use. */
import { randomToken, sha256 } from './crypto';
import type { Env } from './env';
import { ApiError, SESSION_COOKIE, clientIp, getCookie } from './http';

// ---------- email ----------

/** The address links in emails point to. */
export function siteUrl(env: Env, request: Request): string {
  return (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** The main link in the email (shown as a button in the local test outbox). */
  link?: string;
}

/**
 * Sends an email with Resend when RESEND_API_KEY is set. Every email is also kept in the
 * outbox table, so without an email service (local testing) it can be read in the admin panel.
 */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  let sent = 0;
  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM ?? 'DevTools24 <noreply@devtools24.in>', to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    sent = response.ok ? 1 : 0;
    if (!response.ok) console.error('Email was not sent', response.status, await response.text());
  } else {
    console.log(`[local email] to ${mail.to}: ${mail.subject}${mail.link ? `\n${mail.link}` : ''}`);
  }
  await env.DB.prepare('INSERT INTO outbox (to_email, subject, body, link, sent, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(mail.to, mail.subject, mail.text, mail.link ?? null, sent, Date.now())
    .run();
}

// ---------- CAPTCHA (Cloudflare Turnstile) ----------

export async function checkCaptcha(env: Env, request: Request, token: string | undefined): Promise<void> {
  // The widget covers devtools24.in only; the workers.dev backup address has no check.
  const host = new URL(request.url).hostname;
  if (!env.TURNSTILE_SECRET || !(host === 'devtools24.in' || host.endsWith('.devtools24.in'))) return;
  if (!token) throw new ApiError(400, 'Please complete the check that you are not a robot.');
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  const ip = clientIp(request);
  if (ip) body.append('remoteip', ip);
  const result = (await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })).json()) as { success: boolean };
  if (!result.success) throw new ApiError(400, 'The robot check failed. Please try it again.');
}

// ---------- rate limits ----------

/**
 * Counts an attempt under `key` and refuses once there were `max` in `windowMs`.
 * Returns how many attempts are left.
 */
export async function limit(env: Env, key: string, max: number, windowMs: number, message: string): Promise<number> {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE key = ?').bind(key).first<{ count: number; reset_at: number }>();
  const fresh = !row || row.reset_at <= now;
  const count = fresh ? 1 : row.count + 1;
  const resetAt = fresh ? now + windowMs : row.reset_at;
  if (!fresh && row.count >= max) {
    const minutes = Math.max(1, Math.ceil((row.reset_at - now) / 60_000));
    throw new ApiError(429, `${message} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
  await env.DB.prepare('INSERT INTO attempts (key, count, reset_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at')
    .bind(key, count, resetAt)
    .run();
  return max - count;
}

export async function clearLimit(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(key).run();
}

/** Whether `key` is over its limit, without counting a new attempt. */
export async function isLimited(env: Env, key: string, max: number): Promise<number> {
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE key = ?').bind(key).first<{ count: number; reset_at: number }>();
  return row && row.reset_at > Date.now() && row.count >= max ? row.reset_at : 0;
}

// ---------- sessions and users ----------

export interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  password_hash: string;
  role: 'user' | 'admin';
  email_verified_at: number | null;
  blocked_at: number | null;
  created_at: number;
  last_login_at: number | null;
  login_count: number;
  signup_method?: string;
  last_login_method?: string | null;
}

/** What the website may know about the signed-in user. */
export function publicUser(user: UserRow) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    emailVerified: !!user.email_verified_at,
    createdAt: user.created_at,
    hasPassword: !!user.password_hash,
    signupMethod: user.signup_method ?? 'password',
  };
}

export const SESSION_DAYS_REMEMBER = 30;
export const SESSION_DAYS_DEFAULT = 1;

/** Creates a session and returns the cookie value. */
export async function createSession(env: Env, request: Request, userId: string, remember: boolean, visitorId?: string | null): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_DEFAULT;
  const visitor = visitorId && /^[\w-]{8,64}$/.test(visitorId) ? visitorId : null;
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip, visitor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + days * 86_400_000, now, (request.headers.get('user-agent') ?? '').slice(0, 400), clientIp(request), visitor)
    .run();
  return token;
}

/** The signed-in user, or null. Expired sessions and blocked users count as signed out. */
export async function currentUser(env: Env, request: Request): Promise<{ user: UserRow; sessionId: string } | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionId = await sha256(token);
  const row = await env.DB.prepare(
    'SELECT users.*, sessions.expires_at AS session_expires, sessions.last_seen_at AS session_seen FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?',
  )
    .bind(sessionId)
    .first<UserRow & { session_expires: number; session_seen: number }>();
  const now = Date.now();
  if (!row || row.session_expires <= now || row.blocked_at) {
    if (row) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }
  // Note activity at most once every 5 minutes, to keep writes low.
  if (now - row.session_seen > 300_000) await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, sessionId).run();
  return { user: row, sessionId };
}

export async function requireUser(env: Env, request: Request): Promise<{ user: UserRow; sessionId: string }> {
  const found = await currentUser(env, request);
  if (!found) throw new ApiError(401, 'Please log in.');
  return found;
}

export async function requireAdmin(env: Env, request: Request): Promise<UserRow> {
  const { user } = await requireUser(env, request);
  if (user.role !== 'admin') throw new ApiError(403, 'Only admins can open this.');
  return user;
}

/** Emails listed in ADMIN_EMAILS become admins. */
export function isAdminEmail(env: Env, email: string): boolean {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

// ---------- one-time email links ----------

export const VERIFY_HOURS = 24;
export const RESET_MINUTES = 30;

export async function createToken(env: Env, userId: string, purpose: 'verify' | 'reset', lifetimeMs: number): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  // Older links of the same kind stop working.
  await env.DB.prepare('UPDATE tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').bind(now, userId, purpose).run();
  await env.DB.prepare('INSERT INTO tokens (id, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, purpose, now, now + lifetimeMs)
    .run();
  return token;
}

/** Uses a link once. Returns the user id, or throws a friendly error. */
export async function useToken(env: Env, token: string | undefined, purpose: 'verify' | 'reset'): Promise<string> {
  const what = purpose === 'verify' ? 'verification link' : 'reset link';
  if (!token) throw new ApiError(400, `This ${what} is not complete. Open the link from the email again.`);
  const id = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id, expires_at, used_at FROM tokens WHERE id = ? AND purpose = ?').bind(id, purpose).first<{ user_id: string; expires_at: number; used_at: number | null }>();
  if (!row) throw new ApiError(400, `This ${what} is not valid. Ask for a new one.`);
  if (row.used_at) throw new ApiError(400, `This ${what} was already used. Ask for a new one if you need it.`);
  if (row.expires_at <= Date.now()) throw new ApiError(400, `This ${what} has expired. Ask for a new one.`);
  await env.DB.prepare('UPDATE tokens SET used_at = ? WHERE id = ?').bind(Date.now(), id).run();
  return row.user_id;
}
