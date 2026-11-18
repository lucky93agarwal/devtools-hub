import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The second batch of image tools, each checked with real clicks, real files and real downloads.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

type Page = import('@playwright/test').Page;

async function choose(page: Page, button: string, ...files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(files);
}

const fixture = (name: string) => `e2e/fixtures/${name}`;

async function drag(page: Page, name: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByRole('img', { name }).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}

test('AI upscaler enlarges a small image 2x with the real model', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/image-upscaler');
  await choose(page, 'Choose image', fixture('small.png'));
  await expect(page.getByText('16×16 → 32×32 px')).toBeVisible();
  await page.getByRole('button', { name: 'Upscale' }).click();
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/32×32 px, .* in [\d.]+ s/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('small-2x.png');
});

test('Object remover fills a painted area and can undo it', async ({ page }) => {
  await page.goto('/object-remover');
  await choose(page, 'Choose image', fixture('photo.png'));
  await drag(page, 'Photo being edited', [0.45, 0.45], [0.55, 0.55]);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('photo-edited.png');
});

test('Smart cropper makes crops for the chosen sizes', async ({ page }) => {
  await page.goto('/smart-crop');
  await choose(page, 'Choose image', fixture('photo.png'));
  const crops = page.getByRole('list', { name: 'Crops' }).getByRole('listitem');
  await expect(crops).toHaveCount(4);
  await page.getByRole('checkbox', { name: /Profile picture/ }).check();
  await expect(crops).toHaveCount(5);
  await drag(page, 'YouTube thumbnail crop', [0.5, 0.5], [0.3, 0.5]);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (5)' }).click();
  expect((await download).suggestedFilename()).toBe('photo-crops.zip');
});

test('ASCII art converter makes art and copies Markdown', async ({ page }) => {
  await page.goto('/ascii-art');
  await choose(page, 'Choose image', fixture('photo.png'));
  const art = page.getByLabel('ASCII art', { exact: true });
  await expect(art).not.toBeEmpty();
  await page.getByLabel('Character set').selectOption('blocks');
  await expect(art).toContainText(/[░▒▓█]/);
  await page.getByRole('button', { name: 'Copy Markdown' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^```text\n/);
});

test('Colour blindness simulator shows four simulations', async ({ page }) => {
  await page.goto('/color-blindness-simulator');
  await choose(page, 'Choose image', fixture('photo.png'));
  for (const name of ['Normal vision', 'Protanopia', 'Deuteranopia', 'Tritanopia', 'Achromatopsia']) {
    await expect.poll(() => page.getByRole('img', { name, exact: true }).evaluate((c: HTMLCanvasElement) => c.width)).toBe(400);
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Deuteranopia' }).click();
  expect((await download).suggestedFilename()).toBe('photo-deuteranopia.png');
});

test('EXIF remover cleans photos without re-encoding', async ({ page }) => {
  await page.goto('/exif-remover');
  await choose(page, 'Choose photos', fixture('photo.png'), fixture('small.heic'));
  await page.getByRole('button', { name: 'Remove metadata from 2 photos' }).click();
  const rows = page.getByRole('list', { name: 'Photos' }).getByRole('listitem');
  await expect(rows.first()).toContainText('Clean');
  await expect(rows.nth(1)).toContainText('saved as a new JPG', { timeout: 30_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all' }).click();
  expect((await download).suggestedFilename()).toBe('clean-photos.zip');
});

test('Redactor pixelates a dragged area and downloads', async ({ page }) => {
  await page.goto('/image-redactor');
  await choose(page, 'Choose image', fixture('photo.png'));
  await drag(page, 'Image being redacted', [0.2, 0.2], [0.5, 0.5]);
  await expect(page.getByText('1 area hidden')).toBeVisible();
  await page.getByRole('radio', { name: 'Blur' }).click();
  await drag(page, 'Image being redacted', [0.6, 0.6], [0.9, 0.9]);
  await expect(page.getByText('2 areas hidden')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('1 area hidden')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('photo-redacted.png');
});

test('Annotator draws an arrow, a step and meme text', async ({ page }) => {
  await page.goto('/image-annotator');
  await choose(page, 'Choose image', fixture('photo.png'));
  await drag(page, 'Image being annotated', [0.2, 0.8], [0.6, 0.3]);
  await page.getByRole('radio', { name: 'Step' }).click();
  await page.getByRole('img', { name: 'Image being annotated' }).click({ position: { x: 40, y: 40 } });
  await page.getByText('Meme captions', { exact: true }).click();
  await page.getByLabel('Top text').fill('when the build is green');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('photo-annotated.png');
});

test('Sprite sheet generator packs images and writes CSS', async ({ page }) => {
  await page.goto('/sprite-sheet-generator');
  await choose(page, 'Choose images', fixture('small.png'), fixture('photo.png'), fixture('small.svg'));
  await expect(page.getByText('3 images')).toBeVisible();
  await expect(page.getByLabel('CSS', { exact: true })).toContainText('.icon-small {');
  await page.getByLabel('Layout').selectOption('horizontal');
  await page.getByLabel('CSS prefix').fill('sp');
  await expect(page.getByLabel('CSS', { exact: true })).toContainText('.sp-photo {');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP (PNG, CSS, JSON)' }).click();
  expect((await download).suggestedFilename()).toBe('sprite-sheet.zip');
});

test('Image to PDF makes a PDF that PDF to image opens again', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await choose(page, 'Choose images', fixture('photo.png'), fixture('small.heic'));
  const pages = page.getByRole('list', { name: 'Pages' }).getByRole('listitem');
  await expect(pages).toHaveCount(2);
  await page.getByRole('button', { name: 'Move photo.png down' }).click();
  await expect(pages.first()).toContainText('small.heic');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF (2 pages)' }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toBe('images.pdf');
  // The download is saved without its name, so keep a copy that ends in .pdf.
  const path = test.info().outputPath('images.pdf');
  await pdf.saveAs(path);

  await page.goto('/pdf-to-image');
  await page.getByLabel('Format').selectOption('png');
  await choose(page, 'Choose PDF', path);
  const images = page.getByRole('list', { name: 'Pages' }).getByRole('listitem');
  await expect(images).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();
  const zip = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (2 PNG as ZIP)' }).click();
  expect((await zip).suggestedFilename()).toBe('images-pages.zip');
});
