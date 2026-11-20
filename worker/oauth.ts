/**
 * "Continue with Google" and "Continue with Facebook" (OAuth 2.0 authorization code flow).
 *
 * /api/auth/oauth/:provider/start sends the browser to Google / Facebook with a random state
 * (and a PKCE code for Google) kept in a short-lived HttpOnly cookie. Google / Facebook send it
 * back to /api/auth/oauth/:provider/callback, where the code is exchanged for the person's
 * name and email. The account is found by the linked Google / Facebook id, then by email (and
 * linked), or created. Then the usual session cookie is set.
 */
import { cleanEmail } from '../src/app/core/accounts/validation';
import { randomToken } from './crypto';
import type { Env } from './env';
import { ApiError, getCookie, json, sessionCookie } from './http';
import { SESSION_DAYS_REMEMBER, createSession, isAdminEmail, siteUrl, type UserRow } from './services';
import { recordLogin } from './tracking';

export type Provider = 'google' | 'facebook';

const STATE_COOKIE = 'dt_oauth';
const STATE_MINUTES = 10;
const FB = 'v21.0';

interface Profile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

function credentials(env: Env, provider: Provider): { id: string; secret: string } | null {
  const id = provider === 'google' ? env.GOOGLE_CLIENT_ID : env.FACEBOOK_APP_ID;
  const secret = provider === 'google' ? env.GOOGLE_CLIENT_SECRET : env.FACEBOOK_APP_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Provider addresses. OAUTH_TEST_SERVER (local tests only) points them at a fake server. */
function endpoints(env: Env, provider: Provider) {
  const test = env.OAUTH_TEST_SERVER;
  if (test) return { auth: `${test}/${provider}/auth`, token: `${test}/${provider}/token`, profile: `${test}/${provider}/profile` };
  return provider === 'google'
    ? { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo' }
    : { auth: `https://www.facebook.com/${FB}/dialog/oauth`, token: `https://graph.facebook.com/${FB}/oauth/access_token`, profile: `https://graph.facebook.com/${FB}/me` };
}

function provider(id: string): Provider {
  if (id !== 'google' && id !== 'facebook') throw new ApiError(404, 'There is no such login option.');
  return id;
}

const redirectUri = (env: Env, request: Request, p: Provider) => `${siteUrl(env, request)}/api/auth/oauth/${p}/callback`;

/** Only paths on this site, never another site or the API. */
function safeNext(next: string | null): string {
  return next && /^\/(?!\/|\\|api\/)[\w\-./?=&%]*$/.test(next) ? next : '/account';
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

const clearState = () => `${STATE_COOKIE}=; Path=/api/auth/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const loginError = (code: string) => redirect(`/login?social=${code}`, [clearState()]);

/** Which buttons the login and signup pages show. */
export async function providers(env: Env): Promise<Response> {
  return json({ google: !!credentials(env, 'google'), facebook: !!credentials(env, 'facebook') });
}

export async function start(env: Env, request: Request, id: string): Promise<Response> {
  const p = provider(id);
  const keys = credentials(env, p);
  if (!keys) return loginError('not-configured');
  const url = new URL(request.url);
  const state = randomToken();
  const verifier = randomToken();
  const remember = url.searchParams.get('remember') === '0' ? '0' : '1';
  const visitor = (url.searchParams.get('visitor') ?? '').replace(/[^\w-]/g, '').slice(0, 64);
  const next = safeNext(url.searchParams.get('next'));
  const params = new URLSearchParams({ client_id: keys.id, redirect_uri: redirectUri(env, request, p), response_type: 'code', state });
  if (p === 'google') {
    params.set('scope', 'openid email profile');
    params.set('prompt', 'select_account');
    params.set('code_challenge', b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    params.set('code_challenge_method', 'S256');
  } else {
    params.set('scope', 'email,public_profile');
  }
  const value = [state, verifier, p, remember, visitor, encodeURIComponent(next)].join('.');
  const cookie = `${STATE_COOKIE}=${value}; Path=/api/auth/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_MINUTES * 60}`;
  return redirect(`${endpoints(env, p).auth}?${params}`, [cookie]);
}

async function fetchProfile(env: Env, request: Request, p: Provider, code: string, verifier: string): Promise<Profile> {
  const keys = credentials(env, p)!;
  const where = endpoints(env, p);
  const form = new URLSearchParams({ client_id: keys.id, client_secret: keys.secret, code, redirect_uri: redirectUri(env, request, p) });
  let token: string | undefined;
  if (p === 'google') {
    form.set('grant_type', 'authorization_code');
    form.set('code_verifier', verifier);
    const r = await fetch(where.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    token = ((await r.json().catch(() => ({}))) as { access_token?: string }).access_token;
  } else {
    const r = await fetch(`${where.token}?${form}`);
    token = ((await r.json().catch(() => ({}))) as { access_token?: string }).access_token;
  }
  if (!token) throw new Error('no access token');
  if (p === 'google') {
    const r = await fetch(where.profile, { headers: { authorization: `Bearer ${token}` } });
    const g = (await r.json()) as { sub?: string; email?: string; email_verified?: boolean | string; given_name?: string; family_name?: string; name?: string };
    if (!g.sub) throw new Error('no profile');
    const [first, ...rest] = (g.name ?? '').split(' ');
    return {
      id: g.sub,
      email: g.email ?? null,
      emailVerified: g.email_verified === true || g.email_verified === 'true',
      firstName: g.given_name || first || '',
      lastName: g.family_name ?? rest.join(' '),
    };
  }
  // Facebook: appsecret_proof proves the call comes from our server.
  const proof = await hmacHex(keys.secret, token);
  const r = await fetch(`${where.profile}?${new URLSearchParams({ fields: 'id,first_name,last_name,name,email', access_token: token, appsecret_proof: proof })}`);
  const f = (await r.json()) as { id?: string; email?: string; first_name?: string; last_name?: string; name?: string };
  if (!f.id) throw new Error('no profile');
  const [first, ...rest] = (f.name ?? '').split(' ');
  // Facebook only shares an email the person has confirmed with Facebook.
  return { id: f.id, email: f.email ?? null, emailVerified: !!f.email, firstName: f.first_name || first || '', lastName: f.last_name ?? rest.join(' ') };
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function callback(env: Env, request: Request, id: string): Promise<Response> {
  const p = provider(id);
  const url = new URL(request.url);
  const [state, verifier, cookieProvider, remember, visitor, nextEncoded] = (getCookie(request, STATE_COOKIE) ?? '').split('.');
  if (url.searchParams.get('error')) return loginError('cancelled');
  const code = url.searchParams.get('code');
  if (!state || !code || cookieProvider !== p || url.searchParams.get('state') !== state || !credentials(env, p)) return loginError('expired');

  let profile: Profile;
  try {
    profile = await fetchProfile(env, request, p, code, verifier);
  } catch (e) {
    console.error('oauth', p, e);
    return loginError('failed');
  }
  const visitorId = visitor || null;
  const now = Date.now();
  const email = profile.email ? cleanEmail(profile.email) : null;

  // 1. Already linked.
  let user = await env.DB.prepare('SELECT users.* FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id WHERE provider = ? AND provider_user_id = ?')
    .bind(p, profile.id)
    .first<UserRow>();
  let created = false;
  if (!user) {
    if (!email) return loginError('no-email');
    if (!profile.emailVerified) return loginError('unverified');
    // 2. An account with the same (confirmed) email: link it.
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
    if (!user) {
      // 3. A new account, with the email already confirmed by Google / Facebook.
      const newId = crypto.randomUUID();
      const local = email.split('@')[0];
      await env.DB.prepare(
        `INSERT INTO users (id, first_name, last_name, email, mobile, password_hash, role, email_verified_at, created_at, login_count, signup_method)
         VALUES (?, ?, ?, ?, '', '', ?, ?, ?, 0, ?)`,
      )
        .bind(newId, (profile.firstName || local).slice(0, 50), profile.lastName.slice(0, 50), email, isAdminEmail(env, email) ? 'admin' : 'user', now, now, p)
        .run();
      user = (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(newId).first<UserRow>())!;
      created = true;
    }
    await env.DB.prepare('INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(p, profile.id, user.id, email, now)
      .run();
  }

  if (user.blocked_at) {
    await recordLogin(env, request, { email: user.email, userId: user.id, success: false, method: p, reason: 'blocked', visitorId });
    return loginError('blocked');
  }
  const role = user.role === 'admin' || isAdminEmail(env, user.email) ? 'admin' : 'user';
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET last_login_at = ?, login_count = login_count + 1, role = ?, last_login_method = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?',
    ).bind(now, role, p, profile.emailVerified ? now : null, user.id),
    env.DB.prepare('UPDATE oauth_accounts SET last_used_at = ? WHERE provider = ? AND provider_user_id = ?').bind(now, p, profile.id),
  ]);
  const keep = remember !== '0';
  const token = await createSession(env, request, user.id, keep, visitorId);
  await recordLogin(env, request, { email: user.email, userId: user.id, success: true, method: p, reason: created ? 'new-account' : undefined, visitorId }, user);
  const next = created ? '/account?welcome=1' : safeNext(decodeURIComponent(nextEncoded ?? ''));
  return redirect(next, [sessionCookie(token, keep ? SESSION_DAYS_REMEMBER * 86_400 : undefined), clearState()]);
}

