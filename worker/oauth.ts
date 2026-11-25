/**
 * "Continue with Google / Facebook / Apple / GitHub" (OAuth 2.0 authorization code flow).
 *
 * /api/auth/oauth/:provider/start sends the browser to the provider with a random state (and a
 * PKCE code for Google) kept in a short-lived HttpOnly cookie. The provider sends it back to
 * /api/auth/oauth/:provider/callback (Apple with a POST), where the code is exchanged for the
 * person's id, name and email. The account is found by the linked provider id, then by email
 * (and linked), or created. Then the usual session cookie is set.
 */
import { cleanEmail } from '../src/app/core/accounts/validation';
import { randomToken } from './crypto';
import type { Env } from './env';
import { ApiError, getCookie, json, sessionCookie } from './http';
import { SESSION_DAYS_REMEMBER, createSession, isAdminEmail, siteUrl, type UserRow } from './services';
import { recordLogin } from './tracking';

export const PROVIDERS = ['google', 'facebook', 'apple', 'github'] as const;
export type Provider = (typeof PROVIDERS)[number];

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

/** The app id and secret for a provider, or null when its keys are not set. For Apple the secret is made fresh (a signed JWT). */
function configured(env: Env, p: Provider): boolean {
  switch (p) {
    case 'google':
      return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    case 'facebook':
      return !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
    case 'github':
      return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
    case 'apple':
      return !!(env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
  }
}

function clientId(env: Env, p: Provider): string {
  return { google: env.GOOGLE_CLIENT_ID, facebook: env.FACEBOOK_APP_ID, github: env.GITHUB_CLIENT_ID, apple: env.APPLE_SERVICES_ID }[p] ?? '';
}

async function clientSecret(env: Env, p: Provider): Promise<string> {
  if (p === 'apple') return appleClientSecret(env);
  return { google: env.GOOGLE_CLIENT_SECRET, facebook: env.FACEBOOK_APP_SECRET, github: env.GITHUB_CLIENT_SECRET }[p] ?? '';
}

/** Provider addresses. OAUTH_TEST_SERVER (local tests only) points them at a fake server. */
function endpoints(env: Env, p: Provider): { auth: string; token: string; profile: string; emails?: string } {
  const test = env.OAUTH_TEST_SERVER;
  if (test) return { auth: `${test}/${p}/auth`, token: `${test}/${p}/token`, profile: `${test}/${p}/profile`, emails: `${test}/${p}/emails` };
  switch (p) {
    case 'google':
      return { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo' };
    case 'facebook':
      return { auth: `https://www.facebook.com/${FB}/dialog/oauth`, token: `https://graph.facebook.com/${FB}/oauth/access_token`, profile: `https://graph.facebook.com/${FB}/me` };
    case 'github':
      return {
        auth: 'https://github.com/login/oauth/authorize',
        token: 'https://github.com/login/oauth/access_token',
        profile: 'https://api.github.com/user',
        emails: 'https://api.github.com/user/emails',
      };
    case 'apple':
      // Apple puts the profile in the id_token from the token call.
      return { auth: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', profile: '' };
  }
}

function provider(id: string): Provider {
  if (!(PROVIDERS as readonly string[]).includes(id)) throw new ApiError(404, 'There is no such login option.');
  return id as Provider;
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
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

function fromB64url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

// Apple comes back with a cross-site POST, which only carries SameSite=None cookies.
const stateCookie = (value: string, maxAge: number, p?: Provider) =>
  `${STATE_COOKIE}=${value}; Path=/api/auth/oauth; HttpOnly; Secure; SameSite=${p === 'apple' ? 'None' : 'Lax'}; Max-Age=${maxAge}`;
const clearState = () => stateCookie('', 0);
const loginError = (code: string) => redirect(`/login?social=${code}`, [clearState()]);

/** Which buttons the login and signup pages show. */
export async function providers(env: Env): Promise<Response> {
  return json(Object.fromEntries(PROVIDERS.map((p) => [p, configured(env, p)])));
}

export async function start(env: Env, request: Request, id: string): Promise<Response> {
  const p = provider(id);
  if (!configured(env, p)) return loginError('not-configured');
  const url = new URL(request.url);
  const state = randomToken();
  const verifier = randomToken();
  const remember = url.searchParams.get('remember') === '0' ? '0' : '1';
  const visitor = (url.searchParams.get('visitor') ?? '').replace(/[^\w-]/g, '').slice(0, 64);
  const next = safeNext(url.searchParams.get('next'));
  const params = new URLSearchParams({ client_id: clientId(env, p), redirect_uri: redirectUri(env, request, p), response_type: 'code', state });
  if (p === 'google') {
    params.set('scope', 'openid email profile');
    params.set('prompt', 'select_account');
    params.set('code_challenge', b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    params.set('code_challenge_method', 'S256');
  } else if (p === 'facebook') {
    params.set('scope', 'email,public_profile');
  } else if (p === 'github') {
    params.set('scope', 'read:user user:email');
  } else {
    params.set('scope', 'name email');
    params.set('response_mode', 'form_post');
  }
  const value = [state, verifier, p, remember, visitor, encodeURIComponent(next)].join('.');
  return redirect(`${endpoints(env, p).auth}?${params}`, [stateCookie(value, STATE_MINUTES * 60, p)]);
}

async function getToken(env: Env, request: Request, p: Provider, code: string, verifier: string): Promise<Record<string, string | undefined>> {
  const where = endpoints(env, p);
  const form = new URLSearchParams({ client_id: clientId(env, p), client_secret: await clientSecret(env, p), code, redirect_uri: redirectUri(env, request, p) });
  if (p === 'facebook') return (await fetch(`${where.token}?${form}`)).json().catch(() => ({}));
  form.set('grant_type', 'authorization_code');
  if (p === 'google') form.set('code_verifier', verifier);
  const r = await fetch(where.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form });
  return r.json().catch(() => ({}));
}

const splitName = (name: string | null | undefined) => {
  const [first, ...rest] = (name ?? '').trim().split(/\s+/);
  return { first: first ?? '', last: rest.join(' ') };
};

async function fetchProfile(env: Env, request: Request, p: Provider, code: string, verifier: string, appleUser: string | null): Promise<Profile> {
  const where = endpoints(env, p);
  const tokens = await getToken(env, request, p, code, verifier);

  if (p === 'apple') {
    // The id_token comes straight from Apple over HTTPS in answer to our signed request, so its contents can be trusted.
    const payload = JSON.parse(fromB64url((tokens['id_token'] ?? '').split('.')[1] ?? '')) as { sub?: string; email?: string; email_verified?: boolean | string; aud?: string };
    if (!payload.sub || payload.aud !== clientId(env, 'apple')) throw new Error('bad id_token');
    // Apple sends the name only the first time, in the form.
    let name = { firstName: '', lastName: '' };
    try {
      name = { ...name, ...(JSON.parse(appleUser ?? '{}') as { name?: typeof name }).name };
    } catch {
      // No name.
    }
    return {
      id: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      firstName: name.firstName ?? '',
      lastName: name.lastName ?? '',
    };
  }

  const token = tokens['access_token'];
  if (!token) throw new Error('no access token');

  if (p === 'google') {
    const g = (await (await fetch(where.profile, { headers: { authorization: `Bearer ${token}` } })).json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      given_name?: string;
      family_name?: string;
      name?: string;
    };
    if (!g.sub) throw new Error('no profile');
    const n = splitName(g.name);
    return { id: g.sub, email: g.email ?? null, emailVerified: g.email_verified === true || g.email_verified === 'true', firstName: g.given_name || n.first, lastName: g.family_name ?? n.last };
  }

  if (p === 'github') {
    const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'DevTools24' };
    const u = (await (await fetch(where.profile, { headers })).json()) as { id?: number; login?: string; name?: string | null };
    if (!u.id) throw new Error('no profile');
    // The primary, confirmed email (the public profile email may be empty or unconfirmed).
    const emails = (await (await fetch(where.emails!, { headers })).json().catch(() => [])) as { email: string; primary: boolean; verified: boolean }[];
    const best = Array.isArray(emails) ? (emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)) : undefined;
    const n = splitName(u.name || u.login);
    return { id: String(u.id), email: best?.email ?? null, emailVerified: !!best, firstName: n.first, lastName: n.last };
  }

  // Facebook: appsecret_proof proves the call comes from our server.
  const proof = await hmacHex(env.FACEBOOK_APP_SECRET ?? '', token);
  const f = (await (await fetch(`${where.profile}?${new URLSearchParams({ fields: 'id,first_name,last_name,name,email', access_token: token, appsecret_proof: proof })}`)).json()) as {
    id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
  };
  if (!f.id) throw new Error('no profile');
  const n = splitName(f.name);
  // Facebook only shares an email the person has confirmed with Facebook.
  return { id: f.id, email: f.email ?? null, emailVerified: !!f.email, firstName: f.first_name || n.first, lastName: f.last_name ?? n.last };
}

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Apple's client secret: a JWT signed (ES256) with the private key from the Apple developer account, valid 5 minutes. */
async function appleClientSecret(env: Env): Promise<string> {
  const pem = (env.APPLE_PRIVATE_KEY ?? '').replace(/-----[^-]+-----/g, '').replace(/\\n|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }));
  const body = b64urlText(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_SERVICES_ID }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(signature)}`;
}

export async function callback(env: Env, request: Request, id: string): Promise<Response> {
  const p = provider(id);
  // Apple posts a form; the others come back with the code in the address.
  const params = new URL(request.url).searchParams;
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    form?.forEach((value, key) => typeof value === 'string' && params.set(key, value));
  }
  const [state, verifier, cookieProvider, remember, visitor, nextEncoded] = (getCookie(request, STATE_COOKIE) ?? '').split('.');
  if (params.get('error')) return loginError('cancelled');
  const code = params.get('code');
  if (!state || !code || cookieProvider !== p || params.get('state') !== state || !configured(env, p)) return loginError('expired');

  let profile: Profile;
  try {
    profile = await fetchProfile(env, request, p, code, verifier, params.get('user'));
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
      // 3. A new account, with the email already confirmed by the provider.
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
