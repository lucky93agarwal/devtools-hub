import { expect, test } from '@playwright/test';
import { typeInEditor, watchErrors } from './helpers';

// Smoke tests for the developer utilities (encoders, generators, converters and text tools),
// with real clicks and typing against the production build.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

/** Copy buttons write to the clipboard, which needs permission in a test browser. */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('home page groups the tools and links to the new ones', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /^Encode and hash/ }).click();
  await page.getByRole('tabpanel').getByRole('link', { name: /^Hash Generator/ }).click();
  await expect(page).toHaveURL('/hash-generator');
  // The links above each tool lead to the others in its group.
  await page.getByRole('navigation', { name: 'Encode and hash' }).getByRole('link', { name: 'Base64' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode and Decode');
});

test('Base64 encodes, then decodes the result', async ({ page }) => {
  await page.goto('/base64');
  await page.getByLabel('Text', { exact: true }).fill('héllo ✓');
  await expect(page.getByLabel('Result')).toHaveValue('aMOpbGxvIOKckw==');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await page.getByRole('tab', { name: 'Decode' }).click();
  await expect(page.getByLabel('Base64', { exact: true })).toHaveValue('aMOpbGxvIOKckw==');
  await expect(page.getByLabel('Result')).toHaveValue('héllo ✓');
});

test('Base64 decodes an image and offers it as a file', async ({ page }) => {
  await page.goto('/base64');
  await page.getByRole('tab', { name: 'Decode' }).click();
  await page.getByLabel('Base64', { exact: true }).fill('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  await expect(page.getByText('Binary data: image/png')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .png' }).click();
  expect((await download).suggestedFilename()).toBe('decoded.png');
});

