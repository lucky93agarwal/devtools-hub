// Runs after `npm run build`.
// 1. Copies the client-side app shell to 404.html. The host serves it, with a 404 status,
//    for any unknown URL, and Angular's router then shows the "Page not found" page.
// 2. Writes sitemap.xml and robots.txt from the prerendered pages. Each page's canonical
//    link gives its address, so the site URL is only set in one place (app-config.ts).
//    Pages marked noindex (such as "coming soon" tools) are left out of the sitemap.
// 3. Publishes the licences of the libraries in the site at /third-party-licenses.txt.
// 4. Writes ads.txt when an AdSense publisher ID is set in app-config.ts.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'dist/devtools-hub/browser';
const { routes } = JSON.parse(readFileSync('dist/devtools-hub/prerendered-routes.json', 'utf8'));
const pageFile = (route) => (route === '/' ? `${out}/index.html` : `${out}${route}/index.html`);
// Old addresses are prerendered as tiny redirect pages; they get no stylesheet and stay out of the sitemap.
const isRedirect = (html) => /<meta http-equiv="refresh"/.test(html);

// Put the whole stylesheet (about 5 KB gzipped) inside each page. The first paint then
// needs no second request, and nothing moves later as it would with partial critical CSS.
// Font URLs in it are relative and resolve against <base href="/">.
for (const file of [...Object.keys(routes).map(pageFile), `${out}/index.csr.html`]) {
  const html = readFileSync(file, 'utf8');
  if (isRedirect(html)) continue;
  const link = /<link rel="stylesheet" href="(styles-[\w-]+\.css)">/.exec(html);
  if (!link) throw new Error(`No stylesheet link in ${file}`);
  const css = readFileSync(`${out}/${link[1]}`, 'utf8');
  writeFileSync(file, html.replace(link[0], () => `<style>${css}</style>`));
}
console.log(`Inlined the stylesheet into ${Object.keys(routes).length + 1} pages`);

copyFileSync(`${out}/index.csr.html`, `${out}/404.html`);
console.log(`Created ${out}/404.html`);

// Angular collects the licences of bundled packages; add the files copied as they are.
const bundled = readFileSync('dist/devtools-hub/3rdpartylicenses.txt', 'utf8');
const copied = readFileSync('scripts/licenses-extra.txt', 'utf8');
writeFileSync(`${out}/third-party-licenses.txt`, `${bundled}\n${copied}`);
console.log(`Created ${out}/third-party-licenses.txt`);

// Same rule as adsEnabled() in src/app/core/ads.ts.
const client = /adsenseClient:\s*'(ca-pub-\d{10,20})'/.exec(readFileSync('src/app/core/app-config.ts', 'utf8'))?.[1];
if (client) {
  writeFileSync(`${out}/ads.txt`, `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  console.log(`Created ${out}/ads.txt for ${client}`);
}

const today = new Date().toISOString().slice(0, 10);
const urls = [];
for (const route of Object.keys(routes).sort()) {
  const file = pageFile(route);
  const html = readFileSync(file, 'utf8');
  if (isRedirect(html) || /<meta name="robots" content="noindex"/.test(html)) continue;
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
