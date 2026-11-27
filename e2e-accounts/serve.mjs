// Starts `wrangler dev` for the accounts tests with a fresh local database and test secrets.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createVerify, generateKeyPairSync } from 'node:crypto';

// A throwaway Apple signing key for these tests only.
const apple = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const applePem = apple.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const b64url = (text) => Buffer.from(text).toString('base64url');
/** Checks the ES256 client secret the Worker made for Apple. */
function appleSecretOk(jwt) {
  const [header, payload, signature] = (jwt ?? '').split('.');
  if (!signature) return false;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const verify = createVerify('SHA256');
  verify.update(`${header}.${payload}`);
  return claims.iss === 'TEAM123' && claims.sub === 'test.apple.services' && verify.verify({ key: apple.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
}

// A fake Google / Facebook on port 8791. Tests choose who "logs in" with POST /profile.
let profile = { id: 'g-1', email: 'gita.google@example.test', verified: true, first: 'Gita', last: 'Google' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost:8791');
  const send = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  let body = '';
  for await (const chunk of req) body += chunk;
  if (url.pathname === '/profile' && req.method === 'POST') {
    profile = JSON.parse(body);
    return send(200, { ok: true });
  }
  const [, provider, step] = url.pathname.split('/');
  if (step === 'auth' && provider === 'apple' && !profile.cancel) {
    // Apple posts the answer back with a form.
    const fields = { code: 'code-apple', state: url.searchParams.get('state'), ...(profile.first ? { user: JSON.stringify({ name: { firstName: profile.first, lastName: profile.last } }) } : {}) };
    const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value='${v.replace(/'/g, '&#39;')}'>`).join('');
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<form method="post" action="${url.searchParams.get('redirect_uri')}">${inputs}</form><script>document.forms[0].submit()</script>`);
  }
  if (step === 'auth') {
    const back = new URL(url.searchParams.get('redirect_uri'));
    if (profile.cancel) back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', `code-${provider}`);
    back.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (step === 'token' && provider === 'apple') {
    const form = new URLSearchParams(body);
    if (form.get('code') !== 'code-apple' || !appleSecretOk(form.get('client_secret'))) return send(400, { error: 'invalid_client' });
    const claims = { sub: profile.id, email: profile.email, email_verified: 'true', aud: 'test.apple.services' };
    return send(200, { id_token: `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.x` });
  }
  if (step === 'token') {
    const form = new URLSearchParams(provider === 'facebook' ? url.search : body);
    const ok = form.get('code') === `code-${provider}` && form.get('client_secret') === 'test-secret' && (provider !== 'google' || !!form.get('code_verifier'));
    return ok ? send(200, { access_token: `token-${provider}` }) : send(400, { error: 'invalid_grant' });
  }
  if (step === 'profile') {
    if (provider === 'github') return send(200, { id: Number(profile.id.replace(/\D/g, '')), login: profile.login ?? 'octo', name: profile.first ? `${profile.first} ${profile.last}` : null });
    if (provider === 'google') return send(200, { sub: profile.id, email: profile.email, email_verified: profile.verified, given_name: profile.first, family_name: profile.last });
    return send(200, { id: profile.id, first_name: profile.first, last_name: profile.last, ...(profile.email ? { email: profile.email } : {}) });
  }
  if (step === 'emails') return send(200, profile.email ? [{ email: 'old@example.test', primary: false, verified: false }, { email: profile.email, primary: true, verified: profile.verified !== false }] : []);
  send(404, {});
}).listen(8791);


const state = '.wrangler/e2e-state';
// The real config plus a local-only R2 bucket for the notes vault (no Cloudflare account needed).
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
config.r2_buckets = [{ binding: 'FILES', bucket_name: 'devtools24-files-e2e' }];
// Tests use a fake AI (AI_FAKE), so no Workers AI binding (it would need a Cloudflare login).
delete config.ai;
writeFileSync('wrangler.e2e.json', JSON.stringify(config, null, 2));
rmSync(state, { recursive: true, force: true });
execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'migrations', 'apply', 'devtools24-accounts', '--local', '--persist-to', state, '-c', 'wrangler.e2e.json'], { stdio: 'inherit' });
const vars = [
  'ADMIN_EMAILS:admin@devtools24.test',
  'APP_URL:http://localhost:8790',
  'GOOGLE_CLIENT_ID:test-google',
  'GOOGLE_CLIENT_SECRET:test-secret',
  'FACEBOOK_APP_ID:test-facebook',
  'FACEBOOK_APP_SECRET:test-secret',
  'GITHUB_CLIENT_ID:test-github',
  'GITHUB_CLIENT_SECRET:test-secret',
  'APPLE_SERVICES_ID:test.apple.services',
  'APPLE_TEAM_ID:TEAM123',
  'APPLE_KEY_ID:KEY123',
  `APPLE_PRIVATE_KEY:${applePem.replace(/\n/g, '\\n')}`,
  'OAUTH_TEST_SERVER:http://localhost:8791',
  'AI_FAKE:1',
];
const child = spawn('npx', ['--yes', 'wrangler@4', 'dev', '-c', 'wrangler.e2e.json', '--port', '8790', '--persist-to', state, ...vars.flatMap((v) => ['--var', v])], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
