/** The admin panel's API: numbers, the users list, one user, blocking, emails and the admin log. */
import type { Env } from './env';
import { ApiError, json, readJson } from './http';
import { requireAdmin, type UserRow } from './services';

const DAY = 86_400_000;

function listUser(u: UserRow & { sessions?: number }) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    mobile: u.mobile,
    role: u.role,
    emailVerified: !!u.email_verified_at,
    emailVerifiedAt: u.email_verified_at,
    blocked: !!u.blocked_at,
    blockedAt: u.blocked_at,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    loginCount: u.login_count,
    activeSessions: u.sessions ?? 0,
  };
}

async function log(env: Env, adminId: string, action: string, targetId: string | null, targetEmail: string | null = null): Promise<void> {
  await env.DB.prepare('INSERT INTO admin_log (admin_id, action, target_id, target_email, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(adminId, action, targetId, targetEmail, Date.now())
    .run();
}

export async function stats(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(created_at >= ?) AS today,
       SUM(created_at >= ?) AS week,
       SUM(email_verified_at IS NOT NULL) AS verified,
       SUM(blocked_at IS NOT NULL) AS blocked,
       SUM(role = 'admin') AS admins,
       SUM(last_login_at >= ?) AS activeToday
     FROM users`,
  )
    .bind(now - DAY, now - 7 * DAY, now - DAY)
    .first<Record<string, number | null>>();
  const sessions = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?').bind(now).first<{ n: number }>();
  const deleted = await env.DB.prepare('SELECT COUNT(*) AS n FROM deleted_users').first<{ n: number }>();
  const daily = await env.DB.prepare(
    `SELECT CAST((created_at - ?) / ? AS INTEGER) AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day ORDER BY day`,
  )
    .bind(now - 14 * DAY, DAY, now - 14 * DAY)
    .all<{ day: number; n: number }>();
  const signupsByDay = Array.from({ length: 14 }, (_, i) => daily.results.find((d) => d.day === i)?.n ?? 0);
  return json({
    total: row?.total ?? 0,
    today: row?.today ?? 0,
    week: row?.week ?? 0,
    verified: row?.verified ?? 0,
    blocked: row?.blocked ?? 0,
    admins: row?.admins ?? 0,
    activeToday: row?.activeToday ?? 0,
    activeSessions: sessions?.n ?? 0,
    deleted: deleted?.n ?? 0,
    signupsByDay,
  });
}

const FILTERS: Record<string, string> = {
  all: '1 = 1',
  verified: 'email_verified_at IS NOT NULL',
  unverified: 'email_verified_at IS NULL',
  blocked: 'blocked_at IS NOT NULL',
  admins: "role = 'admin'",
};
const SORTS: Record<string, string> = {
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  'last-login': 'last_login_at IS NULL, last_login_at DESC',
  name: 'first_name COLLATE NOCASE, last_name COLLATE NOCASE',
};

const DELETED_SORTS: Record<string, string> = {
  newest: 'deleted_at DESC',
  oldest: 'deleted_at ASC',
  'last-login': 'last_login_at IS NULL, last_login_at DESC',
  name: 'first_name COLLATE NOCASE, last_name COLLATE NOCASE',
};

/** The record of deleted users: who, when they had signed up, when they were deleted and by whom. */
async function deletedUsers(env: Env, q: string, sortKey: string, page: number, size: number): Promise<Response> {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const where = `(? = '' OR LOWER(first_name || ' ' || last_name) LIKE ? OR email LIKE ? OR mobile LIKE ?)`;
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM deleted_users WHERE ${where}`).bind(q, like, like, like).first<{ n: number }>();
  const rows = await env.DB.prepare(
    `SELECT deleted_users.*, EXISTS (SELECT 1 FROM users WHERE users.email = deleted_users.email) AS rejoined
     FROM deleted_users WHERE ${where} ORDER BY ${DELETED_SORTS[sortKey] ?? DELETED_SORTS['newest']} LIMIT ? OFFSET ?`,
  )
    .bind(q, like, like, like, size, (page - 1) * size)
    .all<Record<string, string | number | null>>();
  return json({
    deleted: true,
    users: rows.results.map((r) => ({
      id: r['id'],
      firstName: r['first_name'],
      lastName: r['last_name'],
      email: r['email'],
      mobile: r['mobile'],
      role: r['role'],
      createdAt: r['created_at'],
      lastLoginAt: r['last_login_at'],
      loginCount: r['login_count'],
      deletedAt: r['deleted_at'],
      deletedBy: r['deleted_by'],
      rejoined: !!r['rejoined'],
    })),
    total: total?.n ?? 0,
    page,
    size,
  });
}

