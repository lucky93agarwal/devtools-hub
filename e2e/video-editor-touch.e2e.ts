import { expect, test } from '@playwright/test';

// On phones a clip follows the finger instead of the page scrolling.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

test('a clip can be dragged with a finger', async ({ page }) => {
  await page.goto('/video-editor');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import files/ }).click();
  await (await chooser).setFiles(['e2e/fixtures/clip.mp4']);
  await page.getByRole('list', { name: 'Project files' }).getByRole('listitem').first().dblclick();
  const clip = page.getByRole('button', { name: 'Clip clip.mp4' });
  await clip.scrollIntoViewIfNeeded();
  const box = (await clip.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 15, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await clip.boundingBox())!.x - box.x).toBeGreaterThan(120);
});
