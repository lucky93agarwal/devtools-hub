/**
 * Visits and login history: every time the site is opened, and every login attempt, with
 * IP, city (from Cloudflare), GPS (when the visitor allows it) and the device. Records older
 * than 90 days are removed.
 */
import type { Env } from './env';
import { ApiError, clientIp, json, readJson } from './http';
import { currentUser, limit, sendMail, type UserRow } from './services';

export const KEEP_DAYS = 90;

// ---------- device ----------

export interface Device {
  deviceType: 'Computer' | 'Phone' | 'Tablet';
  os: string;
  browser: string;
  platform: 'Web' | 'Android' | 'iOS';
}

/** The device, system and browser from a user agent, in plain words. */
export function parseUserAgent(ua: string): Device {
  const u = ua || '';
  const isAndroid = /Android/i.test(u);
  const isIpad = /iPad/i.test(u) || (/Macintosh/i.test(u) && /Mobile\//.test(u));
  const isIphone = /iPhone|iPod/i.test(u);
  const os = isAndroid
    ? 'Android'
    : isIpad || isIphone
      ? isIpad
        ? 'iPadOS'
        : 'iOS'
      : /Windows/i.test(u)
        ? 'Windows'
        : /CrOS/i.test(u)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/i.test(u)
            ? 'macOS'
            : /Linux/i.test(u)
              ? 'Linux'
              : 'Unknown';
  const deviceType: Device['deviceType'] = isIpad || (isAndroid && !/Mobile/i.test(u)) ? 'Tablet' : isIphone || (isAndroid && /Mobile/i.test(u)) || /Mobi/i.test(u) ? 'Phone' : 'Computer';
  const browser = /Edg(e|A|iOS)?\//.test(u)
    ? 'Edge'
    : /OPR\/|Opera/.test(u)
      ? 'Opera'
      : /SamsungBrowser/.test(u)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(u)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(u)
            ? 'Chrome'
            : /Safari\//.test(u)
              ? 'Safari'
              : /curl|bot|spider|crawl/i.test(u)
                ? 'Bot / tool'
                : 'Unknown';
  // The Android app will add "DevTools24App" to its user agent.
  const platform: Device['platform'] = /DevTools24App/.test(u) && isAndroid ? 'Android' : isAndroid ? 'Android' : isIpad || isIphone ? 'iOS' : 'Web';
  return { deviceType, os, browser, platform };
}

// ---------- place ----------

interface Place {
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
}

/** Approximate place from Cloudflare's IP lookup (no permission needed). */
export function placeOf(request: Request): Place {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return { ip: clientIp(request), country: text(cf['country']), region: text(cf['region']), city: text(cf['city']) };
}

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

// ---------- visits ----------

/** Called by the site when it opens. Returns the visit id, to add GPS to it later. */
export async function recordVisit(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ visitorId?: string; page?: string; referrer?: string; language?: string; timezone?: string; screen?: string }>(request);
  const visitorId = cleanText(body.visitorId, 64);
  if (!visitorId || !/^[\w-]{8,64}$/.test(visitorId)) throw new ApiError(400, 'Missing visitor id.');
  await limit(env, `visit-ip:${clientIp(request)}`, 300, 3_600_000, 'Too many visits.');
  const found = await currentUser(env, request);
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 400);
  const device = parseUserAgent(ua);
  const place = placeOf(request);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO visits (visitor_id, user_id, created_at, ip, country, region, city, device_type, os, browser, platform, user_agent, page, referrer, language, timezone, screen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      visitorId,
      found?.user.id ?? null,
      now,
      place.ip,
      place.country,
      place.region,
      place.city,
      device.deviceType,
      device.os,
      device.browser,
      device.platform,
      ua,
      cleanText(body.page, 300),
      cleanText(body.referrer, 300),
      cleanText(body.language, 40),
      cleanText(body.timezone, 60),
      cleanText(body.screen, 20),
    )
    .first<{ id: number }>();
  // Now and then, remove records older than 90 days.
  if (Math.random() < 0.02) {
    const cutoff = now - KEEP_DAYS * 86_400_000;
    await env.DB.batch([env.DB.prepare('DELETE FROM visits WHERE created_at < ?').bind(cutoff), env.DB.prepare('DELETE FROM login_events WHERE created_at < ?').bind(cutoff)]);
  }
  return json({ visitId: row?.id ?? null });
}

/** GPS for a visit: the position, or why there is none (denied, unavailable). */
export async function recordLocation(env: Env, request: Request, id: string): Promise<Response> {
  const body = await readJson<{ visitorId?: string; status?: string; lat?: number; lon?: number; accuracy?: number }>(request);
  const status = ['allowed', 'denied', 'unavailable'].includes(String(body.status)) ? String(body.status) : 'unavailable';
  const ok = status === 'allowed' && Number.isFinite(body.lat) && Number.isFinite(body.lon) && Math.abs(body.lat!) <= 90 && Math.abs(body.lon!) <= 180;
  // Only the browser that made the visit can add its location.
  await env.DB.prepare('UPDATE visits SET gps_status = ?, gps_lat = ?, gps_lon = ?, gps_accuracy = ? WHERE id = ? AND visitor_id = ?')
    .bind(ok ? 'allowed' : status === 'allowed' ? 'unavailable' : status, ok ? body.lat : null, ok ? body.lon : null, ok && Number.isFinite(body.accuracy) ? Math.round(body.accuracy!) : null, Number(id), cleanText(body.visitorId, 64))
    .run();
  return json({ ok: true });
}