export async function users(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  if (url.searchParams.get('filter') === 'deleted') {
    const size = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || 20));
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    return deletedUsers(env, q, url.searchParams.get('sort') ?? 'newest', page, size);
  }
  const filter = FILTERS[url.searchParams.get('filter') ?? 'all'] ?? FILTERS['all'];
  const sort = SORTS[url.searchParams.get('sort') ?? 'newest'] ?? SORTS['newest'];
  const size = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || 20));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const where = `${filter} AND (? = '' OR LOWER(first_name || ' ' || last_name) LIKE ? OR email LIKE ? OR mobile LIKE ?)`;
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${where}`).bind(q, like, like, like).first<{ n: number }>();
  const rows = await env.DB.prepare(
    `SELECT users.*, (SELECT COUNT(*) FROM sessions WHERE sessions.user_id = users.id AND sessions.expires_at > ?) AS sessions
     FROM users WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
  )
    .bind(Date.now(), q, like, like, like, size, (page - 1) * size)
    .all<UserRow & { sessions: number }>();
  return json({ users: rows.results.map(listUser), total: total?.n ?? 0, page, size });
}

export async function user(env: Env, request: Request, id: string): Promise<Response> {
  await requireAdmin(env, request);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) throw new ApiError(404, 'This user does not exist.');
  const sessions = await env.DB.prepare('SELECT created_at, last_seen_at, expires_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC')
    .bind(id, Date.now())
    .all<{ created_at: number; last_seen_at: number; expires_at: number; user_agent: string; ip: string }>();
  const emails = await env.DB.prepare('SELECT id, subject, sent, created_at FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 20').bind(row.email).all();
  const logins = await env.DB.prepare(`SELECT ${LOGIN_COLUMNS} FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 20`).bind(id).all();
  return json({
    logins: logins.results,
    user: { ...listUser({ ...row, sessions: sessions.results.length }) },
    sessions: sessions.results.map((s) => ({ createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at, userAgent: s.user_agent, ip: s.ip })),
    emails: emails.results,
  });
}

export async function block(env: Env, request: Request, id: string): Promise<Response> {
  const admin = await requireAdmin(env, request);
  const body = await readJson<{ blocked?: boolean }>(request);
  if (id === admin.id) throw new ApiError(400, 'You cannot block your own account.');
  const target = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first<{ id: string; email: string }>();
  if (!target) throw new ApiError(404, 'This user does not exist.');
  const blocked = body.blocked === true;
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET blocked_at = ? WHERE id = ?').bind(blocked ? Date.now() : null, id),
    // A blocked user is logged out everywhere at once.
    ...(blocked ? [env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)] : []),
  ]);
  await log(env, admin.id, blocked ? 'block user' : 'unblock user', id, target.email);
  return json({ ok: true });
}

export async function logoutEverywhere(env: Env, request: Request, id: string): Promise<Response> {
  const admin = await requireAdmin(env, request);
  await readJson(request);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  const target = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<{ email: string }>();
  await log(env, admin.id, 'log out everywhere', id, target?.email ?? null);
  return json({ ok: true });
}

/**
 * Deletes a user's account: they are logged out, cannot log in, and their email is free to
 * sign up again. A copy of their details, with the date and the admin, stays in deleted_users.
 */
export async function deleteUser(env: Env, request: Request, id: string): Promise<Response> {
  const admin = await requireAdmin(env, request);
  await readJson(request);
  if (id === admin.id) throw new ApiError(400, 'You cannot delete your own account.');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!user) throw new ApiError(404, 'This user does not exist (maybe already deleted).');
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO deleted_users (id, first_name, last_name, email, mobile, role, email_verified_at, created_at, last_login_at, login_count, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(user.id, user.first_name, user.last_name, user.email, user.mobile, user.role, user.email_verified_at, user.created_at, user.last_login_at, user.login_count, now, admin.email),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM tokens WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM known_devices WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(`login:${user.email}`),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  await log(env, admin.id, 'delete user', id, user.email);
  return json({ ok: true });
}

