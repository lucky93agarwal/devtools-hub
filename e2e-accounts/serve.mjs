// Starts `wrangler dev` for the accounts tests with a fresh local database and test secrets.
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:http';

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
  if (step === 'auth') {
    const back = new URL(url.searchParams.get('redirect_uri'));
    if (profile.cancel) back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', `code-${provider}`);
    back.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (step === 'token') {
    const form = new URLSearchParams(provider === 'google' ? body : url.search);
    const ok = form.get('code') === `code-${provider}` && form.get('client_secret') === 'test-secret' && (provider !== 'google' || !!form.get('code_verifier'));
    return ok ? send(200, { access_token: `token-${provider}` }) : send(400, { error: 'invalid_grant' });
  }
  if (step === 'profile') {
    if (provider === 'google') return send(200, { sub: profile.id, email: profile.email, email_verified: profile.verified, given_name: profile.first, family_name: profile.last });
    return send(200, { id: profile.id, first_name: profile.first, last_name: profile.last, ...(profile.email ? { email: profile.email } : {}) });
  }
  send(404, {});
}).listen(8791);


const state = '.wrangler/e2e-state';
rmSync(state, { recursive: true, force: true });
execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'migrations', 'apply', 'devtools24-accounts', '--local', '--persist-to', state], { stdio: 'inherit' });
const vars = [
  'ADMIN_EMAILS:admin@devtools24.test',
  'APP_URL:http://localhost:8790',
  'GOOGLE_CLIENT_ID:test-google',
  'GOOGLE_CLIENT_SECRET:test-secret',
  'FACEBOOK_APP_ID:test-facebook',
  'FACEBOOK_APP_SECRET:test-secret',
  'OAUTH_TEST_SERVER:http://localhost:8791',
];
const child = spawn('npx', ['--yes', 'wrangler@4', 'dev', '--port', '8790', '--persist-to', state, ...vars.flatMap((v) => ['--var', v])], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
