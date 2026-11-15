import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The image tools added in the image batch, and the improvements to the older ones,
// each checked with real clicks and real files.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function choose(page: import('@playwright/test').Page, button: string, ...files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(files.map((f) => `e2e/fixtures/${f}`));
}

test('Favicon generator previews the icons, copies the tags and downloads a ZIP', async ({ page }) => {
  await page.goto('/favicon-generator');
  await choose(page, 'Choose image', 'photo.png');
  await expect(page.locator('li', { hasText: '180×180' }).locator('img')).toBeVisible();
  await expect(page.locator('pre')).toContainText('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">');
  await page.getByLabel('Corner rounding').fill('30');
  await page.getByRole('button', { name: 'Copy HTML' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP (8 files)' }).click();
  expect((await download).suggestedFilename()).toBe('favicons.zip');
});

test('Image compressor shrinks a PNG with colour reduction', async ({ page }) => {
  await page.goto('/image-compressor');
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();
  await choose(page, 'Choose images', 'photo.png', 'small.png');
  await page.getByRole('button', { name: 'Compress 2 images' }).click();
  const rows = page.getByRole('list', { name: 'Images' }).getByRole('listitem');
  await expect(rows.first()).toContainText(/smaller|already optimised/);
  await expect(rows.nth(1)).toContainText(/smaller|already optimised/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (ZIP)' }).click();
  expect((await download).suggestedFilename()).toBe('compressed-images.zip');
});

test('Image to Base64 encodes an image and decodes Base64 back', async ({ page }) => {
  await page.goto('/image-base64');
  await choose(page, 'Choose image', 'small.png');
  await expect(page.getByRole('textbox', { name: 'Data URI' })).toHaveValue(/^data:image\/png;base64,iVBOR/);
  await expect(page.getByRole('textbox', { name: 'CSS background' })).toHaveValue(/^background-image: url\("data:image\/png/);

  await page.getByRole('tab', { name: 'Base64 to image' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByRole('img', { name: 'Decoded image' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('image/svg+xml');
  await expect(page.getByRole('status')).toContainText('64×64 px');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .svg' }).click();
  expect((await download).suggestedFilename()).toBe('image.svg');

  await page.getByRole('textbox', { name: 'Base64 or data URI' }).fill('not base64!!');
  await expect(page.getByRole('alert')).toHaveText('This is not valid Base64.');
});

test('Watermark adds tiled text to an image and downloads it', async ({ page }) => {
  await page.goto('/watermark');
  await choose(page, 'Choose images', 'photo.png');
  const preview = page.getByRole('img', { name: 'Watermark preview' });
  await expect.poll(() => preview.evaluate((c: HTMLCanvasElement) => c.width)).toBe(400);
  await page.getByRole('textbox', { name: 'Watermark text' }).fill('Sample');
  await page.getByRole('checkbox', { name: /tile/ }).check();
  await page.getByLabel('Angle').fill('-30');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image' }).click();
  expect((await download).suggestedFilename()).toBe('photo-watermarked.png');
});

test('Colour palette finds colours, picks a pixel and exports CSS', async ({ page }) => {
  await page.goto('/color-palette');
  await choose(page, 'Choose image', 'photo.png');
  const swatches = page.getByRole('list', { name: 'Palette' }).getByRole('button');
  await expect(swatches.first()).toBeVisible();
  expect(await swatches.count()).toBeGreaterThan(1);
  await page.getByLabel('Number of colours').fill('4');
  await expect(swatches).toHaveCount(4);
  await page.getByRole('img', { name: /click to pick/ }).click();
  await expect(page.getByRole('button', { name: 'Copy picked colour' })).toBeVisible();
  await expect(page.getByLabel('Exported palette')).toContainText('--color-1: #');
  await page.getByLabel('Export format').selectOption('tailwind');
  await expect(page.getByLabel('Exported palette')).toContainText("100: '#");
});

test('Image inspector opens a HEIC photo and shows its details', async ({ page }) => {
  await page.goto('/image-inspector');
  await choose(page, 'Choose image', 'small.heic');
  await expect(page.locator('dt', { hasText: 'Real type' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'Preview' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'image/heic' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as PNG' }).click();
  expect((await download).suggestedFilename()).toBe('small-clean.png');
});

test('Image inspector reads PNG details', async ({ page }) => {
  await page.goto('/image-inspector');
  await choose(page, 'Choose image', 'photo.png');
  await expect(page.locator('dd', { hasText: '400 × 300 px' })).toBeVisible();
  await expect(page.locator('dd', { hasText: '4:3' })).toBeVisible();
  await expect(page.locator('dd', { hasText: '8 bits per channel' })).toBeVisible();
});

test('Image converter has quality presets and folder upload', async ({ page }) => {
  await page.goto('/image-converter');
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();
  await choose(page, 'Choose images', 'photo.png');
  await page.getByRole('radio', { name: 'JPG' }).click();
  await page.getByRole('button', { name: 'Smallest 60%' }).click();
  await expect(page.getByText('60%', { exact: true })).toBeVisible();
});

test('Code screenshot draws a Windows frame with a custom gradient', async ({ page }) => {
  await page.goto('/code-screenshot');
  const canvas = page.getByRole('img', { name: 'Code screenshot preview' });
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(500);
  await page.getByLabel('Window frame').selectOption('windows');
  await page.getByLabel('Background').selectOption('custom');
  await expect(page.getByLabel('Gradient start colour')).toBeVisible();
  await page.getByLabel('Shadow').selectOption('strong');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('Orders.kt.png');
});
