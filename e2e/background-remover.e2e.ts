import { devices, expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The background remover on a phone-sized screen with touch, running the real model
// (served by this site) on a real upload.

test.use({ ...devices['Pixel 7'] });

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function upload(page: import('@playwright/test').Page, file: string) {
  await page.goto('/background-remover');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles(`e2e/fixtures/${file}`);
}

test('removes a background and downloads the PNG', async ({ page }) => {
  test.setTimeout(120_000);
  await upload(page, 'photo.png');
  await expect(page.getByText('Drag the divider to compare. 400×300 px.')).toBeVisible({ timeout: 90_000 });

  // The slider works with touch-sized controls.
  const slider = page.getByRole('slider', { name: 'Compare before and after' });
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuetext', '49% before');

  await page.getByRole('radio', { name: 'Colour' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('photo-new-background.png');

  // A second image reuses the model that is already loaded.
  await page.getByRole('button', { name: 'Try another image' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText('Preparing the background remover')).toHaveCount(0);
  await expect(page.getByText('Drag the divider to compare.')).toBeVisible({ timeout: 60_000 });
});

test('explains an image that is too small, without downloading the model', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/models/')) modelRequests.push(request.url());
  });
  await upload(page, 'small.png');
  await expect(page.getByText('This image is only 16×16 px. Use one at least 32 px on each side.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeVisible();
  expect(modelRequests).toEqual([]);
});

test('cancels while the model is working', async ({ page }) => {
  await upload(page, 'photo.png');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeVisible();
  await expect(page.getByText('Cancelled')).toHaveCount(0);
});
