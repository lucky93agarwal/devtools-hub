import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The video editor with real files: import, place on the timeline, split, trim, title, play and export.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test('edits a video on the timeline and exports an MP4', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(['e2e/fixtures/clip.mp4', 'e2e/fixtures/tone.wav', 'e2e/fixtures/photo.png']);
  const files = page.getByRole('list', { name: 'Project files' }).getByRole('listitem');
  await expect(files).toHaveCount(3);

  // Double-click adds at the playhead: the video, then the photo after it, and the sound on track 1.
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toBeVisible();
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await files.filter({ hasText: 'photo.png' }).dblclick();
  await page.getByRole('button', { name: 'Jump to start' }).click();
  await files.filter({ hasText: 'tone.wav' }).dblclick();
  await expect(page.getByLabel('Current time')).toHaveText('00:00:00:00');

  // Split the video at 1 second with the S key, then undo and redo it.
  await page.getByRole('button', { name: 'Clip clip.mp4' }).click();
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Current time')).toHaveText('00:00:01:00');
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);

  // Shorten the photo by dragging its right edge to the left.
  const photo = page.getByRole('button', { name: 'Clip photo.png' });
  await photo.scrollIntoViewIfNeeded();
  const before = (await photo.boundingBox())!.width;
  const edge = (await page.getByLabel('Trim end of photo.png').boundingBox())!;
  await page.mouse.move(edge.x + 4, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x - 100, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await photo.boundingBox())!.width).toBeLessThan(before - 50);

  // Add a title and change its text.
  await page.getByRole('tab', { name: 'Titles' }).click();
  await page.getByRole('button', { name: /Centre title/ }).click();
  await page.getByLabel('Title text').fill('Hello DevTools24');
  await page.getByLabel('Title text').blur();
  await expect(page.getByRole('button', { name: 'Clip Title: Hello DevTools24' })).toBeVisible();

  // Play for a moment.
  await page.getByRole('button', { name: 'Jump to start' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Current time')).not.toHaveText('00:00:00:00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-luckyagarwal-Desktop-Development/3e93280a-a340-465f-8d0c-4b4c1bb69845/scratchpad/editor.png' });

  // Export.
  await page.getByRole('button', { name: /Export video/ }).click();
  const download = page.getByRole('button', { name: /^Download clip-edit\.(mp4|webm)$/ });
  await expect(download).toBeVisible({ timeout: 90_000 });
  const saved = page.waitForEvent('download');
  await download.click();
  const file = await saved;
  expect(file.suggestedFilename()).toMatch(/^clip-edit\.(mp4|webm)$/);
  const bytes = (await import('node:fs')).readFileSync(await file.path()).toString('latin1');
  expect(bytes).toMatch(/avc1|V_VP9/);
});
