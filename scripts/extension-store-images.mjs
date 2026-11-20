/**
 * Makes the Chrome Web Store images for the extension in extension/store/:
 * two 1280x800 screenshots (the real popup, and a tool opened from selected text on devtools24.in)
 * and the 440x280 small promo tile. Run after scripts/build-extension.mjs.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ext = resolve(root, 'extension');
const out = (name) => resolve(ext, 'store', name);
const icon = `data:image/png;base64,${readFileSync(resolve(ext, 'icons/icon-128.png')).toString('base64')}`;
const png = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const id = worker.url().split('/')[2];

// The real popup, searched for "json".
const popup = await context.newPage();
await popup.setViewportSize({ width: 364, height: 540 });
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.fill('#search', 'json');
const popupShot = await popup.screenshot();

// A tool opened the way the right-click menu opens it.
const tool = await context.newPage();
await tool.setViewportSize({ width: 1280, height: 800 });
const url = await popup.evaluate(async () => {
  const share = await import('./share.js');
  return share.toolUrl('json-formatter', { input: '{"order":{"id":1042,"items":[{"sku":"BK-1","qty":2}],"paid":true}}' });
});
await tool.goto(url);
await tool.waitForTimeout(2500);
const toolShot = await tool.screenshot();

const frame = await context.newPage();
const shell = (w, h, body) => `<!doctype html><html><head><style>
  *{box-sizing:border-box} body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
  background:linear-gradient(135deg,#4f46e5,#9333ea);color:#fff;display:flex;align-items:center}
  h1{font-size:44px;line-height:1.15;margin:0 0 16px} p{font-size:22px;line-height:1.45;margin:0;opacity:.92}
  img.shot{border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
</style></head><body>${body}</body></html>`;

await frame.setViewportSize({ width: 1280, height: 800 });
await frame.setContent(shell(1280, 800, `
  <div style="padding:0 72px;flex:1"><img src="${icon}" width="72" height="72" style="margin-bottom:24px">
    <h1>Every developer tool,<br>one click away</h1>
    <p>Search 80+ free tools: JSON, JWT, Base64, regex,<br>image and video tools and more.<br>Press Alt+Shift+D anywhere.</p></div>
  <div style="padding-right:96px"><img class="shot" src="${png(popupShot)}" width="364" height="540"></div>`));
await frame.screenshot({ path: out('screenshot-1-search.png') });

await frame.setContent(shell(1280, 800, `
  <div style="position:absolute;top:40px;left:0;right:0;text-align:center">
    <h1 style="font-size:36px;margin:0">Right-click selected text → open it in the right tool</h1>
    <p style="font-size:20px;margin-top:8px">JSON, JWT, Base64, URLs, timestamps and cron. The text stays in your browser.</p></div>
  <img class="shot" src="${png(toolShot)}" style="position:absolute;left:140px;top:170px;width:1000px;height:625px">`));
await frame.screenshot({ path: out('screenshot-2-right-click.png') });

await frame.setViewportSize({ width: 440, height: 280 });
await frame.setContent(shell(440, 280, `
  <div style="padding:0 36px"><img src="${icon}" width="64" height="64" style="margin-bottom:14px">
    <h1 style="font-size:34px;margin:0 0 8px">DevTools24</h1>
    <p style="font-size:17px">80+ free developer tools.<br>Private: everything runs in your browser.</p></div>`));
await frame.screenshot({ path: out('promo-small-440x280.png') });

await context.close();
console.log('Wrote extension/store images');
