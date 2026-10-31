import { chromium, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

// The browser extension in extension/: its popup lists the tools, and links made from selected text open the
// right tool with the text filled in (checked against the local build instead of devtools24.in).

test('extension popup searches tools and its links fill in the tool', async ({ baseURL }) => {
  const ext = resolve('extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = worker.url().split('/')[2];
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator('#list a')).not.toHaveCount(0);
    await popup.getByLabel('Search tools').fill('jwt decoder');
    await expect(popup.locator('#list a').first()).toContainText('JWT Decoder');

    const cases: [string, string, string][] = [
      ['{"b":1}', 'json-formatter', '"b"'],
      ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhc2hhIn0.abc', 'jwt', 'asha'],
      ['caf%C3%A9%20bar', 'url-encoder', 'café bar'],
      ['aGVsbG8gd29ybGQ=', 'base64', 'hello world'],
    ];
    for (const [text, path, shown] of cases) {
      const url = await popup.evaluate(async (t) => {
        const share = await import('./share.js');
        const d = share.detect(t);
        return share.toolUrl(d.path, d.data);
      }, text);
      const page = await context.newPage();
      await page.goto(url.replace('https://devtools24.in', baseURL!));
      await expect(page).toHaveURL(new RegExp(`/${path}$`));
      await expect
        .poll(async () => (await page.locator('main').innerText()) + (await page.locator('textarea, input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join(' '))))
        .toContain(shown);
      await page.close();
    }
  } finally {
    await context.close();
  }
});
