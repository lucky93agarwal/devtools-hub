import { expect, test } from '@playwright/test';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { startServer } from './static-server.mjs';
import { typeInEditor } from './helpers';

// A tab opened before a deploy still asks for the old chunk names, which the deploy
// removed. src/app/core/new-version.ts must then reload the tab into the new version.
// Here "build B" is build A with every hashed file renamed, which is what a deploy
// looks like to an open tab: same app, different chunk names, old names give 404.

const BUILD_A = 'dist/devtools-hub/browser';
const HASHED = /\b(?:chunk|main|worker|styles)-[\w-]+\.(?:js|css)\b/g;
const HASHED_FILE = /^(?:chunk|main|worker|styles)-[\w-]+\.(?:js|css)$/;
const TEXT_FILES = new Set(['.html', '.js', '.css', '.json']);
const SKIP_DIRS = new Set(['media', 'models', 'ort']);

/** Copies build A and gives every hashed file a new name, updating all references. */
function makeBuildB(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'dth-e2e-')), 'browser');
  cpSync(BUILD_A, dir, { recursive: true });

  const renames = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    if (!HASHED_FILE.test(name)) continue;
    const renamed = name.replace(/\.(js|css)$/, 'B.$1');
    renames.set(name, renamed);
    renameSync(join(dir, name), join(dir, renamed));
  }
  if (!renames.size) throw new Error(`No hashed files found in ${BUILD_A}`);

  const rewrite = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) rewrite(path);
      } else if (TEXT_FILES.has(extname(entry.name))) {
        const text = readFileSync(path, 'utf8');
        const next = text.replace(HASHED, (name) => renames.get(name) ?? name);
        if (next !== text) writeFileSync(path, next);
      }
    }
  };
  rewrite(dir);
  return dir;
}

/** The main script the page was loaded with, which tells build A from build B. */
const mainScript = (page: import('@playwright/test').Page) =>
  page.locator('script[src^="main-"]').getAttribute('src');

let server: Awaited<ReturnType<typeof startServer>>;
let buildB: string;

test.beforeAll(async () => {
  buildB = makeBuildB();
  server = await startServer(BUILD_A);
});
test.afterAll(async () => {
  await server?.close();
  if (buildB) rmSync(join(buildB, '..'), { recursive: true, force: true });
});
test.beforeEach(() => server.setRoot(BUILD_A));

test('an old tab opens JWT from the header after a deploy', async ({ page }) => {
  await page.goto(`${server.url}/json-formatter`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('JSON Formatter and Validator');
  const before = await mainScript(page);

  server.setRoot(buildB);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'JWT', exact: true })
    .click();

  await expect(page).toHaveURL(`${server.url}/jwt`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/JWT/);
  expect(await mainScript(page)).not.toBe(before);
  await page.getByRole('button', { name: 'Use a sample token' }).click();
  await expect(page.getByRole('heading', { name: 'Payload' })).toBeVisible();
});

test('an old tab can use the JSON editor after a deploy', async ({ page }) => {
  await page.goto(`${server.url}/json-formatter`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('JSON Formatter and Validator');
  const before = await mainScript(page);

  server.setRoot(buildB);
  // The first click starts loading the editor, which fails and reloads the page.
  await page.locator('app-code-editor').first().click();
  await expect.poll(() => mainScript(page)).not.toBe(before);
  await expect(page).toHaveURL(`${server.url}/json-formatter`);

  await typeInEditor(page, 'JSON input', '{"a":1}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Valid JSON');
});
