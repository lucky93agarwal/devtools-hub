import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The 3D photo maker with the real depth model (served by this site), a real photo and a real video download.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test('makes a 3D photo, follows the mouse, and downloads the depth map and a video', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/photo-3d');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText(/Depth worked out in [\d.]+ s/)).toBeVisible({ timeout: 150_000 });

  const view = page.getByRole('img', { name: '3D photo' });
  await expect.poll(() => view.evaluate((c: HTMLCanvasElement) => c.width)).toBe(400);
  const box = (await view.boundingBox())!;
  const before = await view.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 10 });
  await expect.poll(() => view.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);

  await page.getByLabel('Show depth map').check();
  await expect(page.getByRole('img', { name: 'Depth map' })).toBeVisible();
  const depth = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download depth map' }).click();
  expect((await depth).suggestedFilename()).toBe('photo_depth.png');

  await page.getByLabel('Movement').selectOption('sway');
  await page.getByLabel('Loop length').fill('2');
  const video = page.waitForEvent('download', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Download video' }).click();
  expect((await video).suggestedFilename()).toMatch(/^photo-3d\.(mp4|webm)$/);
});
