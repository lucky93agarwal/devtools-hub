import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watchErrors } from './helpers';

// The video editor's newer tools: ramps, curves, scale modes, captions, export settings and interchange files.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;

async function start(page: Page, files = ['e2e/fixtures/clip.mp4', 'e2e/fixtures/tone.wav']) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(files);
  const list = page.getByRole('list', { name: 'Project files' }).getByRole('listitem');
  await expect(list).toHaveCount(files.length);
  return list;
}

async function download(page: Page, click: () => Promise<void>) {
  const event = page.waitForEvent('download');
  await click();
  const file = await event;
  const path = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(path);
  return { name: file.suggestedFilename(), path };
}

test('speed ramp, scale mode, keyframe curve, new effects and sound effects export without errors', async ({ page }) => {
  const files = await start(page);
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  const clip = page.getByRole('button', { name: 'Clip clip.mp4' });
  await clip.scrollIntoViewIfNeeded();
  await clip.click();
  await page.getByRole('tab', { name: 'Properties' }).click();

  await page.getByLabel('Speed ramp').selectOption('slow-middle');
  await expect(clip).toContainText('ramp');
  await page.getByLabel('Ramp strength').fill('0.4');
  await page.getByLabel('Scale mode').selectOption('fill');

  await page.getByLabel('Keyframe Size').click();
  await page.getByLabel('Keyframe curve').selectOption('ease');
  await expect(page.getByLabel('Keyframe curve')).toHaveValue('ease');

  await page.getByLabel('Mirror').check();
  for (const [label, value] of [
    ['Effect Vignette', '60'],
    ['Effect Film grain', '40'],
    ['Effect Wave', '30'],
    ['Effect Colour shift', '6'],
  ]) {
    await page.getByLabel(label).fill(value);
  }
  for (const label of ['Noise reduction', 'Compressor', 'Robot voice', 'Phone voice']) await page.getByLabel(label).check();
  await page.getByLabel('Mid', { exact: true }).fill('4');
  await page.getByLabel('Distortion').fill('0.3');

  // A mask transition and a blurred background, in a 4:5 frame.
  await page.getByLabel('Start transition').selectOption('star');
  await page.getByLabel('End transition').selectOption('heart');
  await page.getByLabel('Profile').selectOption({ label: 'Portrait 4:5 1080×1350 (Instagram)' });
  await page.getByLabel('Empty space').selectOption('blur');

  // Frame step buttons move by one frame.
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.getByLabel('Current time')).toHaveText('00:00:00:01');
  await page.getByRole('button', { name: 'Previous frame' }).click();
  await expect(page.getByLabel('Current time')).toHaveText('00:00:00:00');

  // Safe zones overlay.
  await page.getByRole('button', { name: 'Safe zones' }).click();
  await expect(page.getByLabel('Safe zones', { exact: true }).locator('rect').first()).toBeAttached();

  // Export a small part at 480p, 24 fps.
  await page.getByRole('button', { name: 'Export settings' }).click();
  await page.getByLabel('Export resolution').selectOption('480');
  await expect(page.getByRole('group', { name: 'Export settings panel' })).toContainText('480×600');
  await page.getByLabel('Export frame rate').selectOption('24');
  const before = await page.getByLabel('Estimated file size').textContent();
  await page.getByLabel('Export only a part').check();
  await page.getByLabel('Export from').fill('0.5');
  await page.getByLabel('Export to').fill('1.5');
  await page.getByLabel('Export to').blur();
  await expect(page.getByLabel('Estimated file size')).not.toHaveText(before!);
  await page.getByRole('button', { name: /Export video/ }).click();
  const ready = page.getByRole('button', { name: /^Download clip-edit\.(mp4|webm)$/ });
  await expect(ready).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/could not be exported/)).toHaveCount(0);
  const out = await download(page, () => ready.click());
  // A one-second 480×600 video: decode it in the page to check.
  const bytes = readFileSync(out.path).toString('base64');
  const info = await page.evaluate(async (data) => {
    const video = document.createElement('video');
    video.src = `data:video/mp4;base64,${data}`;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  }, bytes);
  expect(info.width).toBe(480);
  expect(info.height).toBe(600);
  expect(info.duration).toBeGreaterThan(0.8);
  expect(info.duration).toBeLessThan(1.3);
});

