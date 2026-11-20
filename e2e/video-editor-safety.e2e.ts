import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watchErrors } from './helpers';

// Locked tracks, two tabs, odd files, overlapping subtitles and long GIFs in the video editor.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;

async function open(page: Page, files: Parameters<import('@playwright/test').FileChooser['setFiles']>[0]) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(files);
}

test('locked tracks are not changed by paste, slideshow, titles or properties', async ({ page }) => {
  await open(page, ['e2e/fixtures/clip.mp4', 'e2e/fixtures/photo.png']);
  const files = page.getByRole('list', { name: 'Project files' }).getByRole('listitem');
  await expect(files).toHaveCount(2);
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  const clip = page.getByRole('button', { name: 'Clip clip.mp4' });
  await clip.click();
  await page.keyboard.press('Control+c');
  for (const n of [1, 2, 3, 4, 5]) await page.getByRole('button', { name: `Lock Track ${n}` }).click();

  await page.getByRole('button', { name: 'Jump to end' }).click();
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('alert')).toContainText('All tracks are locked');
  await expect(clip).toHaveCount(1);
  await page.getByRole('button', { name: /Add 1 photo to the timeline/ }).click();
  await expect(page.getByRole('button', { name: 'Clip photo.png' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Titles' }).click();
  await page.getByRole('button', { name: /Centre title/ }).click();
  await expect(page.getByRole('button', { name: /Clip Title:/ })).toHaveCount(0);

  await clip.click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.getByText(/This clip is on a locked track/)).toBeVisible();
  await expect(page.getByLabel('Clip speed')).toBeDisabled();

  // Unlocking one track lets the paste through, onto that track.
  await page.getByRole('button', { name: 'Unlock Track 2' }).click();
  await page.keyboard.press('Control+v');
  await expect(page.locator('[data-track="2"] [aria-label="Clip clip.mp4"]')).toHaveCount(1);
});

test('a second tab does not overwrite the first one, until told to', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto('/video-editor');
  await first.getByRole('tab', { name: 'Titles' }).click();
  await first.getByRole('button', { name: /Centre title/ }).click();
  await expect(first.getByLabel('Save status')).toContainText('Saved', { timeout: 10_000 });

  const second = await context.newPage();
  await second.goto('/video-editor');
  await expect(second.getByRole('alert')).toContainText('open in another tab');
  await second.getByRole('tab', { name: 'Titles' }).click();
  await second.getByRole('button', { name: /Typewriter/ }).click();
  await second.waitForTimeout(1500);
  await expect(second.getByLabel('Save status')).not.toContainText('Saved');

  // Taking over: the second tab saves, the first one stops and says why.
  await second.getByRole('button', { name: 'Save in this tab instead' }).click();
  await expect(second.getByLabel('Save status')).toContainText('Saved', { timeout: 10_000 });
  await expect(first.getByRole('alert')).toContainText('open in another tab');
  await context.close();
});

test('imports iPhone HEIC, TIFF and SVG pictures, and names the files it cannot read', async ({ page }) => {
  await open(page, [
    { name: 'small.heic', mimeType: 'image/heic', buffer: readFileSync('e2e/fixtures/small.heic') },
    { name: 'small.tiff', mimeType: 'image/tiff', buffer: readFileSync('e2e/fixtures/small.tiff') },
    { name: 'small.svg', mimeType: 'image/svg+xml', buffer: readFileSync('e2e/fixtures/small.svg') },
    { name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  const files = page.getByRole('list', { name: 'Project files' }).getByRole('listitem');
  await expect(files).toHaveCount(3, { timeout: 20_000 });
  for (const name of ['small.heic', 'small.tiff', 'small.svg']) await expect(files.filter({ hasText: name })).toHaveCount(1);
  const alert = page.getByRole('alert').first();
  await expect(alert).toContainText('Could not import 2 files');
  await expect(alert).toContainText('broken.mp4 (damaged');
  await expect(alert).toContainText('notes.txt (not a video, sound or picture)');
  await files.filter({ hasText: 'small.heic' }).dblclick();
  await expect(page.getByRole('button', { name: 'Clip small.heic' })).toBeVisible();
});

test('overlapping subtitle lines get their own lane; long GIFs are refused with a reason', async ({ page }) => {
  await open(page, ['e2e/fixtures/photo.png']);
  await page.getByRole('tab', { name: 'Titles' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import \.srt/ }).click();
  await (await chooser).setFiles({ name: 'o.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:05,000 --> 00:00:08,000\nFirst line\n\n2\n00:00:06,000 --> 00:00:07,000\nSecond speaker\n') });
  await expect(page.getByText('Captions 2', { exact: true })).toBeVisible();
  const lanes = await page.getByRole('button', { name: /Clip Title: (First line|Second speaker)/ }).evaluateAll((els) => els.map((e) => e.closest('[data-track]')!.getAttribute('data-track')));
  expect(new Set(lanes).size).toBe(2);

  // A 3-minute picture is too long for a GIF.
  await page.getByRole('tab', { name: 'Project Files' }).click();
  await page.getByLabel('Seconds per photo').fill('30');
  await page.getByRole('button', { name: /Add 1 photo to the timeline/ }).click();
  await page.getByRole('button', { name: 'Clip photo.png' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByLabel('Clip length').fill('200');
  await page.getByLabel('Clip length').blur();
  await page.getByLabel('Export format').selectOption('gif');
  await page.getByRole('button', { name: /Export video/ }).click();
  await expect(page.getByRole('alert').first()).toContainText('A GIF can be at most 150 seconds');
});
