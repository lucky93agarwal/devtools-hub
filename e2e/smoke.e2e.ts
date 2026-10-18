import { expect, test } from '@playwright/test';
import { typeInEditor, watchErrors } from './helpers';

// Smoke tests for every live page, using real mouse clicks and keyboard input
// against the production build. They catch pages that do not open or inputs
// that cannot be used, which the unit tests (with fake editors) cannot see.

/** Header link label, the page it opens and that page's H1. */
const NAV = [
  { label: 'JSON', path: '/json-formatter', heading: 'JSON Formatter and Validator' },
  { label: 'Compare', path: '/json-compare', heading: 'JSON Compare' },
  { label: 'Images', path: '/image-converter', heading: 'Image Converter' },
  { label: 'JWT', path: '/jwt', heading: /JWT/ },
  { label: 'JSON to Code', path: '/json-to-code', heading: 'JSON to Code' },
  { label: 'Data', path: '/data-converter', heading: 'Data Converter' },
];

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Developer tools that stay on your device',
  );
  await expect(page.getByRole('link', { name: /Background Remover/ })).toBeVisible();
});

test.describe('desktop header', () => {
  for (const link of NAV) {
    test(`opens ${link.path}`, async ({ page }) => {
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: link.label, exact: true })
        .click();
      await expect(page).toHaveURL(link.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(link.heading);
    });
  }

  // The background remover has no header link; it is opened from its home page card.
  test('opens /background-remover from the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Background Remover/ }).click();
    await expect(page).toHaveURL('/background-remover');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Background Remover');
  });
});