export async function outbox(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const rows = await env.DB.prepare('SELECT id, to_email, subject, body, link, sent, created_at FROM outbox ORDER BY id DESC LIMIT 100').all();
  return json({ emails: rows.results, emailServiceOn: !!env.RESEND_API_KEY });
}

export async function adminLog(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const rows = await env.DB.prepare(
    `SELECT admin_log.id, admin_log.action, admin_log.created_at, a.email AS admin_email, COALESCE(t.email, admin_log.target_email) AS target_email
     FROM admin_log LEFT JOIN users a ON a.id = admin_log.admin_id LEFT JOIN users t ON t.id = admin_log.target_id
     ORDER BY admin_log.id DESC LIMIT 100`,
  ).all();
  return json({ entries: rows.results });
}

// ---------- visitors and logins ----------

const VISIT_COLUMNS =
  'visits.id, visits.visitor_id, visits.user_id, visits.created_at, visits.ip, visits.country, visits.region, visits.city, visits.gps_status, visits.gps_lat, visits.gps_lon, visits.gps_accuracy, visits.device_type, visits.os, visits.browser, visits.platform, visits.page, visits.referrer, visits.language, visits.timezone, visits.screen, visits.user_agent';
const LOGIN_COLUMNS =
  'id, user_id, email, success, method, reason, new_device, created_at, visitor_id, ip, country, region, city, gps_lat, gps_lon, gps_accuracy, device_type, os, browser, platform, user_agent';

function paging(url: URL) {
  const size = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || 20));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  return { size, page, q, like: `%${q.replace(/[%_]/g, '')}%` };
}

/** Every time the site was opened. Visitors who were not logged in show as "Unknown user". */
export async function visits(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const { size, page, q, like } = paging(url);
  const who = url.searchParams.get('who');
  const filter = who === 'users' ? 'visits.user_id IS NOT NULL' : who === 'unknown' ? 'visits.user_id IS NULL' : '1 = 1';
  const where = `${filter} AND (? = '' OR LOWER(COALESCE(u.email, '') || ' ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE ? OR visits.ip LIKE ? OR LOWER(COALESCE(visits.city, '')) LIKE ? OR visits.visitor_id LIKE ?)`;
  const from = 'FROM visits LEFT JOIN users u ON u.id = visits.user_id';
  const since = Date.now() - DAY;
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where}`).bind(q, like, like, like, like).first<{ n: number }>();
  const rows = await env.DB.prepare(`SELECT ${VISIT_COLUMNS}, u.email, u.first_name, u.last_name ${from} WHERE ${where} ORDER BY visits.id DESC LIMIT ? OFFSET ?`)
    .bind(q, like, like, like, like, size, (page - 1) * size)
    .all();
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors, SUM(user_id IS NOT NULL) AS loggedIn, SUM(gps_status = 'allowed') AS gps FROM visits WHERE created_at >= ?",
  )
    .bind(since)
    .first<Record<string, number | null>>();
  return json({
    visits: rows.results,
    total: total?.n ?? 0,
    page,
    size,
    today: { visits: today?.['visits'] ?? 0, visitors: today?.['visitors'] ?? 0, loggedIn: today?.['loggedIn'] ?? 0, gps: today?.['gps'] ?? 0 },
  });
}

/** Every login attempt, successful or not. */
export async function logins(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const { size, page, q, like } = paging(url);
  const result = url.searchParams.get('result');
  const filter = result === 'success' ? 'success = 1' : result === 'failed' ? 'success = 0' : result === 'new-device' ? 'new_device = 1' : '1 = 1';
  const where = `${filter} AND (? = '' OR email LIKE ? OR ip LIKE ? OR LOWER(COALESCE(city, '')) LIKE ?)`;
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM login_events WHERE ${where}`).bind(q, like, like, like).first<{ n: number }>();
  const rows = await env.DB.prepare(`SELECT ${LOGIN_COLUMNS} FROM login_events WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(q, like, like, like, size, (page - 1) * size)
    .all();
  return json({ logins: rows.results, total: total?.n ?? 0, page, size });
}