test('URL encoder encodes text and edits the parameters of a URL', async ({ page }) => {
  await page.goto('/url-encoder');
  await page.getByLabel('Text', { exact: true }).fill('café & bar');
  await expect(page.getByLabel('Result')).toHaveValue('caf%C3%A9%20%26%20bar');
  await page.getByRole('button', { name: 'Try a sample URL' }).click();
  await expect(page.getByLabel('Value of parameter 1')).toHaveValue('café & bar');
  await page.getByLabel('Value of parameter 3').fill('3');
  await expect(page.getByText(/page=3#results/)).toBeVisible();
});

test('Hash generator hashes text and finds a matching checksum', async ({ page }) => {
  await page.goto('/hash-generator');
  await page.getByLabel('Text').fill('abc');
  await expect(page.getByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBeVisible();
  await page.getByLabel(/Compare with a checksum/).fill('900150983CD24FB0D6963F7D28E17F72');
  await expect(page.getByText('Matches the MD5 hash.')).toBeVisible();
  await page.getByLabel(/HMAC secret key/).fill('key');
  await expect(page.getByRole('heading', { name: 'HMAC values' })).toBeVisible();
});

test('Hash generator hashes a file', async ({ page }) => {
  await page.goto('/hash-generator');
  await page.getByRole('tab', { name: 'File' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file' }).click();
  await (await chooser).setFiles('e2e/fixtures/small.png');
  await expect(page.getByText('small.png')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'CRC32' }).locator('code')).toHaveText(/^[0-9a-f]{8}$/);
});

test('UUID generator makes ids and inspects one', async ({ page }) => {
  await page.goto('/uuid-generator');
  const ids = page.getByLabel('Generated ids');
  await expect(ids).toHaveValue(/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n){4}[0-9a-f-]{36}$/);
  await page.getByRole('radio', { name: 'UUID v7' }).click();
  await expect(ids).toHaveValue(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  await page.getByRole('radio', { name: 'ULID' }).click();
  await page.getByLabel('UUID or ULID to inspect').fill('01ARYZ6S41TSV4RRFFQ69G5FAV');
  await expect(page.getByText('2016-07-30T22:36:16.385Z')).toBeVisible();
});

test('QR code generator draws a code and downloads it', async ({ page }) => {
  await page.goto('/qr-code-generator');
  await expect(page.getByRole('img', { name: 'QR code preview' })).toBeVisible();
  await page.getByRole('tab', { name: 'Wi-Fi' }).click();
  await page.getByLabel('Network name (SSID)').fill('Office');
  await page.getByLabel('Password').fill('s3cret;pass');
  await expect(page.getByText(/modules ·/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG' }).click();
  expect((await download).suggestedFilename()).toBe('qr-code.png');
});

test('.gitignore generator joins templates', async ({ page }) => {
  await page.goto('/gitignore-generator');
  await page.getByRole('button', { name: 'Angular + VS Code + macOS' }).click();
  const file = page.getByLabel('.gitignore file');
  await expect(file).toHaveValue(/### Node ###[\s\S]*node_modules\//);
  await expect(file).toHaveValue(/### macOS ###[\s\S]*\.DS_Store/);
  await page.getByPlaceholder('Search, for example node or jetbrains').fill('rust');
  await page.getByRole('checkbox', { name: 'Rust' }).check();
  await expect(file).toHaveValue(/### Rust ###/);
});

test('Timestamp converter turns a timestamp into dates', async ({ page }) => {
  await page.goto('/timestamp-converter');
  await expect(page.getByText(/^\d{10}$/).first()).toBeVisible();
  await page.getByLabel('Unix timestamp or date').fill('1730000000');
  await expect(page.getByText('2024-10-27T03:33:20.000Z')).toBeVisible();
  await page.getByLabel('Time zone').selectOption('Asia/Kolkata');
  await expect(page.getByText('2024-10-27T09:03:20.000+05:30')).toBeVisible();
});

test('Cron explainer describes a schedule and lists its next runs', async ({ page }) => {
  await page.goto('/cron-expression');
  const input = page.getByRole('textbox', { name: 'Cron expression' });
  await input.fill('*/15 * * * *');
  await expect(page.getByText(/Every 15 minutes/)).toBeVisible();
  await expect(page.locator('section[aria-labelledby="runs-heading"] li')).toHaveCount(10);
  await input.fill('60 * * * *');
  await expect(page.getByText('“60” is not a valid minute (0 to 59).')).toBeVisible();
});

test('Number base converter converts between bases', async ({ page }) => {
  await page.goto('/number-base-converter');
  await page.getByLabel(/^Hexadecimal/).fill('ff');
  await expect(page.getByLabel(/^Decimal/)).toHaveValue('255');
  await expect(page.getByLabel(/^Binary/)).toHaveValue('1111 1111');
  await expect(page.getByText('Signed (two’s complement)').locator('..')).toContainText('-1');
});

test('Chmod calculator turns ticks into a number', async ({ page }) => {
  await page.goto('/chmod-calculator');
  await page.getByLabel('Permissions').fill('644');
  await expect(page.getByText('rw-r--r--')).toBeVisible();
  await page.getByRole('checkbox', { name: 'owner execute' }).check();
  await expect(page.getByLabel('Permissions')).toHaveValue('744');
  await expect(page.getByText('chmod 744 file', { exact: true })).toBeVisible();
});

test('Color converter converts and checks contrast', async ({ page }) => {
  await page.goto('/color-converter');
  await page.getByLabel('Colour', { exact: true }).fill('#ff0000');
  await expect(page.getByText('rgb(255 0 0)')).toBeVisible();
  await expect(page.getByText('Color(0xFFFF0000)').first()).toBeVisible();
  await expect(page.getByText(/^\d+(\.\d+)?:1$/)).toBeVisible();
});

test('CIDR calculator works out a block and checks an address', async ({ page }) => {
  await page.goto('/cidr-calculator');
  await page.getByLabel('CIDR block or address').fill('192.168.1.130/26');
  await expect(page.getByText('Broadcast address', { exact: true }).locator('..')).toContainText('192.168.1.191');
  await page.getByLabel(/IP address to check/).fill('192.168.1.150');
  await expect(page.getByText('Yes, 192.168.1.150 is in 192.168.1.128/26.')).toBeVisible();
});

test('Text diff compares the sample texts', async ({ page }) => {
  await page.goto('/text-diff');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('#diff-status')).toContainText('Differences in');
});

test('Case converter shows every naming style', async ({ page }) => {
  await page.goto('/case-converter');
  await page.getByLabel('Text', { exact: true }).fill('user profile id');
  await expect(page.getByText('userProfileId', { exact: true })).toBeVisible();
  await expect(page.getByText('USER_PROFILE_ID', { exact: true })).toBeVisible();
});

test('SQL formatter formats a typed query', async ({ page }) => {
  await page.goto('/sql-formatter');
  await typeInEditor(page, 'SQL input', 'select id, name from users where active = 1');
  await expect(page.locator('#sql-status')).toContainText('Formatted.');
  await expect(page.locator('app-code-editor').nth(1)).toContainText('FROM');
});

test('Code beautifier beautifies and minifies', async ({ page }) => {
  await page.goto('/code-beautifier');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('#code-status')).toContainText('Beautified.');
  await page.getByRole('radio', { name: 'Minify' }).click();
  await expect(page.locator('#code-status')).toContainText('smaller');
});

test('.env converter converts the sample and warns about a duplicate', async ({ page }) => {
  await page.goto('/env-converter');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('6 variables converted.')).toBeVisible();
  await expect(page.getByText('PORT was already set on line 3. The last value wins.')).toBeVisible();
  await page.getByLabel('Convert to').selectOption('secret');
  await expect(page.locator('app-code-editor').nth(1)).toContainText('kind: Secret');
});

test('cURL to Code converts a command to Go', async ({ page }) => {
  await page.goto('/curl-to-code');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('POST https://api.example.com/v1/orders?status=paid with 2 headers and a body')).toBeVisible();
  await page.getByRole('button', { name: 'Go - Native' }).click();
  await expect(page.locator('app-code-editor')).toContainText('http.NewRequest');
});
