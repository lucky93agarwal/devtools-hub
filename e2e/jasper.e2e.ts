import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { watchErrors } from './helpers';

// The Jaspersoft (JRXML) tools. The AI generator needs the Worker, so it is tested in the accounts suite.

async function closeNotice(page: Page): Promise<void> {
  const ok = page.getByRole('region', { name: 'Visit notice' }).getByRole('button', { name: 'OK' });
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

test('JRXML preview fills the sample report and exports PDF, Excel, CSV, HTML and Word', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/jrxml-preview');
  await closeNotice(page);
  const preview = page.getByRole('region', { name: 'Report preview' });
  await expect(page.getByRole('status').filter({ hasText: 'page' })).toHaveText('1 page · 4 records');
  await expect(preview).toContainText('Acme Pvt Ltd - Orders');
  await expect(preview).toContainText('02/11/2026');
  await expect(preview).toContainText('₹ 15,648.50');
  await expect(preview).toContainText('Page 1 of');
  await expect(preview.getByText('Asha Rao')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.getByLabel('Zoom').fill('1');
  await preview.screenshot({ path: '/private/tmp/claude-501/-Users-luckyagarwal-Desktop-Development/3e93280a-a340-465f-8d0c-4b4c1bb69845/scratchpad/jrxml-preview.png' });

  for (const [button, name] of [['PDF', 'orders_report.pdf'], ['Excel', 'orders_report.xlsx'], ['CSV', 'orders_report.csv'], ['HTML', 'orders_report.html'], ['Word', 'orders_report.docx']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(name);
    const bytes = await readFile((await file.path())!);
    if (name.endsWith('.pdf')) expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    if (name.endsWith('.csv')) expect(bytes.toString()).toContain('1001,Asha Rao,2026-11-02,2499,paid');
    if (/\.(xlsx|docx)$/.test(name)) expect(bytes.subarray(0, 2).toString()).toBe('PK');
  }

  // CSV data and a broken template.
  await page.getByLabel('Data format').selectOption('csv');
  await page.getByLabel('Data', { exact: true }).fill('orderId,customer,orderDate,amount,status\n7,Zara,2026-01-05,100,paid');
  await expect(preview).toContainText('Zara');
  await page.getByLabel('JRXML template').fill('<jasperReport><title></jasperReport>');
  await expect(page.getByRole('alert')).toContainText('not valid XML');
  expect(errors).toEqual([]);
});

test('JRXML debugger lists problems with lines and adds missing declarations', async ({ page }) => {
  await page.goto('/jrxml-debugger');
  await closeNotice(page);
  const problems = page.getByRole('list', { name: 'Problems' });
  await expect(problems).toContainText('$F{customerName} is used');
  await expect(problems).toContainText('goes below the band');
  await expect(problems).toContainText('more than the page can hold');
  await page.getByRole('button', { name: 'Add missing declarations' }).click();
  await expect(page.getByLabel('JRXML template')).toHaveValue(/<field name="customerName" class="java.lang.String"\/>/);
  await expect(problems).not.toContainText('customerName is used');
});

test('Field mapper turns JSON and SQL into declarations', async ({ page }) => {
  await page.goto('/jrxml-field-mapper');
  await closeNotice(page);
  const out = page.getByLabel('JRXML output');
  await expect(out).toHaveValue(/<parameter name="invoiceNo" class="java.lang.String"\/>/);
  await expect(out).toHaveValue(/<field name="unitPrice" class="java.math.BigDecimal"\/>/);
  await expect(out).toHaveValue(/<detail>/);
  await page.getByRole('tab', { name: 'SQL query' }).click();
  await expect(out).toHaveValue(/\$P\{fromDate\} AND \$P\{toDate\} AND o.status = \$P\{PARAM_1\}/);
  await expect(out).toHaveValue(/<field name="order_date" class="java.sql.Timestamp"\/>/);
});

test('Expression helper builds recipes, flags mistakes and runs expressions', async ({ page }) => {
  await page.goto('/jasper-expression-helper');
  await closeNotice(page);
  await expect(page.getByLabel('Checks')).toContainText('.equals(');
  await page.getByRole('navigation', { name: 'Recipes' }).getByRole('button', { name: 'Format a date' }).click();
  await page.getByRole('button', { name: 'Check and try it ↓' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Result' })).toContainText('26 Nov 2026');
});

test('Snippet builder makes a table, a QR code and a subreport', async ({ page }) => {
  await page.goto('/jrxml-snippet-builder');
  await closeNotice(page);
  await expect(page.getByLabel('Element', { exact: true })).toHaveValue(/<jr:table/);
  await expect(page.getByLabel('Declaration')).toHaveValue(/<field name="unitPrice" class="java.math.BigDecimal"\/>/);
  await page.getByRole('tab', { name: 'Barcode / QR code' }).click();
  await expect(page.getByLabel('Element', { exact: true })).toHaveValue(/<jr:QRCode/);
  await page.getByRole('tab', { name: 'Subreport' }).click();
  await expect(page.getByLabel('Element', { exact: true })).toHaveValue(/invoice_items\.jasper/);
});
