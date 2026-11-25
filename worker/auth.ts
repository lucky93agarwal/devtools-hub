/** Sign up, log in, log out, email verification, forgot / reset / change password. */
import { cleanEmail, emailError, fullMobile, passwordError, signupErrors, type SignupInput } from '../src/app/core/accounts/validation';
import { DUMMY_HASH, hashPassword, verifyPassword } from './crypto';
import type { Env } from './env';
import { ApiError, clearSessionCookie, clientIp, json, readJson, sessionCookie } from './http';
import {
  RESET_MINUTES,
  SESSION_DAYS_DEFAULT,
  SESSION_DAYS_REMEMBER,
  VERIFY_HOURS,
  checkCaptcha,
  clearLimit,
  createSession,
  createToken,
  currentUser,
  isAdminEmail,
  isLimited,
  limit,
  publicUser,
  requireUser,
  sendMail,
  siteUrl,
  useToken,
  type UserRow,
} from './services';
import { recordLogin } from './tracking';

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60_000;

const sessionHeaders = (token: string, remember: boolean) => ({
  'set-cookie': sessionCookie(token, remember ? SESSION_DAYS_REMEMBER * 86_400 : undefined),
});

async function sendVerification(env: Env, request: Request, user: Pick<UserRow, 'id' | 'email' | 'first_name'>): Promise<void> {
  const token = await createToken(env, user.id, 'verify', VERIFY_HOURS * 3_600_000);
  const link = `${siteUrl(env, request)}/verify-email?token=${token}`;
  await sendMail(env, {
    to: user.email,
    subject: 'Confirm your email for DevTools24',
    text: `Hi ${user.first_name},\n\nPlease confirm your email address by opening this link:\n${link}\n\nThe link works for ${VERIFY_HOURS} hours. If you did not create a DevTools24 account, you can ignore this email.`,
    link,
  });
}

export async function signup(env: Env, request: Request): Promise<Response> {
  const body = await readJson<SignupInput & { remember?: boolean; captcha?: string; visitorId?: string }>(request);
  await limit(env, `signup-ip:${clientIp(request)}`, 10, 3_600_000, 'Too many new accounts from this network.');
  await checkCaptcha(env, request, body.captcha);
  const input: SignupInput = {
    firstName: String(body.firstName ?? ''),
    lastName: String(body.lastName ?? ''),
    email: String(body.email ?? ''),
    countryCode: String(body.countryCode ?? ''),
    mobile: String(body.mobile ?? ''),
    password: String(body.password ?? ''),
    acceptTerms: body.acceptTerms === true,
  };
  const errors = signupErrors(input);
  if (Object.keys(errors).length) throw new ApiError(400, 'Please check the highlighted fields.', errors as Record<string, string>);
  const email = cleanEmail(input.email);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    throw new ApiError(409, 'An account with this email already exists.', { email: 'An account with this email already exists. Log in, or reset your password.' });
  }
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email,
    mobile: fullMobile(input.countryCode, input.mobile),
    role: isAdminEmail(env, email) ? 'admin' : 'user',
  };
  await env.DB.prepare(
    'INSERT INTO users (id, first_name, last_name, email, mobile, password_hash, role, created_at, last_login_at, login_count, last_login_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, \'password\')',
  )
    .bind(user.id, user.first_name, user.last_name, user.email, user.mobile, await hashPassword(input.password), user.role, now, now)
    .run();
  await sendVerification(env, request, user);
  const remember = body.remember !== false;
  const token = await createSession(env, request, user.id, remember, body.visitorId);
  const row = (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>())!;
  await recordLogin(env, request, { email, userId: user.id, success: true, method: 'signup', visitorId: body.visitorId }, row);
  return json({ user: publicUser(row) }, 201, sessionHeaders(token, remember));
}

export async function login(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; remember?: boolean; captcha?: string; visitorId?: string }>(request);
  const email = cleanEmail(String(body.email ?? ''));
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId : null;
  const failed = (reason: string, userId?: string) => recordLogin(env, request, { email, userId, success: false, method: 'password', reason, visitorId });
  await limit(env, `login-ip:${clientIp(request)}`, 40, LOGIN_LOCK_MS, 'Too many login attempts from this network.');
  try {
    await checkCaptcha(env, request, body.captcha);
  } catch (e) {
    if (email) await failed('captcha');
    throw e;
  }
  const password = String(body.password ?? '');
  if (emailError(email) || !password) throw new ApiError(400, 'Enter your email and password.');
  const key = `login:${email}`;
  const lockedUntil = await isLimited(env, key, MAX_LOGIN_FAILURES);
  if (lockedUntil) {
    await failed('paused');
    const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
    throw new ApiError(429, `Too many wrong passwords. For your safety this account is paused for ${minutes} minute${minutes === 1 ? '' : 's'}. You can reset your password instead.`);
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (user && !user.password_hash) {
    // Created with Google / Facebook and no password set yet.
    await failed('no-password', user.id);
    throw new ApiError(401, 'This account logs in with Google, Facebook, Apple or GitHub. Use that button above, or set a password with "Forgot password?".');
  }
  if (!user || !ok) {
    await failed(user ? 'wrong-password' : 'no-account', user?.id);
    const left = await limit(env, key, MAX_LOGIN_FAILURES, LOGIN_LOCK_MS, 'Too many wrong passwords.');
    throw new ApiError(401, left <= 2 && left > 0 ? `Email or password is wrong. ${left} more tr${left === 1 ? 'y' : 'ies'} before a 15-minute pause.` : 'Email or password is wrong.');
  }
  if (user.blocked_at) {
    await failed('blocked', user.id);
    throw new ApiError(403, 'This account is blocked. Please contact support.');
  }
  await clearLimit(env, key);
  const now = Date.now();
  const role = user.role === 'admin' || isAdminEmail(env, email) ? 'admin' : 'user';
  await env.DB.prepare('UPDATE users SET last_login_at = ?, login_count = login_count + 1, role = ?, last_login_method = ? WHERE id = ?').bind(now, role, 'password', user.id).run();
  const remember = body.remember === true;
  const token = await createSession(env, request, user.id, remember, visitorId);
  await recordLogin(env, request, { email, userId: user.id, success: true, method: 'password', visitorId }, user);
  return json({ user: publicUser({ ...user, role, last_login_at: now }) }, 200, sessionHeaders(token, remember));
}

