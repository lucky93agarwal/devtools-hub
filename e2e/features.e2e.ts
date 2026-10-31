import { expect, test } from '@playwright/test';
import { typeInEditor, watchErrors } from './helpers';

// Smart Paste, the Ctrl+K search, starred tools, share links, the four newest tools and offline use,
// with real clicks and typing against the production build.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSJ9.qH8mQvC3mHbHqZ1y8n3Vf1rWw1VJmVbVnUcEo1q2Ylk';

test('Smart Paste recognises a JWT and opens it in the JWT tool', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/Smart Paste/).fill(JWT);
  await expect(page.getByText('JSON Web Token (JWT)')).toBeVisible();
  await page.getByRole('button', { name: /Decode and verify this JWT/ }).click();
  await expect(page).toHaveURL('/jwt');
  await expect(page.getByLabel('Encoded token')).toHaveValue(JWT);
  await expect(page.getByRole('heading', { name: 'Payload' })).toBeVisible();
});

test('Smart Paste sends a timestamp to the converter', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/Smart Paste/).fill('1730000000');
  await page.getByRole('button', { name: /Convert to a date/ }).click();
  await expect(page).toHaveURL('/timestamp-converter');
  await expect(page.getByText('2024-10-27T03:33:20.000Z')).toBeVisible();
});

test('Ctrl+K finds and opens a tool with the keyboard', async ({ page }) => {
  await page.goto('/json-formatter');
  const search = page.getByRole('combobox', { name: 'Search tools' });
  // Typing / in a code editor is text, not the shortcut.
  await typeInEditor(page, 'JSON input', '"a/b"');
  await expect(search).toBeHidden();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await page.keyboard.type('cron');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cron-expression');
  // The header button opens it too, and Escape closes it.
  await page.getByRole('button', { name: 'Search tools' }).click();
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
});

test('starred and recent tools show on the home page and survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Star Regex Tester' }).click();
  await expect(page.getByRole('button', { name: 'Unstar Regex Tester' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /^Hash Generator/ }).click();
  await expect(page).toHaveURL('/hash-generator');
  await page.goto('/');
  const yours = page.getByRole('region', { name: 'Your tools' });
  await expect(yours.getByRole('link', { name: 'Regex' })).toBeVisible();
  await expect(yours.getByRole('link', { name: 'Hash' })).toBeVisible();
});

test('a share link opens the tool with the same input', async ({ page, context }) => {
  await page.goto('/base64');
  await page.getByLabel('Text', { exact: true }).fill('shared via link ✓');
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/base64#share=[\w-]+$/);
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByLabel('Text', { exact: true })).toHaveValue('shared via link ✓');
  await expect(other).toHaveURL(/\/base64$/);
});

test('Regex tester highlights matches and stops a runaway pattern', async ({ page }) => {
  await page.goto('/regex-tester');
  await page.getByRole('button', { name: 'Indian mobile' }).click();
  await expect(page.getByText('2 matches.')).toBeVisible();
  await expect(page.locator('mark')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Pattern', exact: true }).fill('^(a+)+$');
  await page.getByLabel('Test text', { exact: true }).fill('a'.repeat(40) + '!');
  await expect(page.getByText(/took more than 1\.5 seconds and was stopped/)).toBeVisible({ timeout: 10_000 });
});

test('JSONPath and jq run on the sample', async ({ page }) => {
  await page.goto('/json-query');
  await page.getByRole('button', { name: /\$\.store\.book\[\?\(@\.price < 10\)\]/ }).click();
  await expect(page.locator('#query-status')).toContainText('2 results.');
  await page.getByRole('tab', { name: 'jq' }).click();
  await page.getByLabel('jq filter').fill('[.store.book[].price] | add');
  await expect(page.locator('#query-status')).toContainText('Done.', { timeout: 15_000 });
  await expect(page.locator('app-code-editor').nth(1)).toContainText('53.92');
});

test('Mock data generator makes CSV records', async ({ page }) => {
  await page.goto('/mock-data-generator');
  await page.getByLabel('Records').fill('3');
  await page.getByLabel('Records').press('Tab');
  await page.getByLabel('Format').selectOption('csv');
  await expect(page.getByText('3 records made from the sample record.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('id,name,email');
});

test('Certificate decoder reads the sample certificate', async ({ page }) => {
  await page.goto('/certificate-decoder');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByRole('heading', { name: 'test.devtools24.in' })).toBeVisible();
  await expect(page.getByText('DNS: *.test.devtools24.in')).toBeVisible();
  await expect(page.getByText('52:A6:99:D4:D6:20:6D:10:77:1E:AD:76:8B:C0:B3:CA:70:1F:2C:66:99:62:E6:B8:5F:40:FB:9F:A2:98:6E:91')).toBeVisible();
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a tool opened once keeps working without a connection', async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.goto('/base64');
    // Wait until the service worker controls the page, then load once more so the tool's code is cached.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 45_000 }).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode and Decode');

    await context.setOffline(true);
    await page.goto('/base64');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode and Decode');
    await page.getByLabel('Text', { exact: true }).fill('offline');
    await expect(page.getByLabel('Result')).toHaveValue('b2ZmbGluZQ==');
    await context.setOffline(false);
  });
});
