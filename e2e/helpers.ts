import { Page, expect } from '@playwright/test';

/**
 * Clicks a Monaco editor with the mouse, waits until it has loaded and has the cursor,
 * then types with the keyboard. `index` picks the editor on the page (0 = first).
 */
export async function typeInEditor(
  page: Page,
  label: string,
  text: string,
  index = 0,
): Promise<void> {
  const editor = page.locator('app-code-editor').nth(index);
  await editor.click();
  await expect(editor.locator('[aria-busy="false"]')).toBeVisible();
  const textbox = page.getByRole('textbox', { name: label });
  await expect(textbox).toBeFocused();
  await page.keyboard.type(text);
}

/** Collects uncaught page errors and console errors, so a test can check there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
