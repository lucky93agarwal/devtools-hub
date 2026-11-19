import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The video editor's advanced tools with real files.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;

async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(['e2e/fixtures/clip.mp4', 'e2e/fixtures/tone.wav']);
  const files = page.getByRole('list', { name: 'Project files' }).getByRole('listitem');
  await expect(files).toHaveCount(2);
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  const clip = page.getByRole('button', { name: 'Clip clip.mp4' });
  await expect(clip).toBeVisible();
  return { files, clip };
}

test('speed, reverse, transform keyframes, separate audio and freeze frame', async ({ page }) => {
  const { clip } = await start(page);
  await clip.scrollIntoViewIfNeeded();
  await clip.click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  const width = (await clip.boundingBox())!.width;
  await page.getByLabel('Clip speed').selectOption('2');
  await expect.poll(async () => (await clip.boundingBox())!.width).toBeLessThan(width * 0.6);
  await expect(clip).toContainText('2×');
  await page.getByLabel('Play backwards').check();
  await expect(clip).toContainText('⟲');

  // Keyframes: size at the start, bigger later.
  await page.getByLabel('Keyframe Size').click();
  await page.getByRole('button', { name: 'Clip clip.mp4' }).click();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
  await page.getByLabel('Transform Size').fill('2');
  await expect(clip).toContainText('◆');

  await page.getByRole('button', { name: /Separate audio/ }).click();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);
  // The picture clip is muted (🔇) and keeps its keyframes; the new clip holds only its sound.
  const picture = page.getByRole('button', { name: 'Clip clip.mp4' }).filter({ hasText: '🔇' });
  await expect(picture).toHaveCount(1);
  await expect(picture).toContainText('◆');

  await picture.click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByRole('button', { name: /Freeze frame/ }).click();
  await expect(page.getByRole('button', { name: /Clip clip-frame-/ })).toBeVisible();

  await page.getByRole('tab', { name: 'History' }).click();
  const history = page.getByRole('list', { name: 'History' });
  await expect(history).toContainText('Speed 2×');
  await expect(history).toContainText('Separate audio');
  await expect(history).toContainText('Freeze frame');
  await history.getByRole('button', { name: /Speed 2×/ }).click();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(1);
});

test('copy and paste, markers, locked tracks, project file and other export formats', async ({ page }) => {
  const { files, clip } = await start(page);
  await files.filter({ hasText: 'tone.wav' }).dblclick();
  // Timeline pictures on the video and a waveform on the sound.
  await expect(clip.locator('img').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Clip tone.wav' }).locator('svg path')).toHaveCount(1, { timeout: 15_000 });
  await clip.scrollIntoViewIfNeeded();
  await clip.click();
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);

  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: /Marker at/ })).toHaveCount(1);

  // A locked track cannot be dragged on.
  await page.getByRole('button', { name: 'Lock Track 1' }).click();
  const locked = page.getByRole('button', { name: 'Clip clip.mp4' }).first();
  const box = (await locked.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Math.round((await locked.boundingBox())!.x)).toBe(Math.round(box.x));

  // Save the project as a zip and open it again.
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save project/ }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toBe('video-project.zip');
  const path = test.info().outputPath('video-project.zip');
  await zip.saveAs(path);
  page.once('dialog', (d) => d.accept());
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Open project/ }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Marker at/ })).toHaveCount(1);

  // GIF and audio-only exports.
  await page.getByLabel('Export format').selectOption('gif');
  await page.getByRole('button', { name: /Export video/ }).click();
  const gif = page.getByRole('button', { name: /^Download clip-edit\.gif$/ });
  await expect(gif).toBeVisible({ timeout: 60_000 });
  download = page.waitForEvent('download');
  await gif.click();
  expect((await download).suggestedFilename()).toBe('clip-edit.gif');

  await page.getByLabel('Export format').selectOption('wav');
  await page.getByRole('button', { name: /Export video/ }).click();
  const wav = page.getByRole('button', { name: /^Download clip-edit\.wav$/ });
  await expect(wav).toBeVisible({ timeout: 60_000 });
  download = page.waitForEvent('download');
  await wav.click();
  expect((await download).suggestedFilename()).toBe('clip-edit.wav');
});
