// Draws the share cards (public/og/*.jpg, 1200x630), the home screen icons
// (public/icons/*.png) and the browser tab icon (public/favicon.ico) with the Chromium that Playwright already installs.
// Run after adding a tool or changing a tool's name: `node scripts/make-images.mjs`.
// The images are committed, so the normal build does not need a browser.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Embedded as data URLs: a page made with setContent may not load file:// fonts.
const font = (file) =>
  `url("data:font/woff2;base64,${readFileSync(resolve('node_modules', file)).toString('base64')}") format("woff2")`;
const FONTS = `
  @font-face { font-family: Poppins; font-weight: 700; src: ${font('@fontsource/poppins/files/poppins-latin-700-normal.woff2')}; }
  @font-face { font-family: Inter; font-weight: 100 900; src: ${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}; }
  @font-face { font-family: Mono; font-weight: 100 900; src: ${font('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2')}; }
`;
const BRAND = '#4f46e5';

/** Tools from src/app/core/tools.ts: each entry's path, name and description. */
function readTools() {
  const source = readFileSync('src/app/core/tools.ts', 'utf8');
  const tools = [];
  for (const match of source.matchAll(/path: '([^']+)',\s*name: '([^']+)',\s*description:\s*'([^']+)'/g)) {
    tools.push({ path: match[1], name: match[2], description: match[3] });
  }
  return tools;
}

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Tiny tab icons get bigger braces so they stay readable at 16 px.
const logo = (size, glyph = 0.42, weight = 700) => `
  <div style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px;background:${BRAND};display:grid;place-items:center;
    color:#fff;font-family:Mono;font-weight:${weight};font-size:${size * glyph}px;letter-spacing:-0.06em">{}</div>`;

/** An .ico holding one PNG per size, which every current browser reads. */
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((png) => png.data)]);
}

function card(title, description) {
  return `<!doctype html><html><head><style>${FONTS}
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; overflow: hidden; color: #f8fafc; font-family: Inter;
      background: radial-gradient(circle at 85% 15%, #312e81 0, transparent 45%), #0b1220;
      padding: 72px 80px; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 20px; font: 700 34px Poppins; }
    h1 { margin-top: auto; font: 700 ${title.length > 28 ? 66 : 78}px/1.1 Poppins; letter-spacing: -0.02em; max-width: 1000px; }
    p { margin-top: 24px; font-size: 32px; line-height: 1.35; color: #cbd5e1; max-width: 980px; }
    footer { margin-top: 44px; display: flex; gap: 14px; }
    footer span { border: 2px solid #334155; border-radius: 999px; padding: 10px 22px; font-size: 24px; font-weight: 600; color: #e2e8f0; }
  </style></head><body>
    <div class="brand">${logo(64)}DevTools Hub</div>
    <h1>${escape(title)}</h1>
    <p>${escape(description)}</p>
    <footer><span>Free</span><span>Runs in your browser</span><span>Nothing is uploaded</span></footer>
  </body></html>`;
}

function icon(size, rounded) {
  return `<!doctype html><html><head><style>${FONTS} * { margin: 0 } body { width: ${size}px; height: ${size}px; }</style></head>
    <body>${rounded ? logo(size) : logo(size).replace(/border-radius:[^;]+;/, '')}</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
mkdirSync('public/og', { recursive: true });
mkdirSync('public/icons', { recursive: true });

const cards = [
  { file: 'default', title: 'Free developer tools that stay on your device', description: 'Format JSON, turn it into code, convert data and images, decode tokens and make app icons.' },
  ...readTools().map((tool) => ({ file: tool.path, title: tool.name, description: tool.description })),
];
for (const { file, title, description } of cards) {
  await page.setContent(card(title, description));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/og/${file}.jpg`, type: 'jpeg', quality: 85 });
}

// iOS rounds the corners itself, so its icon is a full square; Android's manifest icons are too.
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, false));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${name}.png` });
}
// Tab icon: rounded, on a transparent background.
const favicons = [];
for (const size of [16, 32, 48]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>${FONTS} * { margin: 0 } html, body { background: transparent; }</style></head>` +
      `<body>${logo(size, size <= 16 ? 0.62 : 0.5, 800)}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  favicons.push({ size, data: await page.screenshot({ omitBackground: true }) });
}
writeFileSync('public/favicon.ico', ico(favicons));
await browser.close();
console.log(`Made ${cards.length} share cards, 3 icons and favicon.ico`);
