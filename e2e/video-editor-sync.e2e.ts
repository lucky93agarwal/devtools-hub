import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watchErrors } from './helpers';

// After a cut, captions and music stay in step; music, splitting and the theme behave as people expect.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;
const left = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`).evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.left)));

async function start(page: Page, files: string[]) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(files);
  await expect(page.getByRole('list', { name: 'Project files' }).getByRole('listitem')).toHaveCount(files.length);
}

test('a cut moves captions with the picture and shortens the music; S never cuts a clip you did not pick', async ({ page }) => {
  await start(page, ['e2e/fixtures/photo.png', 'e2e/fixtures/tone.wav']);
  await page.getByRole('button', { name: 'Add photo.png to the timeline' }).click();
  await page.getByRole('button', { name: 'Clip photo.png' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByLabel('Clip length').fill('10');
  await page.getByLabel('Clip length').blur();
  await page.getByRole('tab', { name: 'Project Files' }).click();
  // Music added after watching to the end still starts with the video.
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await page.getByRole('button', { name: 'Add tone.wav to the timeline' }).click();
  await expect.poll(() => left(page, 'Clip tone.wav')).toEqual([0]);
  await page.getByRole('button', { name: 'Clip tone.wav' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByRole('button', { name: /Fit to video length/ }).click();
  await expect(page.locator('[aria-label="Clip tone.wav"]')).toHaveCount(10);
  // One click selects the whole repeated music.
  await page.locator('[aria-label="Clip tone.wav"]').nth(3).click();
  await expect(page.locator('[aria-label="Clip tone.wav"].ring-2')).toHaveCount(10);

  // A caption at 7 s.
  await page.getByRole('button', { name: 'Jump to start' }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Forward one second' }).click();
  await page.getByRole('tab', { name: 'Titles' }).click();
  await page.getByRole('button', { name: /Caption at playhead/ }).click();
  await expect(page.locator('[aria-label="Clip Title: Caption text"]')).toHaveCount(1);
  const [captionBefore] = await left(page, 'Clip Title: Caption text');

  // S with the caption selected but the playhead elsewhere: nothing else is cut.
  await page.getByRole('button', { name: 'Jump to start' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Forward one second' }).click();
  await page.keyboard.press('s');
  await expect(page.getByRole('alert')).toContainText('not over the selected clip');
  await expect(page.locator('[aria-label="Clip photo.png"]')).toHaveCount(1);

  // Cut 2–4 s out of the photo.
  await page.getByRole('button', { name: 'Clip photo.png' }).click();
  await page.keyboard.press('s');
  await page.getByRole('button', { name: 'Forward one second' }).click();
  await page.getByRole('button', { name: 'Forward one second' }).click();
  await page.locator('[aria-label="Clip photo.png"]').last().click();
  await page.keyboard.press('s');
  await expect(page.locator('[aria-label="Clip photo.png"]')).toHaveCount(3);
  await page.locator('[aria-label="Clip photo.png"]').nth(1).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[aria-label="Clip photo.png"]')).toHaveCount(2);

  const pps = 60;
  const [captionAfter] = await left(page, 'Clip Title: Caption text');
  expect(captionBefore - captionAfter).toBeCloseTo(2 * pps, 0);
  const music = await page.locator('[aria-label="Clip tone.wav"]').evaluateAll((els) => Math.max(...els.map((e) => parseFloat((e as HTMLElement).style.left) + parseFloat((e as HTMLElement).style.width))));
  const video = await page.locator('[aria-label="Clip photo.png"]').evaluateAll((els) => Math.max(...els.map((e) => parseFloat((e as HTMLElement).style.left) + parseFloat((e as HTMLElement).style.width))));
  expect(Math.abs(music - video)).toBeLessThan(8);
});

test('the editor takes the site colours in light and in dark', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/video-editor');
  const colours = () =>
    page.evaluate(() => {
      const editor = document.querySelector('.editor')!;
      const root = getComputedStyle(document.documentElement);
      return { editor: getComputedStyle(editor).backgroundColor, panel: getComputedStyle(editor.querySelector('.panel')!).backgroundColor, surface: root.getPropertyValue('--surface').trim(), page: root.getPropertyValue('--page').trim() };
    });
  const toRgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const light = await colours();
  expect(light.editor).toBe(toRgb(light.surface));
  expect(light.panel).toBe(toRgb(light.page));
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const dark = await colours();
  expect(dark.editor).toBe(toRgb(dark.surface));
  expect(dark.editor).not.toBe(light.editor);
});

test('controls wait until the editor has started', async ({ page }) => {
  const html = readFileSync('dist/devtools-hub/browser/video-editor/index.html', 'utf8');
  // The page sent from the server shows the editor, but its controls are switched off until it starts.
  expect(html).toMatch(/<fieldset[^>]*class="contents"[^>]*disabled/);
  await page.goto('/video-editor');
  await expect(page.getByLabel('Profile')).toBeEnabled();
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
  test('swiping the timeline scrolls it without moving the playhead; the toolbar is compact', async ({ page }) => {
    await page.goto('/video-editor');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import files/ }).tap();
    await (await chooser).setFiles(['e2e/fixtures/photo.png']);
    await page.getByRole('button', { name: 'Add photo.png to the timeline' }).tap();
    const empty = page.locator('[data-track="3"]');
    await empty.scrollIntoViewIfNeeded();
    const b = (await empty.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 200, y: b.y + 20 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 200 - i * 20, y: b.y + 20 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    await expect(page.getByLabel('Current time')).toHaveText('00:00:00:00');
    const toolbar = (await page.getByRole('toolbar', { name: 'Editor' }).boundingBox())!;
    expect(toolbar.height).toBeLessThan(200);
    const header = await page.locator('[data-track="1"]').evaluate((e) => e.getBoundingClientRect().left - e.parentElement!.getBoundingClientRect().left);
    expect(header).toBeLessThanOrEqual(92);
  });
});
