import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { watchErrors } from './helpers';

// The PDF tools: every file is made and read in the browser, so each test checks the real output.

async function closeNotice(page: Page): Promise<void> {
  const ok = page.getByRole('region', { name: 'Visit notice' }).getByRole('button', { name: 'OK' });
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

/** A small real PDF with a heading and a table, made with pdf-lib in the test. */
async function samplePdf(pages: number): Promise<Buffer> {
  const { StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Report page ${n}`, { x: 50, y: 780, size: 18, font });
    [['Item', 'Qty', 'Price'], ['Pen', '2', '10.00'], ['Ink', '5', '3.50']].forEach((row, r) =>
      row.forEach((cell, c) => page.drawText(cell, { x: 50 + c * 150, y: 720 - r * 20, size: 11, font })),
    );
  }
  return Buffer.from(await doc.save());
}

const upload = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

test('Dummy PDF Generator makes an exact 1 MB PDF with the chosen pages', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/dummy-pdf-generator');
  await closeNotice(page);
  await page.getByLabel('Pages', { exact: true }).fill('7');
  await page.getByLabel('File size').selectOption({ label: '1 MB (1,000,000 bytes)' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate and download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('dummy-7p-1MB.pdf');
  const bytes = await readFile((await file.path())!);
  expect(bytes.length).toBe(1_000_000);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(7);
  expect(errors).toEqual([]);
});

test('Merge PDF combines files in the chosen order', async ({ page }) => {
  await page.goto('/merge-pdf');
  await closeNotice(page);
  await page.locator('app-upload-box input[type=file]').setInputFiles([upload('a.pdf', await samplePdf(2)), upload('b.pdf', await samplePdf(3))]);
  const list = page.getByRole('list', { name: 'Files to merge' });
  await expect(list).toContainText('a.pdf');
  await expect(list).toContainText('3 pages');
  await page.getByRole('button', { name: 'Move b.pdf up' }).click();
  await expect(list.getByRole('listitem').first()).toContainText('b.pdf');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click();
  const merged = await PDFDocument.load(await readFile((await (await download).path())!));
  expect(merged.getPageCount()).toBe(5);
});

test('Split PDF extracts ranges and splits into a ZIP', async ({ page }) => {
  await page.goto('/split-pdf');
  await closeNotice(page);
  await page.locator('app-upload-box input[type=file]').setInputFiles(upload('report.pdf', await samplePdf(6)));
  await expect(page.getByText('report.pdf · 6 pages')).toBeVisible();
  await page.getByLabel('Pages to extract').fill('2-3, 6');
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Split and download' }).click();
  expect((await PDFDocument.load(await readFile((await (await download).path())!))).getPageCount()).toBe(3);

  await page.getByLabel('Pages to extract').fill('9');
  await page.getByRole('button', { name: 'Split and download' }).click();
  await expect(page.getByRole('alert')).toContainText('has 6 pages');

  await page.getByRole('radio', { name: /One PDF per page/ }).check();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Split and download' }).click();
  expect((await download).suggestedFilename()).toBe('report-split.zip');
});

test('Compress PDF shows the size before and after', async ({ page }) => {
  await page.goto('/compress-pdf');
  await closeNotice(page);
  await page.getByLabel('Compression level').selectOption('strong');
  await page.locator('app-upload-box input[type=file]').setInputFiles(upload('big.pdf', await samplePdf(2)));
  const result = page.getByLabel('Result');
  await expect(result).toContainText('Before:');
  await expect(result).toContainText('After:');
  const download = page.waitForEvent('download');
  await result.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('big-compressed.pdf');
});

test('PDF text extractor reads text, CSV and JSON tables', async ({ page }) => {
  await page.goto('/pdf-text-extractor');
  await closeNotice(page);
  await page.locator('app-upload-box input[type=file]').setInputFiles(upload('invoice.pdf', await samplePdf(1)));
  const output = page.getByLabel('Extracted output');
  await expect(output).toHaveValue(/Report page 1/);
  await page.getByRole('tab', { name: 'Table (CSV)' }).click();
  await expect(output).toHaveValue(/Item,Qty,Price\nPen,2,10\.00/);
  await page.getByRole('tab', { name: 'Table (JSON)' }).click();
  await expect(output).toHaveValue(/"Item": "Ink"/);
});

test('Text to PDF previews Markdown with its styles and downloads a PDF', async ({ page }) => {
  await page.goto('/text-to-pdf');
  await closeNotice(page);
  const preview = page.frameLocator('iframe[title=Preview]');
  await expect(preview.locator('h1')).toHaveText('Release notes 2.4');
  // The preview keeps its stylesheet (Angular must not strip it).
  await expect(preview.locator('h1')).toHaveCSS('color', 'rgb(79, 70, 229)');
  await expect(preview.locator('table')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const doc = await PDFDocument.load(await readFile((await (await download).path())!));
  expect(doc.getPageCount()).toBe(1);

  await page.getByLabel('Input type').selectOption('json');
  await expect(preview.locator('th').first()).toHaveText('id');
  await page.getByLabel('Text to convert').fill('{bad');
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
});

test('HTML to PDF renders the styled preview and downloads a PDF', async ({ page }) => {
  await page.goto('/html-to-pdf');
  await closeNotice(page);
  const preview = page.frameLocator('iframe[title=Preview]');
  await expect(preview.locator('.head')).toHaveCSS('display', 'flex');
  await page.getByLabel('HTML', { exact: true }).fill('<h1 style="color:red">Hello</h1><script>parent.document.title="hacked"</script>');
  await expect(preview.locator('h1')).toHaveCSS('color', 'rgb(255, 0, 0)');
  // Scripts in the snippet never run.
  await expect(page).not.toHaveTitle('hacked');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF (image)' }).click();
  expect((await PDFDocument.load(await readFile((await (await download).path())!))).getPageCount()).toBe(1);
  // No sideways scrolling on a phone-sized screen.
  await page.setViewportSize({ width: 390, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
