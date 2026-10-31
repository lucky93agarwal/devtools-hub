import { expect, test } from '@playwright/test';
import { typeInEditor, watchErrors } from './helpers';

// History and saved inputs, Your saved data (backup and restore), dropping files anywhere and keyboard shortcuts.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('History remembers inputs, saves one by name and puts it back', async ({ page }) => {
  await page.goto('/base64');
  const text = page.getByLabel('Text', { exact: true });
  await text.fill('first input');
  await page.waitForTimeout(1800);
  await text.fill('second input');
  await page.waitForTimeout(1800);

  await page.getByRole('button', { name: 'History' }).click();
  const menu = page.getByRole('dialog', { name: 'History and saved inputs' });
  await menu.getByLabel('Name for this input').fill('My sample');
  await menu.getByRole('button', { name: 'Save' }).click();
  await expect(menu.getByText('My sample')).toBeVisible();
  await menu.getByRole('button', { name: /first input/ }).click();
  await expect(text).toHaveValue('first input');

  // The saved input is listed on Your saved data and opens the tool with it.
  await page.goto('/your-data');
  await expect(page.getByText('My sample')).toBeVisible();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL('/base64');
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue('second input');
});

test('a backup can be downloaded and restored', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /^Encode and hash/ }).click();
  await page.getByRole('button', { name: 'Star Base64 Encode and Decode' }).click();
  await page.goto('/your-data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/^devtools24-backup-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole('button', { name: 'Clear my data…' }).click();
  await page.getByRole('button', { name: 'Yes, clear' }).click();
  await page.waitForURL('/your-data');
  expect(await page.evaluate(() => localStorage.getItem('dth-favourite-tools'))).toBeNull();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from file' }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByText(/Restored \d+ items/)).toBeVisible();
  await page.waitForLoadState('load');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dth-favourite-tools'))).toContain('base64');
});

test('a JSON file dropped on any page opens in the JSON Formatter', async ({ page }) => {
  await page.goto('/about');
  // Playwright cannot drag a file from the operating system, so the drop carries a real File object.
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['{"dropped": true}'], 'order.json', { type: 'application/json' }));
    return dt;
  });
  await page.dispatchEvent('main', 'dragover', { dataTransfer });
  await page.dispatchEvent('main', 'drop', { dataTransfer });
  await expect(page).toHaveURL('/json-formatter');
  await expect(page.getByRole('status')).toContainText('Opening order.json');
  await expect(page.locator('app-code-editor').first()).toContainText('"dropped"');
});

test('Ctrl+Enter runs the tool and ? shows the shortcuts', async ({ page }) => {
  await page.goto('/json-formatter');
  await typeInEditor(page, 'JSON input', '{"a":1}');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#json-status')).toContainText('Valid JSON');
  await page.locator('h1').click();
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
});
