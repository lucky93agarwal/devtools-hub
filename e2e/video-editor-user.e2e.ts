import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The video editor used the way people use it: a video with music, a cut, a title, on a laptop and a phone.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

type Page = import('@playwright/test').Page;
const track = (page: Page, name: string) =>
  page.getByRole('button', { name }).evaluateAll((els) => els.map((e) => [e.closest('[data-track]')!.getAttribute('data-track'), Math.round(parseFloat((e as HTMLElement).style.left))]));

test('a video with music, a cut in the middle and a title, on a laptop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/video-editor');
  await expect(page.getByText('Press ＋ on a file to put it on the timeline')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(['e2e/fixtures/clip.mp4', 'e2e/fixtures/photo.png', 'e2e/fixtures/tone.wav']);
  await expect(page.getByRole('list', { name: 'Project files' }).getByRole('listitem')).toHaveCount(3);
  // The editor scrolls into view and the timeline fits on the screen.
  await expect.poll(() => page.locator('[aria-label="Timeline tracks"]').evaluate((e) => e.getBoundingClientRect().top)).toBeLessThan(768 - 120);

  // ＋ puts clips one after another, and music under them.
  await page.getByRole('button', { name: 'Add clip.mp4 to the timeline' }).click();
  await page.getByRole('button', { name: 'Add photo.png to the timeline' }).click();
  await page.getByRole('button', { name: 'Jump to start' }).click();
  await page.getByRole('button', { name: 'Add tone.wav to the timeline' }).click();
  expect(await track(page, 'Clip clip.mp4')).toEqual([['1', 0]]);
  const photo = await track(page, 'Clip photo.png');
  expect(photo[0][0]).toBe('1');
  expect(photo[0][1]).toBeGreaterThan(100);
  expect((await track(page, 'Clip tone.wav'))[0][0]).toBe('2');

  // Cut the photo in two, delete the first part: the gap closes.
  await page.getByRole('button', { name: 'Jump to end' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Back one second' }).click();
  await page.getByRole('button', { name: 'Clip photo.png' }).click();
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Clip photo.png' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Clip photo.png' }).first().click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Clip photo.png' })).toHaveCount(1);
  const [[, left]] = await track(page, 'Clip photo.png');
  expect(left).toBe(photo[0][1]);

  // Music: fade in and out, and fit it to the video.
  await page.getByRole('button', { name: 'Clip tone.wav' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByLabel('Fade in seconds').fill('0.5');
  await page.getByLabel('Fade in seconds').blur();
  await page.getByRole('button', { name: /Fit to video length/ }).click();
  const musicClips = page.locator('[aria-label="Clip tone.wav"]');
  // The 1 s sound repeats up to the end of the 4 s video, as one group.
  await expect(musicClips).toHaveCount(4);
  const music = await musicClips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  const video = await page.getByRole('button', { name: 'Clip photo.png' }).evaluate((e) => e.getBoundingClientRect().right);
  expect(Math.abs(Math.max(...music) - video)).toBeLessThan(4);
  await page.getByRole('tab', { name: 'Properties' }).click();
  // The last piece fades out (as long as it can: this sound is 1 s).
  await expect(page.getByLabel('Fade out seconds')).toHaveValue('1');

  // A new title is visible straight away: the playhead moves to where it has settled.
  await page.getByRole('button', { name: 'Jump to start' }).click();
  await page.getByRole('tab', { name: 'Titles' }).click();
  await page.getByRole('button', { name: /Centre title/ }).click();
  await expect(page.getByLabel('Current time')).not.toHaveText('00:00:00:00');

  // The size is shown as a range, and the toolbar buttons say what they are.
  await expect(page.getByLabel('Estimated file size')).toHaveText(/≈ .+–.+/);
  await expect(page.getByRole('button', { name: 'Export settings' })).toContainText('Settings');
});

test('the timeline follows the playhead', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(['e2e/fixtures/photo.png']);
  await page.getByRole('button', { name: 'Add photo.png to the timeline' }).click();
  await page.getByRole('button', { name: 'Clip photo.png' }).click();
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.getByLabel('Clip length').fill('60');
  await page.getByLabel('Clip length').blur();
  const scroller = page.locator('[aria-label="Timeline tracks"]');
  await page.getByRole('button', { name: 'Jump to end' }).click();
  await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Jump to start' }).click();
  await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBe(0);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
  test('one tap adds a file; preview, timeline and panels come in that order; buttons are finger-sized', async ({ page }) => {
    await page.goto('/video-editor');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import files/ }).tap();
    await (await chooser).setFiles(['e2e/fixtures/clip.mp4']);
    const file = page.getByRole('list', { name: 'Project files' }).getByRole('listitem').first();
    await expect(file).toBeVisible();
    await file.locator('p').first().tap({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('button', { name: 'Clip clip.mp4' })).toHaveCount(1);
    const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top + scrollY);
    const preview = await top('canvas[aria-label="Video preview"]');
    const timeline = await top('[aria-label="Timeline tracks"]');
    const panels = await top('[role="tablist"][aria-label="Panels"]');
    expect(preview).toBeLessThan(timeline);
    expect(timeline).toBeLessThan(panels);
    for (const name of ['Play', 'Remove clip.mp4 from the project', 'Add clip.mp4 to the timeline']) {
      const box = (await page.getByRole('button', { name, exact: true }).first().boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(32);
      expect(box.height, name).toBeGreaterThanOrEqual(30);
    }
    // Track buttons are a little narrower so the track column leaves room for the timeline.
    const eye = (await page.getByRole('button', { name: 'Hide Track 1', exact: true }).boundingBox())!;
    expect(eye.width).toBeGreaterThanOrEqual(28);
    expect(eye.height).toBeGreaterThanOrEqual(30);
    // The time is never cut off at the screen edge.
    const time = (await page.getByLabel('Current time').boundingBox())!;
    expect(time.x + time.width).toBeLessThanOrEqual(412);
  });
});
