/**
 * Prepares the browser extension in extension/: the tool list for the popup, icons at 16, 48 and 128 px,
 * and dist/devtools24-extension.zip ready for the Chrome Web Store. Run: node scripts/build-extension.mjs
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ext = resolve(root, 'extension');

// The registry is TypeScript; the fields needed here are simple quoted strings.
const source = readFileSync(resolve(root, 'src/app/core/tools.ts'), 'utf8');
const tools = [];
for (const block of source.split(/\n  \{\n/).slice(1)) {
  const field = (name) => /'((?:[^'\\]|\\.)*)'/.exec(new RegExp(`\\b${name}:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`).exec(block)?.[1] ?? '')?.[1]?.replace(/\\'/g, "'");
  if (!/live: true/.test(block)) continue;
  const path = field('path');
  if (path) tools.push({ path, name: field('name'), description: field('description') });
}
if (tools.length < 50) throw new Error(`Only ${tools.length} tools found in tools.ts`);
writeFileSync(resolve(ext, 'tools.json'), JSON.stringify(tools, null, 1) + '\n');

mkdirSync(resolve(ext, 'icons'), { recursive: true });
const icon = `data:image/png;base64,${readFileSync(resolve(root, 'public/icons/icon-512.png')).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 48, 128]) {
  const data = await page.evaluate(
    async ([src, size]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [icon, size],
  );
  writeFileSync(resolve(ext, `icons/icon-${size}.png`), Buffer.from(data, 'base64'));
}
await browser.close();

mkdirSync(resolve(root, 'dist'), { recursive: true });
const zip = resolve(root, 'dist/devtools24-extension.zip');
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.', '-x', 'README.md', '*.DS_Store'], { cwd: ext });
console.log(`${tools.length} tools, icons and ${zip}`);
