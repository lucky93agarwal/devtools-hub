// Runs after `npm run build`.
// Copies the client-side app shell to 404.html. The host serves it, with a 404 status,
// for any unknown URL, and Angular's router then shows the "Page not found" page.
import { copyFileSync } from 'node:fs';

const out = 'dist/devtools-hub/browser';
copyFileSync(`${out}/index.csr.html`, `${out}/404.html`);
console.log(`Created ${out}/404.html`);
