import { expect, test } from '@playwright/test';

// The focus ring is for keyboard users only: clicks do not leave a blue border.
test('a click leaves no focus ring, Tab shows it', async ({ page }) => {
  await page.goto('/video-editor');
  const select = page.getByLabel('Empty space');
  await select.click();
  await page.keyboard.press('Escape');
  await expect.poll(() => select.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});
