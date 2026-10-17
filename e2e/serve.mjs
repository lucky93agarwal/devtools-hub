// Serves a build for the E2E tests:  node e2e/serve.mjs <dir> <port>
import { startServer } from './static-server.mjs';

const [dir = 'dist/devtools-hub/browser', port = '4317'] = process.argv.slice(2);
const { url } = await startServer(dir, Number(port));
console.log(`Serving ${dir} at ${url}`);
