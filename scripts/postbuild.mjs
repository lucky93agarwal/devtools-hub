// Runs after `npm run build`.
// 1. Copies the client-side app shell to 404.html. The host serves it, with a 404 status,
//    for any unknown URL, and Angular's router then shows the "Page not found" page.
// 2. Writes sitemap.xml and robots.txt from the prerendered pages. Each page's canonical
//    link gives its address, so the site URL is only set in one place (app-config.ts).
//    Pages marked noindex (such as "coming soon" tools) are left out of the sitemap.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'dist/devtools-hub/browser';
copyFileSync(`${out}/index.csr.html`, `${out}/404.html`);
console.log(`Created ${out}/404.html`);

const { routes } = JSON.parse(readFileSync('dist/devtools-hub/prerendered-routes.json', 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const urls = [];
for (const route of Object.keys(routes).sort()) {
  const file = route === '/' ? `${out}/index.html` : `${out}${route}/index.html`;
  const html = readFileSync(file, 'utf8');
  if (/<meta name="robots" content="noindex"/.test(html)) continue;
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!canonical) throw new Error(`No canonical link in ${file}`);
  urls.push(canonical);
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
writeFileSync(
  `${out}/sitemap.xml`,
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => `  <url><loc>${escape(url)}</loc><lastmod>${today}</lastmod></url>\n`).join('') +
    '</urlset>\n',
);

const home = urls.find((url) => new URL(url).pathname === '/');
if (!home) throw new Error('The home page is missing from the sitemap');
writeFileSync(`${out}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', home)}\n`);
console.log(`Created sitemap.xml with ${urls.length} pages, and robots.txt`);
