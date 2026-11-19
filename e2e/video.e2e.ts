import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The video tools with a real 2-second MP4 (H.264 + AAC) and a WAV file.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;

async function choose(page: Page, button: string, file: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(`e2e/fixtures/${file}`);
}

test('the Video tab opens the video tools', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Video', exact: true }).click();
  await expect(page).toHaveURL(/\/video-to-audio$/);
  await expect(page.getByRole('navigation', { name: 'Video and audio' }).getByRole('link', { name: 'Add audio' })).toBeVisible();
});

test('extracts the original sound and an MP3 from a video', async ({ page }) => {
  await page.goto('/video-to-audio');
  await choose(page, 'Choose video', 'clip.mp4');
  await expect(page.getByText(/0:02 · sound: AAC/)).toBeVisible();
  await page.getByRole('button', { name: 'Extract audio' }).click();
  await expect(page.getByText(/Audio ready: clip\.m4a .* copied with no quality loss/)).toBeVisible();
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clip.m4a' }).click();
  expect((await download).suggestedFilename()).toBe('clip.m4a');

  await page.getByLabel('Save as').selectOption('mp3');
  await page.getByLabel('End time').fill('1');
  await page.getByRole('button', { name: 'Extract audio' }).click();
  await expect(page.getByText(/Audio ready: clip\.mp3/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.getByLabel('Extracted audio').evaluate((a: HTMLAudioElement) => a.duration), { timeout: 10_000 }).toBeLessThan(1.3);
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clip.mp3' }).click();
  expect((await download).suggestedFilename()).toBe('clip.mp3');
});

test('adds two sounds to a video and keeps the picture', async ({ page }) => {
  await page.goto('/add-audio-to-video');
  await choose(page, 'Choose video', 'clip.mp4');
  await expect(page.getByText(/0:02 · 320×180/)).toBeVisible();
  for (const name of ['tone.wav', 'clip.mp4']) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '+ Add audio' }).click();
    await (await chooser).setFiles(`e2e/fixtures/${name}`);
  }
  const sounds = page.getByRole('list', { name: 'Added sounds' }).getByRole('listitem');
  await expect(sounds).toHaveCount(2);
  await page.getByLabel('Start of tone.wav').fill('0.5');
  await page.getByLabel('Repeat to fill the video').first().check();
  await page.getByLabel("Video's own sound").fill('0');
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByText(/Video ready: clip-with-audio\.mp4/)).toBeVisible({ timeout: 60_000 });
  const result = page.getByLabel('New video');
  await expect.poll(() => result.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 }).toBe(320);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clip-with-audio.mp4' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('clip-with-audio.mp4');
  // The new file holds the copied H.264 video and an AAC sound track.
  const bytes = (await import('node:fs')).readFileSync(await saved.path()).toString('latin1');
  expect(bytes).toContain('avc1');
  expect(bytes).toContain('mp4a');
});
