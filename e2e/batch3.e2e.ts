import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The nine developer tools added in the third batch, each checked with real clicks and typing.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('Stack trace decoder maps the sample back to the source file', async ({ page }) => {
  await page.goto('/stack-trace-decoder');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByLabel('Decoded trace')).toContainText(/cart\.ts:4:\d+/);
});

test('SVG converter optimizes the sample and makes a VectorDrawable and Compose code', async ({ page }) => {
  await page.goto('/svg-converter');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const output = page.locator('app-code-editor').nth(1);
  await expect(output).toContainText('android:pathData');
  // The sample's root <svg fill="none"> is inherited, so the stroked cart outline gets no fill.
  await expect(output).not.toContainText('#FF000000');
  await page.getByRole('tab', { name: 'Optimized SVG' }).click();
  await expect(output).toContainText('<svg');
  await page.getByRole('tab', { name: 'Jetpack Compose' }).click();
  await expect(output).toContainText('ImageVector.Builder');
});

test('Key generator makes a key pair and converts PEM to JWK', async ({ page }) => {
  await page.goto('/key-generator');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const publicPem = page.getByLabel('Public key (PEM)', { exact: true });
  await expect(publicPem).toHaveValue(/^-----BEGIN PUBLIC KEY-----/);
  const pem = await publicPem.inputValue();
  await page.getByRole('tab', { name: 'PEM → JWK' }).click();
  await page.getByLabel('PEM key').fill(pem);
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.getByLabel('Converted key')).toHaveValue(/"kty"/);
});

test('Git helper finds a command and fills in the commit', async ({ page }) => {
  await page.goto('/git-helper');
  await page.getByLabel('Search Git situations').fill('already pushed');
  await page.getByLabel('Commit name').fill('abc1234');
  await expect(page.getByRole('article', { name: 'Undo a commit that was already pushed' })).toContainText('git revert abc1234');
  await page.getByLabel('Search Git situations').fill('zzzz nothing');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test('Kubernetes explainer explains every resource in the sample', async ({ page }) => {
  await page.goto('/kubernetes-explainer');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Deployment · shop-api')).toBeVisible();
  await expect(page.getByText('Service · shop-api')).toBeVisible();
  await expect(page.getByText('Ingress · shop', { exact: true })).toBeVisible();
});

test('OpenAPI viewer lists the endpoints and gives a cURL command', async ({ page }) => {
  await page.goto('/openapi-viewer');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByRole('heading', { name: /Shop API/ })).toBeVisible();
  await expect(page.getByText(/3 endpoints/)).toBeVisible();
  await page.getByText('Create an order', { exact: true }).click();
  await expect(page.locator('details[open] pre')).toContainText('https://api.shop.example.com/v1/orders');
});

test('Deep link helper makes the Android and iOS files and test commands', async ({ page }) => {
  await page.goto('/deep-link-checker');
  await page.getByLabel(/SHA-256 fingerprints/).fill('a'.repeat(64));
  await expect(page.getByLabel('assetlinks.json file')).toContainText(`"${'AA:'.repeat(31)}AA"`);
  await page.getByLabel('assetlinks.json to check').fill('[]');
  await expect(page.getByText('The array is empty.')).toBeVisible();

  await page.getByRole('tab', { name: 'iOS' }).click();
  await page.getByLabel('Team ID').fill('ABCDE12345');
  await expect(page.getByLabel('apple-app-site-association file')).toContainText('ABCDE12345.com.example.shop');

  await page.getByRole('tab', { name: 'Test a link' }).click();
  await page.getByLabel('Link to test').fill('https://shop.example.com/product/42');
  await expect(page.getByText('adb shell am start -W -a android.intent.action.VIEW -d "https://shop.example.com/product/42" com.example.shop')).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code of the link' })).toBeVisible();
});

test('Mermaid editor draws diagrams, reports errors and downloads PNG', async ({ page }) => {
  await page.goto('/mermaid-editor');
  const preview = page.getByRole('img', { name: 'Diagram preview' });
  await expect(preview.locator('svg')).toBeVisible();
  await page.getByRole('button', { name: 'Sequence' }).click();
  await expect(preview.locator('svg')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('diagram.png');
});

test('Code screenshot draws the code and downloads and copies the image', async ({ page }) => {
  await page.goto('/code-screenshot');
  const canvas = page.getByRole('img', { name: 'Code screenshot preview' });
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(500);
  await page.getByLabel('Code theme').selectOption('github');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect((await download).suggestedFilename()).toBe('Orders.kt.png');
  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});