export async function logout(env: Env, request: Request): Promise<Response> {
  const found = await currentUser(env, request);
  if (found) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(found.sessionId).run();
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

export async function me(env: Env, request: Request): Promise<Response> {
  const found = await currentUser(env, request);
  return json({ user: found ? publicUser(found.user) : null });
}

export async function verifyEmail(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ token?: string }>(request);
  const userId = await useToken(env, body.token, 'verify');
  await env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(Date.now(), userId).run();
  return json({ ok: true });
}

export async function resendVerification(env: Env, request: Request): Promise<Response> {
  await readJson(request);
  const { user } = await requireUser(env, request);
  if (user.email_verified_at) return json({ ok: true, alreadyVerified: true });
  await limit(env, `verify:${user.id}`, 3, 3_600_000, 'We already sent a few emails.');
  await sendVerification(env, request, user);
  return json({ ok: true });
}

/** Always answers the same way, so nobody can find out which emails have accounts. */
export async function forgotPassword(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ email?: string; captcha?: string }>(request);
  await limit(env, `forgot-ip:${clientIp(request)}`, 10, 3_600_000, 'Too many reset requests from this network.');
  await checkCaptcha(env, request, body.captcha);
  const email = cleanEmail(String(body.email ?? ''));
  const problem = emailError(email);
  if (problem) throw new ApiError(400, problem, { email: problem });
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (user && !user.blocked_at) {
    try {
      await limit(env, `forgot:${email}`, 3, 3_600_000, '');
      const token = await createToken(env, user.id, 'reset', RESET_MINUTES * 60_000);
      const link = `${siteUrl(env, request)}/reset-password?token=${token}`;
      await sendMail(env, {
        to: user.email,
        subject: 'Reset your DevTools24 password',
        text: `Hi ${user.first_name},\n\nSomeone asked to reset the password of your DevTools24 account. To choose a new password, open this link:\n${link}\n\nThe link works for ${RESET_MINUTES} minutes and only once. If it was not you, ignore this email: your password stays the same.`,
        link,
      });
    } catch (e) {
      // Over the limit for this email: stay silent, as for unknown emails.
      if (!(e instanceof ApiError && e.status === 429)) throw e;
    }
  }
  return json({ ok: true });
}

export async function resetPassword(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ token?: string; password?: string; visitorId?: string }>(request);
  const password = String(body.password ?? '');
  const problem = passwordError(password);
  if (problem) throw new ApiError(400, problem, { password: problem });
  const userId = await useToken(env, body.token, 'reset');
  const user = (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>())!;
  const now = Date.now();
  // Opening the email proves the address, and every other device is logged out.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(await hashPassword(password), now, userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ]);
  await clearLimit(env, `login:${user.email}`);
  await recordLogin(env, request, { email: user.email, userId, success: true, method: 'reset', visitorId: body.visitorId });
  await sendMail(env, {
    to: user.email,
    subject: 'Your DevTools24 password was changed',
    text: `Hi ${user.first_name},\n\nThe password of your DevTools24 account was just changed, and you were logged out everywhere. If this was not you, reset your password now and contact support.`,
  });
  return json({ ok: true });
}

export async function changePassword(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
  const { user, sessionId } = await requireUser(env, request);
  await limit(env, `change:${user.id}`, 5, LOGIN_LOCK_MS, 'Too many tries.');
  if (!(await verifyPassword(String(body.currentPassword ?? ''), user.password_hash))) throw new ApiError(400, 'Your current password is wrong.', { currentPassword: 'Your current password is wrong.' });
  const next = String(body.newPassword ?? '');
  const problem = passwordError(next);
  if (problem) throw new ApiError(400, problem, { newPassword: problem });
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id),
    // Other devices are logged out; this one stays.
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, sessionId),
  ]);
  await clearLimit(env, `change:${user.id}`);
  await sendMail(env, {
    to: user.email,
    subject: 'Your DevTools24 password was changed',
    text: `Hi ${user.first_name},\n\nThe password of your DevTools24 account was just changed, and other devices were logged out. If this was not you, reset your password now.`,
  });
  return json({ ok: true });
}

export { SESSION_DAYS_DEFAULT };