// ---------- logins ----------

export interface LoginNote {
  email: string;
  userId?: string | null;
  success: boolean;
  method: 'password' | 'signup' | 'reset';
  reason?: string;
  visitorId?: string | null;
}

/** Writes one login attempt with its place and device. Returns whether it came from a new device. */
export async function recordLogin(env: Env, request: Request, note: LoginNote, user?: UserRow): Promise<boolean> {
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 400);
  const device = parseUserAgent(ua);
  const place = placeOf(request);
  const now = Date.now();
  const visitorId = note.visitorId && /^[\w-]{8,64}$/.test(note.visitorId) ? note.visitorId : null;
  // The GPS of this browser's latest visit (within 2 hours), when the visitor allowed it.
  const gps = visitorId
    ? await env.DB.prepare("SELECT gps_lat, gps_lon, gps_accuracy FROM visits WHERE visitor_id = ? AND gps_status = 'allowed' AND created_at > ? ORDER BY id DESC LIMIT 1")
        .bind(visitorId, now - 2 * 3_600_000)
        .first<{ gps_lat: number; gps_lon: number; gps_accuracy: number }>()
    : null;
  let newDevice = false;
  if (note.success && note.userId) {
    const key = visitorId ?? `ua:${device.deviceType}/${device.os}/${device.browser}`;
    const known = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(device_key = ?) AS here FROM known_devices WHERE user_id = ?').bind(key, note.userId).first<{ n: number; here: number | null }>();
    newDevice = !known?.here;
    await env.DB.prepare('INSERT INTO known_devices (user_id, device_key, first_seen, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, device_key) DO UPDATE SET last_seen = excluded.last_seen')
      .bind(note.userId, key, now, now)
      .run();
    // Tell the user about a login from a device they have not used before (not for their very first one).
    if (newDevice && (known?.n ?? 0) > 0 && user && note.method === 'password') {
      const where = [place.city, place.region, place.country].filter(Boolean).join(', ') || 'an unknown place';
      await sendMail(env, {
        to: user.email,
        subject: 'New login to your DevTools24 account',
        text:
          `Hi ${user.first_name},\n\nYour DevTools24 account was just logged in to from a new device:\n\n` +
          `Device: ${device.browser} on ${device.os} (${device.deviceType})\nPlace: ${where} (approximate)\nIP address: ${place.ip || 'unknown'}\nTime: ${new Date(now).toUTCString()}\n\n` +
          `If this was you, you can ignore this email. If not, reset your password now and log out other devices from My account → Login activity.`,
      });
    }
  }
  await env.DB.prepare(
    `INSERT INTO login_events (user_id, email, success, method, reason, new_device, created_at, visitor_id, ip, country, region, city, gps_lat, gps_lon, gps_accuracy, device_type, os, browser, platform, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      note.userId ?? null,
      note.email.slice(0, 254),
      note.success ? 1 : 0,
      note.method,
      note.reason ?? null,
      newDevice ? 1 : 0,
      now,
      visitorId,
      place.ip,
      place.country,
      place.region,
      place.city,
      gps?.gps_lat ?? null,
      gps?.gps_lon ?? null,
      gps?.gps_accuracy ?? null,
      device.deviceType,
      device.os,
      device.browser,
      device.platform,
      ua,
    )
    .run();
  return newDevice;
}

// ---------- the user's own login activity ----------

export async function activity(env: Env, request: Request): Promise<Response> {
  const found = await currentUser(env, request);
  if (!found) throw new ApiError(401, 'Please log in.');
  const logins = await env.DB.prepare(
    'SELECT created_at, success, method, reason, new_device, ip, country, region, city, device_type, os, browser FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 20',
  )
    .bind(found.user.id)
    .all();
  const sessions = await env.DB.prepare('SELECT id, created_at, last_seen_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC')
    .bind(found.user.id, Date.now())
    .all<{ id: string; created_at: number; last_seen_at: number; user_agent: string; ip: string }>();
  return json({
    logins: logins.results,
    sessions: sessions.results.map((s) => ({ id: s.id, createdAt: s.created_at, lastSeenAt: s.last_seen_at, ip: s.ip, ...parseUserAgent(s.user_agent), current: s.id === found.sessionId })),
  });
}

/** Logs out one of the user's own other devices. */
export async function endSession(env: Env, request: Request, id: string): Promise<Response> {
  await readJson(request);
  const found = await currentUser(env, request);
  if (!found) throw new ApiError(401, 'Please log in.');
  if (id === found.sessionId) throw new ApiError(400, 'Use Log out to end this session.');
  await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(id, found.user.id).run();
  return json({ ok: true });
}
