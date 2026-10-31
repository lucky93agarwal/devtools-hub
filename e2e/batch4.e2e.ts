import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// Recipes, Kotlin Playground and DartPad. Outside services are stubbed, so the tests need no network.

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('Recipes chain steps, save a recipe and open the result in a tool', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue(/"user": "asha"/);
  await page.getByRole('button', { name: 'Clean a list: trim, de-duplicate, sort' }).click();
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue('apple\nbanana\ncherry');
  await page.getByLabel('Add a step').selectOption('upper');
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue('APPLE\nBANANA\nCHERRY');
  await page.getByRole('button', { name: 'Remove Sort lines' }).click();
  await expect(page.getByLabel('Recipe steps').getByRole('listitem')).toHaveCount(3);

  await page.getByLabel('Recipe name').fill('Tidy list');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tidy list', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Read a Base64 JSON value' }).click();
  await page.locator('#recipe-input').fill('not base64!');
  await expect(page.getByRole('alert')).toContainText('not a Base64 character');
  await page.getByRole('button', { name: 'Read a URL-encoded JSON parameter' }).click();
  await page.getByRole('button', { name: 'JSON Formatter', exact: true }).click();
  await expect(page).toHaveURL('/json-formatter');
  await expect(page.locator('app-code-editor').first()).toContainText('"paid"');
});

test('Kotlin Playground loads the editor and switches samples', async ({ page }) => {
  await page.route('https://api.kotlinlang.org/**', (route) =>
    route.fulfill({ json: [{ version: '2.2.0', latestStable: true }] }),
  );
  await page.goto('/kotlin-playground');
  const editor = page.locator('.CodeMirror');
  await expect(editor).toContainText('Hello, $name!');
  await page.getByRole('button', { name: 'Sealed classes' }).click();
  await expect(editor).toContainText('sealed interface Result');
});

test('DartPad loads only when asked, with a checked gist id', async ({ page }) => {
  await page.route('https://dartpad.dev/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>DartPad stub</p>' }));
  await page.goto('/dartpad');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByLabel(/GitHub gist id/).fill('hello');
  await expect(page.getByText('This does not look like a gist id.')).toBeVisible();
  await page.getByLabel(/GitHub gist id/).fill('https://gist.github.com/someone/5c0e154dd50af4a9ac856908061291bc');
  await page.getByRole('button', { name: 'Open DartPad' }).click();
  await expect(page.locator('iframe[title="DartPad"]')).toHaveAttribute('src', 'https://dartpad.dev/?theme=light&id=5c0e154dd50af4a9ac856908061291bc');
});
