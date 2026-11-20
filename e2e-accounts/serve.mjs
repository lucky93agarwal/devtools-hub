// Starts `wrangler dev` for the accounts tests with a fresh local database and test secrets.
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const state = '.wrangler/e2e-state';
rmSync(state, { recursive: true, force: true });
execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'migrations', 'apply', 'devtools24-accounts', '--local', '--persist-to', state], { stdio: 'inherit' });
const vars = ['ADMIN_EMAILS:admin@devtools24.test', 'APP_URL:http://localhost:8790'];
const child = spawn('npx', ['--yes', 'wrangler@4', 'dev', '--port', '8790', '--persist-to', state, ...vars.flatMap((v) => ['--var', v])], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