test('captions: add, import .srt, export .srt, and the Captions track', async ({ page }) => {
  await start(page);
  await page.getByRole('tab', { name: 'Titles' }).click();
  await page.getByRole('button', { name: /Caption at playhead/ }).click();
  await expect(page.getByRole('button', { name: 'Clip Title: Caption text' })).toContainText('CC');
  await expect(page.getByText('Captions', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Titles' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import \.srt/ }).click();
  await (await chooser).setFiles({
    name: 'subs.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:04,000 --> 00:00:05,500\nHello world\n\n2\n00:00:06,000 --> 00:00:07,000\nBye\n'),
  });
  await expect(page.getByRole('button', { name: 'Clip Title: Hello world' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clip Title: Bye' })).toBeVisible();

  await page.getByRole('tab', { name: 'Titles' }).click();
  const srt = await download(page, () => page.getByRole('button', { name: /Export \.srt/ }).click());
  // No file is on the timeline, so the name is the generic one.
  expect(srt.name).toBe('video-subtitles.srt');
  const text = readFileSync(srt.path, 'utf8');
  expect(text).toContain('00:00:00,000 --> 00:00:03,000\nCaption text');
  expect(text).toContain('3\n00:00:06,000 --> 00:00:07,000\nBye');
});

test('frame pictures, picture sequence, EDL, Final Cut XML, slideshow, track rename and shortcuts', async ({ page }) => {
  const files = await start(page, ['e2e/fixtures/clip.mp4', 'e2e/fixtures/photo.png', 'e2e/fixtures/small.png']);
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toBeVisible();

  // Photos to slideshow.
  await page.getByLabel('Seconds per photo').fill('1.5');
  await page.getByRole('button', { name: /Add 2 photos to the timeline/ }).click();
  await expect(page.getByRole('button', { name: 'Clip photo.png' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clip small.png' })).toBeVisible();

  await page.getByRole('button', { name: 'Export settings' }).click();
  const png = await download(page, () => page.getByRole('button', { name: /Frame PNG/ }).click());
  expect(png.name).toMatch(/^clip-frame-0\.00s\.png$/);
  expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
  const jpg = await download(page, () => page.getByRole('button', { name: /Frame JPG/ }).click());
  expect(readFileSync(jpg.path)[0]).toBe(0xff);

  const edl = await download(page, () => page.getByRole('button', { name: /EDL/ }).click());
  expect(edl.name).toBe('clip-timeline.edl');
  expect(readFileSync(edl.path, 'utf8')).toContain('* FROM CLIP NAME: clip.mp4');
  const xml = await download(page, () => page.getByRole('button', { name: /Final Cut XML/ }).click());
  expect(readFileSync(xml.path, 'utf8')).toContain('<xmeml version="5">');

  // Video to photos: a zip of PNG frames from the first second.
  await page.getByLabel('Export format').selectOption('png-sequence');
  await page.getByLabel('Export only a part').check();
  await page.getByLabel('Export from').fill('0');
  await page.getByLabel('Export to').fill('1');
  await page.getByLabel('Export to').blur();
  await page.getByRole('button', { name: /Export video/ }).click();
  const zip = page.getByRole('button', { name: /^Download clip-edit\.zip$/ });
  await expect(zip).toBeVisible({ timeout: 60_000 });
  const frames = await download(page, () => zip.click());
  expect(readFileSync(frames.path).subarray(0, 2).toString()).toBe('PK');

  // Rename a track by double-clicking its name.
  await page.getByText('Track 3', { exact: true }).dblclick();
  const input = page.getByLabel('Rename Track 3');
  await input.fill('B-roll');
  await input.press('Enter');
  await expect(page.getByText('B-roll', { exact: true })).toBeVisible();

  // C splits at the playhead; ⌨ opens the shortcuts.
  await page.getByRole('button', { name: 'Clip clip.mp4' }).click();
  await page.getByRole('button', { name: 'Forward one second' }).click();
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Video editor shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Video editor shortcuts' })).toContainText('Split at the playhead');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Video editor shortcuts' })).toHaveCount(0);
});

test('fixes from testing: caption overlap, range check, cancel, title effects, shortcuts after a dropdown', async ({ page }) => {
  const files = await start(page, ['e2e/fixtures/clip.mp4', 'e2e/fixtures/photo.png', 'e2e/fixtures/small.png']);
  await files.filter({ hasText: 'clip.mp4' }).dblclick();
  const clip = page.getByRole('button', { name: 'Clip clip.mp4' });
  await expect(clip).toBeVisible();

  // After choosing from a dropdown with the mouse, Space plays again.
  await clip.click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByLabel('Clip speed').click();
  await page.getByLabel('Clip speed').selectOption('0.5');
  await expect(page.getByLabel('Clip speed')).not.toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');

  // Two captions at the same playhead sit one after the other.
  await page.getByRole('button', { name: 'Jump to start' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('tab', { name: 'Titles' }).click();
    await page.getByRole('button', { name: /Caption at playhead/ }).click();
  }
  const captions = page.getByRole('button', { name: 'Clip Title: Caption text' });
  await expect(captions).toHaveCount(2);
  const [a, b] = await captions.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
  expect(Math.abs(a - b)).toBeGreaterThan(100);

  // Titles only offer the effects they can show.
  await captions.first().click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.getByLabel('Effect Brightness')).toBeVisible();
  await expect(page.getByLabel('Mirror')).toHaveCount(0);
  await expect(page.getByLabel('Effect Vignette')).toHaveCount(0);

  // "Only a part" starts as the whole timeline, and To before From is refused.
  await page.getByRole('button', { name: 'Export settings' }).click();
  await page.getByLabel('Export only a part').check();
  await expect(page.getByLabel('Export from')).toHaveValue('0');
  expect(Number(await page.getByLabel('Export to').inputValue())).toBeGreaterThan(5);
  await page.getByLabel('Export from').fill('1.5');
  await page.getByLabel('Export to').fill('0.5');
  await page.getByLabel('Export to').blur();
  await page.getByRole('button', { name: /Export video/ }).click();
  await expect(page.getByRole('alert')).toContainText('To must be after From');
  await page.getByLabel('Export only a part').uncheck();

  // A long export can be cancelled.
  await page.getByRole('tab', { name: 'Project Files' }).click();
  await page.getByLabel('Seconds per photo').fill('30');
  await page.getByRole('button', { name: /Add 2 photos to the timeline/ }).click();
  await page.getByLabel('Export resolution').selectOption('1080');
  await page.getByLabel('Export frame rate').selectOption('60');
  await page.getByRole('button', { name: /Export video/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Export progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Export progress' })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Download / })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export video/ })).toBeEnabled();
});