test.describe('mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const link of NAV) {
    test(`opens ${link.path}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page
        .locator('#mobile-menu')
        .getByRole('link', { name: link.label, exact: true })
        .click();
      await expect(page).toHaveURL(link.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(link.heading);
      await expect(page.locator('#mobile-menu')).toBeHidden();
    });
  }

  test('opens /background-remover from the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Background Remover/ }).click();
    await expect(page).toHaveURL('/background-remover');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Background Remover');
  });
});

test('JSON Formatter formats typed JSON', async ({ page }) => {
  await page.goto('/json-formatter');
  await typeInEditor(page, 'JSON input', '{"a":1}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Valid JSON');
});

// Moving the mouse loads Monaco before the first click. Clicks on the loaded editor
// must still place the cursor, also when coming back to it after pressing a button.
test('JSON Formatter editor works when clicked after it has loaded', async ({ page }) => {
  await page.goto('/json-formatter');
  await page.mouse.move(10, 300);
  await page.mouse.move(20, 320);
  await expect(
    page.locator('app-code-editor').first().locator('[aria-busy="false"]'),
  ).toBeVisible();

  await typeInEditor(page, 'JSON input', '[1,2]');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Valid JSON');

  await typeInEditor(page, 'JSON input', 'x');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Line 1');
});

test('JSON Compare compares the sample files', async ({ page }) => {
  await page.goto('/json-compare');
  await page.getByRole('button', { name: 'Two sample files' }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('#compare-status')).toContainText('Differences found');
});

test('JWT decodes the sample token and opens the Create tab', async ({ page }) => {
  await page.goto('/jwt');
  await page.getByRole('button', { name: 'Use a sample token' }).click();
  await expect(page.getByRole('heading', { name: 'Payload' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Header/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Create a token' }).click();
  await expect(page.getByRole('tab', { name: 'Create a token' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Algorithm')).toBeVisible();
});

test('Image Converter converts an uploaded PNG', async ({ page }) => {
  await page.goto('/image-converter');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  await (await chooser).setFiles('e2e/fixtures/small.png');

  await expect(page.getByText('small.png', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.getByRole('button', { name: /^Convert 1 image to/ }).click();
  await expect(page.getByText('1 of 1 converted.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download small.*\.webp$/ })).toBeVisible();
});

test('Image Converter opens HEIC, TIFF and SVG and saves every output format', async ({ page }) => {
  await page.goto('/image-converter');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  // Chromium cannot open HEIC or TIFF itself, so these use the bundled readers.
  const files = ['small.heic', 'small.tiff', 'small.svg'].map((name) => `e2e/fixtures/${name}`);
  await (await chooser).setFiles(files);
  await expect(page.getByText('3 / 15')).toBeVisible();

  for (const format of ['AVIF', 'GIF', 'BMP', 'TIFF', 'ICO', 'JPG']) {
    await page.getByRole('radio', { name: format, exact: true }).click();
    await page.getByRole('button', { name: `Convert 3 images to ${format}` }).click();
    await expect(page.getByText('3 of 3 converted.')).toBeVisible({ timeout: 30_000 });
  }
  // SVG has no pixel size of its own, so it is drawn at 1024 px.
  await expect(page.getByText(/1024×1024/)).toBeVisible();
});

test('JSON to Code writes classes as you type and switches language', async ({ page }) => {
  await page.goto('/json-to-code');
  await typeInEditor(page, 'JSON input', '{"user_name":"Ada","tags":["a"]}');
  await expect(page.getByText('Kotlin Serialization: 1 class.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('@SerialName("user_name") val userName: String');

  await page.getByLabel('Convert to').selectOption('typescript-interface');
  await expect(page).toHaveURL(/\?to=typescript-interface$/);
  await expect(page.locator('app-code-editor').nth(1)).toContainText('user_name: string;');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Root.ts' }).click();
  expect((await download).suggestedFilename()).toBe('Root.ts');
});

test('JSON to Code writes Dart and Go from the sample', async ({ page }) => {
  await page.goto('/json-to-code?to=dart');
  await page.getByRole('button', { name: 'Sample JSON' }).click();
  const output = page.locator('app-code-editor').nth(1);
  await expect(output).toContainText('final String userName;');

  await page.getByLabel('Convert to').selectOption('go');
  await expect(output).toContainText('json:"user_name"');
  await page.getByRole('checkbox', { name: 'Pointers for values that may be missing' }).uncheck();
  await expect(page.getByRole('button', { name: 'Root.go' })).toBeEnabled();
});

test('Data Converter turns typed JSON into YAML, then back, then into CSV', async ({ page }) => {
  await page.goto('/data-converter');
  await typeInEditor(page, 'Input', '{"name":"Ada","langs":["en"]}');
  const result = page.locator('app-code-editor').nth(1);
  await expect(page.getByText('Converted JSON to YAML.')).toBeVisible();
  await expect(result).toContainText('name: Ada');

  await page.getByRole('button', { name: 'Swap: convert the result back' }).click();
  await expect(page).toHaveURL(/from=yaml&to=json/);
  await expect(result).toContainText('"name": "Ada"');

  await page.locator('select').nth(1).selectOption('csv');
  await expect(result).toContainText('name,langs.0');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'data.csv' }).click();
  expect((await download).suggestedFilename()).toBe('data.csv');
});

test('Data Converter points at the line of an XML mistake', async ({ page }) => {
  await page.goto('/data-converter?from=xml&to=json');
  await typeInEditor(page, 'Input', '<a>\n<b>1</c>\n</a>');
  await expect(page.getByRole('button', { name: /Line 2, column \d+:/ })).toBeVisible();
});

test('XML Formatter formats typed XML and finds a broken tag', async ({ page }) => {
  await page.goto('/xml-formatter');
  await typeInEditor(page, 'XML input', '<a><b>1</b></a>');
  await expect(page.getByText('Valid XML.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('<b>1</b>');
  await page.getByRole('button', { name: 'XML with errors' }).click();
  await expect(page.getByRole('button', { name: /Line 4, column \d+:/ })).toBeVisible();
});

test('YAML Validator reports a tab and accepts the valid sample', async ({ page }) => {
  await page.goto('/yaml-validator');
  await page.getByRole('button', { name: 'YAML with errors' }).click();
  await expect(page.getByRole('button', { name: /Line 4, column \d+:/ })).toBeVisible();
  await page.getByRole('button', { name: 'Valid YAML' }).click();
  await expect(page.getByText('Valid YAML. 2 documents.')).toBeVisible();
});

test('App Icon Generator previews icons and downloads the ZIP', async ({ page }) => {
  await page.goto('/app-icon-generator');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText('Use at least 1024×1024 px')).toBeVisible();
  await expect(page.locator('ul img')).toHaveCount(4);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download 21 files (ZIP)' }).click();
  expect((await download).suggestedFilename()).toBe('app-icons.zip');
});

test('Image Resizer resizes a real image to a width and under a KB limit', async ({ page }) => {
  await page.goto('/image-resizer');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await page.getByPlaceholder('Auto').first().fill('200');
  await page.getByRole('button', { name: 'Resize 1 image' }).click();
  await expect(page.getByText(/400×300 to 200×150/)).toBeVisible();

  await page.getByLabel('Save as').selectOption('jpg');
  await page.getByPlaceholder('No limit').fill('5');
  await page.getByRole('button', { name: 'Resize 1 image' }).click();
  await expect(page.getByText(/to \d+×\d+ · JPG · [0-9.]+ (KB|B)/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download photo-\d+x\d+\.jpg$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^photo-\d+x\d+\.jpg$/);
});

test('Image Cropper crops with a dragged corner and a square shape', async ({ page }) => {
  await page.goto('/image-cropper');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText('Image: 400×300 px')).toBeVisible();

  // Drag the bottom-right corner up and left with the mouse.
  const area = page.getByRole('group', { name: /Crop area/ });
  await page.mouse.wheel(0, 300);
  await area.scrollIntoViewIfNeeded();
  const box = await area.boundingBox();
  await page.mouse.move(box!.x + box!.width, box!.y + box!.height);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 40, box!.y + box!.height - 40, { steps: 5 });
  await page.mouse.up();
  const width = Number(await page.getByLabel('width', { exact: true }).inputValue());
  expect(width).toBeLessThan(320);

  await page.getByRole('radio', { name: '1:1 square' }).click();
  const value = (label: string) => page.getByLabel(label, { exact: true }).inputValue();
  await expect.poll(async () => (await value('width')) === (await value('height'))).toBe(true);
  const side = await value('width');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${side}×${side}` }).click();
  expect((await download).suggestedFilename()).toBe(`photo-cropped-${side}x${side}.png`);
});

test('the old JSON to model address opens JSON to Code', async ({ page }) => {
  await page.goto('/json-to-model');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('JSON to Code');
});

test('Background Remover shows the upload box', async ({ page }) => {
  await page.goto('/background-remover');
  await expect(page.getByText('Drop an image here')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeEnabled();
});
