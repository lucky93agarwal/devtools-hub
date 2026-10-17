// Small static file server for the E2E tests. It serves the production build the way
// Cloudflare does (see wrangler.jsonc): /path loads /path/index.html, a trailing slash
// is dropped, and unknown files get 404.html with a 404 status. That last part matters:
// an old tab asking for a removed chunk must get a real 404, as it does in production.
//
// The command line entry point is e2e/serve.mjs. Tests import startServer() directly
// to change the served folder while a test runs (a "deploy").
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Finds the file for a URL path inside root, or undefined. */
async function findFile(root, pathname) {
  const path = normalize(join(root, decodeURIComponent(pathname)));
  if (path !== root && !path.startsWith(root + sep)) return undefined;
  if (await isFile(path)) return path;
  const index = join(path, 'index.html');
  if (await isFile(index)) return index;
  return undefined;
}

/**
 * Starts the server. `setRoot` switches the served folder, like a deploy does.
 * @returns {Promise<{ url: string, setRoot(dir: string): void, close(): Promise<void> }>}
 */
export async function startServer(dir, port = 0) {
  let root = resolve(dir);

  const server = createServer(async (req, res) => {
    const { pathname, search } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(307, { Location: pathname.slice(0, -1) + search });
      res.end();
      return;
    }
    const file = await findFile(root, pathname);
    const status = file ? 200 : 404;
    const path = file ?? join(root, '404.html');
    try {
      const body = await readFile(path);
      res.writeHead(status, {
        'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  await new Promise((done) => server.listen(port, '127.0.0.1', done));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    setRoot: (next) => (root = resolve(next)),
    close: () => new Promise((done) => server.close(() => done())),
  };
}
