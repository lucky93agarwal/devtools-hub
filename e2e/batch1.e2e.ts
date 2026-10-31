import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// The fifteen tools added together on 1 November 2026, each checked with real clicks and typing.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('JSON Schema Validator lists the problems in the sample', async ({ page }) => {
  await page.goto('/json-schema-validator');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const status = page.locator('#schema-status');
  await expect(status).toContainText('problems found');
  await expect(status).toContainText('/items/0/qty');
  await page.getByRole('button', { name: 'Make a schema from my JSON' }).click();
  await expect(status).toContainText('Valid');
});

test('String Escape unescapes a JSON string', async ({ page }) => {
  await page.goto('/string-escape');
  await page.getByLabel('Escaped text').fill('He said \\"hi\\"\\nCaf\\u00e9');
  await expect(page.getByLabel('Result')).toHaveValue('He said "hi"\nCafé');
  await page.getByRole('radio', { name: 'Escape', exact: true }).click();
  await page.getByLabel('Plain text').fill('<b>');
  await page.getByLabel('Text is for').selectOption('html');
  await expect(page.getByLabel('Result')).toHaveValue('&lt;b&gt;');
});

test('Password generator makes five passwords of the chosen length', async ({ page }) => {
  await page.goto('/password-generator');
  const values = page.getByRole('list', { name: 'Generated values' }).locator('code');
  await expect(values).toHaveCount(5);
  await expect(values.first()).toHaveText(/^\S{20}$/);
  await page.getByRole('tab', { name: 'Secret key' }).click();
  await expect(values.first()).toHaveText(/^[\w-]{43}$/);
});

test('bcrypt tool hashes a password and verifies it', async ({ page }) => {
  await page.goto('/bcrypt-generator');
  await page.getByLabel('Password').fill('s3cret');
  await page.getByLabel('bcrypt cost').fill('4');
  await page.getByRole('button', { name: 'Hash', exact: true }).click();
  const hash = page.getByLabel('Hash', { exact: true });
  await expect(hash).toHaveText(/^\$2a\$04\$/);
  const value = await hash.innerText();
  await page.getByRole('tab', { name: 'Verify' }).click();
  await page.getByLabel('Stored hash').fill(value);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Match: this password produces the hash.')).toBeVisible();
});

test('dp converter shows pixels at every density', async ({ page }) => {
  await page.goto('/screen-units');
  await expect(page.getByText('144px', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '192 px' })).toBeVisible();
});

test('Localization converter turns Android strings into iOS strings', async ({ page }) => {
  await page.goto('/localization-converter');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('5 strings converted.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('Welcome back, %1$@!');
});

test('Markdown editor previews and makes a table', async ({ page }) => {
  await page.goto('/markdown-editor');
  const preview = page.getByRole('article', { name: 'Preview' });
  await expect(preview.getByRole('heading', { name: 'Release 2.4' })).toBeVisible();
  await expect(preview.locator('table')).toBeVisible();
  await page.getByLabel('Table cells').fill('Name\tRole\nAda\tEngineer');
  await expect(page.getByLabel('Markdown table')).toContainText('| Ada  | Engineer |');
});

test('docker run converts to Compose', async ({ page }) => {
  await page.goto('/docker-compose-converter');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const out = page.locator('app-code-editor').nth(1);
  await expect(out).toContainText('container_name: shop-db');
  await expect(out).toContainText('healthcheck:');
});

test('Semver calculator explains a caret range', async ({ page }) => {
  await page.goto('/semver-calculator');
  await expect(page.getByText('1.2.3 or later and before 2.0.0')).toBeVisible();
  await expect(page.getByText('npm would install 1.9.9.')).toBeVisible();
  await page.getByLabel('Version range').fill('~1.2.3');
  await expect(page.getByText('1 of 6 versions match')).toBeVisible();
});

test('HTTP reference finds status codes and headers', async ({ page }) => {
  await page.goto('/http-reference');
  await page.getByLabel('Search the reference').fill('rate limit');
  await expect(page.getByText('Too Many Requests')).toBeVisible();
  await page.getByRole('tab', { name: 'MIME types' }).click();
  await page.getByLabel('Search the reference').fill('apk');
  await expect(page.getByText('application/vnd.android.package-archive')).toBeVisible();
});

test('Date calculator counts the days between dates and reads durations', async ({ page }) => {
  await page.goto('/date-calculator');
  await page.getByLabel('Start').fill('2026-01-31');
  await page.getByLabel('End').fill('2026-03-01');
  await expect(page.getByText('0 years, 1 month, 1 day')).toBeVisible();
  await page.getByRole('textbox', { name: 'ISO 8601 duration' }).fill('PT1H30M');
  await expect(page.getByText('1 hour, 30 minutes')).toBeVisible();
});

test('User-Agent parser spots Googlebot', async ({ page }) => {
  await page.goto('/user-agent-parser');
  await page.getByRole('button', { name: 'Googlebot' }).click();
  await expect(page.getByText('Googlebot (Google Search)')).toBeVisible();
});

test('Data size converter converts and times a download', async ({ page }) => {
  await page.goto('/data-size-converter');
  await page.getByLabel('Size', { exact: true }).fill('1 GiB');
  await expect(page.getByText('1,024', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '1 min 26 s' })).toBeVisible();
});

test('AES encrypts and decrypts with a password', async ({ page }) => {
  await page.goto('/aes-encryption');
  await page.getByLabel('Password').fill('pa55');
  await page.getByLabel('Text to encrypt').fill('top secret');
  await page.getByRole('button', { name: 'Encrypt' }).click();
  await expect(page.getByLabel('Result')).not.toHaveValue('');
  await page.getByRole('tab', { name: 'Decrypt' }).click();
  await page.getByRole('button', { name: 'Decrypt' }).click();
  await expect(page.getByLabel('Result')).toHaveValue('top secret', { timeout: 15_000 });
});

test('TOTP generator shows a code and reads an otpauth link', async ({ page }) => {
  await page.goto('/totp-generator');
  await expect(page.getByText(/^\d{6}$/).first()).toBeVisible();
  await page.getByLabel(/Secret \(Base32\)/).fill('otpauth://totp/ACME:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ACME&digits=8');
  await expect(page.getByLabel('Issuer (your app or company)')).toHaveValue('ACME');
  await expect(page.getByText(/^\d{8}$/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for authenticator apps' })).toBeVisible();
});
