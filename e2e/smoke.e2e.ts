import { expect, test } from '@playwright/test';
import { buildSchema, introspectionFromSchema } from 'graphql';
import { typeInEditor, watchErrors } from './helpers';

// Smoke tests for every live page, using real mouse clicks and keyboard input
// against the production build. They catch pages that do not open or inputs
// that cannot be used, which the unit tests (with fake editors) cannot see.

/** Header link label, the page it opens and that page's H1; search words and tool name for the phone menu. */
const NAV = [
  { label: 'JSON', path: '/json-formatter', heading: 'JSON Formatter and Validator', search: 'json formatter', name: /^JSON Formatter and Validator/ },
  { label: 'Compare', path: '/json-compare', heading: 'JSON Compare', search: 'json compare', name: /^JSON Compare/ },
  { label: 'Images', path: '/image-converter', heading: 'Image Converter', search: 'image converter', name: /^Image Converter/ },
  { label: 'JWT', path: '/jwt', heading: /JWT/, search: 'jwt', name: /^JWT/ },
  { label: 'JSON to Code', path: '/json-to-code', heading: 'JSON to Code', search: 'json to code', name: /^JSON to Code/ },
  { label: 'Data', path: '/data-converter', heading: 'Data Converter', search: 'data converter', name: /^Data Converter/ },
  { label: 'API', path: '/api-client', heading: 'API Client', search: 'api client', name: /^API Client/ },
];

let errors: string[];
test.beforeEach(({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Developer tools that stay on your device',
  );
  // One group of cards shows at a time; the Images tab shows the background remover.
  await page.getByRole('tab', { name: /^Images/ }).click();
  await expect(page.getByRole('tabpanel').getByRole('link', { name: /Background Remover/ })).toBeVisible();
});

test.describe('desktop header', () => {
  for (const link of NAV) {
    test(`opens ${link.path}`, async ({ page }) => {
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: link.label, exact: true })
        .click();
      await expect(page).toHaveURL(link.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(link.heading);
    });
  }

  test('opens /background-remover from the home page sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'All tools by group' });
    await sidebar.getByText('Images', { exact: true }).click();
    await sidebar.getByRole('link', { name: 'Background Remover' }).click();
    await expect(page).toHaveURL('/background-remover');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Background Remover');
  });

  test('the All tools drawer finds and opens a tool', async ({ page }) => {
    await page.goto('/json-formatter');
    await page.getByRole('button', { name: 'All tools' }).click();
    const drawer = page.getByRole('dialog', { name: 'All tools' });
    await expect(drawer).toBeVisible();
    // The current page's group is open and the page is marked.
    await expect(drawer.locator('details[open] [aria-current="page"]')).toContainText('JSON Formatter');
    await page.keyboard.type('cidr');
    await drawer.getByRole('link', { name: /CIDR and Subnet Calculator/ }).click();
    await expect(page).toHaveURL('/cidr-calculator');
    await expect(drawer).toBeHidden();
  });
});

test.describe('phone menu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const link of NAV) {
    test(`opens ${link.path}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'All tools' }).click();
      const drawer = page.getByRole('dialog', { name: 'All tools' });
      await drawer.getByRole('searchbox').fill(link.search);
      await drawer.getByRole('link', { name: link.name }).click();
      await expect(page).toHaveURL(link.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(link.heading);
      await expect(drawer).toBeHidden();
    });
  }

  test('opens /background-remover from the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /^Images/ }).click();
    await page.getByRole('tabpanel').getByRole('link', { name: /Background Remover/ }).click();
    await expect(page).toHaveURL('/background-remover');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Background Remover');
  });
});

test('JSON Formatter formats typed JSON', async ({ page }) => {
  await page.goto('/json-formatter');
  await typeInEditor(page, 'JSON input', '{"a":1}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Valid JSON');
});

// Moving the mouse loads Monaco before the first click. Clicks on the loaded editor
// must still place the cursor, also when coming back to it after pressing a button.
test('JSON Formatter editor works when clicked after it has loaded', async ({ page }) => {
  await page.goto('/json-formatter');
  await page.mouse.move(10, 300);
  await page.mouse.move(20, 320);
  await expect(
    page.locator('app-code-editor').first().locator('[aria-busy="false"]'),
  ).toBeVisible();

  await typeInEditor(page, 'JSON input', '[1,2]');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Valid JSON');

  await typeInEditor(page, 'JSON input', 'x');
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(page.locator('#json-status')).toContainText('Line 1');
});

test('JSON Compare compares the sample files', async ({ page }) => {
  await page.goto('/json-compare');
  await page.getByRole('button', { name: 'Two sample files' }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('#compare-status')).toContainText('Differences found');
});

test('JWT decodes the sample token and opens the Create tab', async ({ page }) => {
  await page.goto('/jwt');
  await page.getByRole('button', { name: 'Use a sample token' }).click();
  await expect(page.getByRole('heading', { name: 'Payload' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Header/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Create a token' }).click();
  await expect(page.getByRole('tab', { name: 'Create a token' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Algorithm')).toBeVisible();
});

test('Image Converter converts an uploaded PNG', async ({ page }) => {
  await page.goto('/image-converter');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  await (await chooser).setFiles('e2e/fixtures/small.png');

  await expect(page.getByText('small.png', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.getByRole('button', { name: /^Convert 1 image to/ }).click();
  await expect(page.getByText('1 of 1 converted.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download small.*\.webp$/ })).toBeVisible();
});

test('Image Converter opens HEIC, TIFF and SVG and saves every output format', async ({ page }) => {
  await page.goto('/image-converter');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  // Chromium cannot open HEIC or TIFF itself, so these use the bundled readers.
  const files = ['small.heic', 'small.tiff', 'small.svg'].map((name) => `e2e/fixtures/${name}`);
  await (await chooser).setFiles(files);
  await expect(page.getByText('3 / 15')).toBeVisible();

  for (const format of ['AVIF', 'GIF', 'BMP', 'TIFF', 'ICO', 'JPG']) {
    await page.getByRole('radio', { name: format, exact: true }).click();
    await page.getByRole('button', { name: `Convert 3 images to ${format}` }).click();
    await expect(page.getByText('3 of 3 converted.')).toBeVisible({ timeout: 30_000 });
  }
  // SVG has no pixel size of its own, so it is drawn at 1024 px.
  await expect(page.getByText(/1024×1024/)).toBeVisible();
});

test('JSON to Code writes classes as you type and switches language', async ({ page }) => {
  await page.goto('/json-to-code');
  await typeInEditor(page, 'JSON input', '{"user_name":"Ada","tags":["a"]}');
  await expect(page.getByText('Kotlin Serialization: 1 class.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('@SerialName("user_name") val userName: String');

  await page.getByLabel('Convert to').selectOption('typescript-interface');
  await expect(page).toHaveURL(/\?to=typescript-interface$/);
  await expect(page.locator('app-code-editor').nth(1)).toContainText('user_name: string;');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Root.ts' }).click();
  expect((await download).suggestedFilename()).toBe('Root.ts');
});

test('JSON to Code writes Dart and Go from the sample', async ({ page }) => {
  await page.goto('/json-to-code?to=dart');
  await page.getByRole('button', { name: 'Sample JSON' }).click();
  const output = page.locator('app-code-editor').nth(1);
  await expect(output).toContainText('final String userName;');

  await page.getByLabel('Convert to').selectOption('go');
  await expect(output).toContainText('json:"user_name"');
  await page.getByRole('checkbox', { name: 'Pointers for values that may be missing' }).uncheck();
  await expect(page.getByRole('button', { name: 'Root.go' })).toBeEnabled();
});

test('Data Converter turns typed JSON into YAML, then back, then into CSV', async ({ page }) => {
  await page.goto('/data-converter');
  await typeInEditor(page, 'Input', '{"name":"Ada","langs":["en"]}');
  const result = page.locator('app-code-editor').nth(1);
  await expect(page.getByText('Converted JSON to YAML.')).toBeVisible();
  await expect(result).toContainText('name: Ada');

  await page.getByRole('button', { name: 'Swap: convert the result back' }).click();
  await expect(page).toHaveURL(/from=yaml&to=json/);
  await expect(result).toContainText('"name": "Ada"');

  await page.locator('select').nth(1).selectOption('csv');
  await expect(result).toContainText('name,langs.0');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'data.csv' }).click();
  expect((await download).suggestedFilename()).toBe('data.csv');
});

test('Data Converter points at the line of an XML mistake', async ({ page }) => {
  await page.goto('/data-converter?from=xml&to=json');
  await typeInEditor(page, 'Input', '<a>\n<b>1</c>\n</a>');
  await expect(page.getByRole('button', { name: /Line 2, column \d+:/ })).toBeVisible();
});

test('XML Formatter formats typed XML and finds a broken tag', async ({ page }) => {
  await page.goto('/xml-formatter');
  await typeInEditor(page, 'XML input', '<a><b>1</b></a>');
  await expect(page.getByText('Valid XML.')).toBeVisible();
  await expect(page.locator('app-code-editor').nth(1)).toContainText('<b>1</b>');
  await page.getByRole('button', { name: 'XML with errors' }).click();
  await expect(page.getByRole('button', { name: /Line 4, column \d+:/ })).toBeVisible();
});

test('YAML Validator reports a tab and accepts the valid sample', async ({ page }) => {
  await page.goto('/yaml-validator');
  await page.getByRole('button', { name: 'YAML with errors' }).click();
  await expect(page.getByRole('button', { name: /Line 4, column \d+:/ })).toBeVisible();
  await page.getByRole('button', { name: 'Valid YAML' }).click();
  await expect(page.getByText('Valid YAML. 2 documents.')).toBeVisible();
});

test('App Icon Generator previews icons and downloads the ZIP', async ({ page }) => {
  await page.goto('/app-icon-generator');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText('Use at least 1024×1024 px')).toBeVisible();
  await expect(page.locator('ul img')).toHaveCount(4);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download 21 files (ZIP)' }).click();
  expect((await download).suggestedFilename()).toBe('app-icons.zip');
});

test('Image Resizer resizes a real image to a width and under a KB limit', async ({ page }) => {
  await page.goto('/image-resizer');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose images' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await page.getByPlaceholder('Auto').first().fill('200');
  await page.getByRole('button', { name: 'Resize 1 image' }).click();
  await expect(page.getByText(/400×300 to 200×150/)).toBeVisible();

  await page.getByLabel('Save as').selectOption('jpg');
  await page.getByPlaceholder('No limit').fill('5');
  await page.getByRole('button', { name: 'Resize 1 image' }).click();
  await expect(page.getByText(/to \d+×\d+ · JPG · [0-9.]+ (KB|B)/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download photo-\d+x\d+\.jpg$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^photo-\d+x\d+\.jpg$/);
});

test('Image Cropper crops with a dragged corner and a square shape', async ({ page }) => {
  await page.goto('/image-cropper');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose image' }).click();
  await (await chooser).setFiles('e2e/fixtures/photo.png');
  await expect(page.getByText('Image: 400×300 px')).toBeVisible();

  // Drag the bottom-right corner up and left with the mouse.
  const area = page.getByRole('group', { name: /Crop area/ });
  await page.mouse.wheel(0, 300);
  await area.scrollIntoViewIfNeeded();
  const box = await area.boundingBox();
  await page.mouse.move(box!.x + box!.width, box!.y + box!.height);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 40, box!.y + box!.height - 40, { steps: 5 });
  await page.mouse.up();
  const width = Number(await page.getByLabel('width', { exact: true }).inputValue());
  expect(width).toBeLessThan(320);

  await page.getByRole('radio', { name: '1:1 square' }).click();
  const value = (label: string) => page.getByLabel(label, { exact: true }).inputValue();
  await expect.poll(async () => (await value('width')) === (await value('height'))).toBe(true);
  const side = await value('width');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${side}×${side}` }).click();
  expect((await download).suggestedFilename()).toBe(`photo-cropped-${side}x${side}.png`);
});

test('API Client sends a real request and shows the response', async ({ page }) => {
  await page.goto('/api-client');
  // The site's own manifest: same origin, so no CORS, and a JSON body.
  await page.getByLabel('URL', { exact: true }).fill(`${new URL(page.url()).origin}/site.webmanifest?v=1`);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();
  await expect(page.locator('app-json-view')).toContainText('"name": "DevTools24"');
  await page.getByRole('button', { name: /^Format: / }).click();
  await page.getByRole('menuitemradio', { name: 'Raw' }).click();
  await expect(page.locator('app-code-editor').last()).toContainText('"name": "DevTools24"');
  await page.getByRole('tab', { name: /Headers \(\d+\)/ }).click();
  await expect(page.getByRole('cell', { name: 'content-type' })).toBeVisible();

  // Sent requests appear in History and can be saved.
  await page.getByRole('tab', { name: 'history' }).click();
  await expect(page.locator('aside').getByText(/site\.webmanifest/)).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save request' }).click();
  await expect(page.getByText('Saved in a collection')).toBeVisible();
});

test('API Client sample response shows types, tokens and copies any part', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'Sample request' }).click();
  await expect(page.getByText('200 OK')).toBeVisible();
  const tree = page.locator('app-json-view');

  await tree.getByLabel('Type of $.user.roles', { exact: true }).hover();
  await expect(page.getByRole('dialog')).toContainText('2 items, all strings');

  await tree.getByLabel('Decode token at $.auth.accessToken', { exact: true }).click();
  const token = page.getByRole('dialog', { name: 'Decoded token' });
  await expect(token).toContainText('"name": "Asha Verma"');
  await expect(token).toContainText('Active');
  // A clicked popover stays open while the mouse moves away.
  await page.mouse.move(5, 5);
  await expect(token).toBeVisible();
  await token.getByRole('button', { name: 'Close' }).click();
  await expect(token).toBeHidden();

  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search response body').fill('jaipur');
  await expect(page.getByText('1 of 1')).toBeVisible();
  await expect(tree.locator('mark')).toHaveText('Jaipur');
  await page.getByLabel('Search response body').fill('');

  await tree.getByRole('button', { name: 'Copy $.user.address', exact: true }).click();
  await expect(tree).toContainText('"address" copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"city": "Jaipur"');
});

test('API Client sends raw, GraphQL and binary bodies', async ({ page }) => {
  await page.goto('/api-client');
  await page.getByLabel('URL', { exact: true }).fill('https://api.example.com/graphql');
  await page.getByLabel('Method').selectOption('POST');
  await page.getByRole('tab', { name: /Body/ }).click();
  for (const mode of ['none', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary', 'GraphQL']) {
    await expect(page.getByRole('radio', { name: mode, exact: true })).toBeVisible();
  }
  await page.getByRole('radio', { name: 'raw', exact: true }).check();
  await page.getByLabel('Raw body type').selectOption('xml');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('pre').first()).toContainText('Content-Type: application/xml');
  await page.getByRole('button', { name: 'Code', exact: true }).click();

  await page.getByRole('radio', { name: 'binary', exact: true }).check();
  await page.getByLabel('Binary body file').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect(page.getByText('photo.png')).toBeVisible();

  await page.getByRole('radio', { name: 'form-data', exact: true }).check();
  await page.getByLabel('Key 1', { exact: true }).fill('avatar');
  await page.getByLabel('Type of key 1').selectOption('file');
  await page.getByLabel('File 1').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from('cat') });
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('pre').first()).toContainText(`--form 'avatar=@"cat.png"'`);
});

test('API Client builds a GraphQL query from the schema', async ({ page }) => {
  const schema = buildSchema('type Query { country(code: ID!): Country } type Country { name: String capital: String }');
  const bodies: string[] = [];
  // A stand-in GraphQL server that allows calls from web pages.
  await page.route('https://gql.test/graphql', async (route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const data = body.includes('IntrospectionQuery') ? introspectionFromSchema(schema) : { country: { name: 'India' } };
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
  });
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: /GraphQL/ }).click();
  await page.getByLabel('URL', { exact: true }).fill('https://gql.test/graphql');
  await page.getByRole('tab', { name: /Query/ }).click();
  const explorer = page.getByRole('complementary', { name: 'Schema explorer' });
  await explorer.getByRole('button', { name: 'Expand country' }).click();
  await explorer.getByLabel('Argument code of country').check();
  // Ticking the argument ticks the field and its leaves.
  await expect(explorer.getByLabel('Select country/capital')).toBeChecked();
  await explorer.getByLabel('Select country/capital').uncheck();
  await expect(page.locator('app-code-editor').first()).toContainText('country(code: $code)');
  await expect(page.locator('app-code-editor').first()).not.toContainText('capital');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('app-json-view')).toContainText('"India"');
  expect(JSON.parse(bodies.at(-1)!)).toEqual({
    query: 'query MyQuery($code: ID!) {\n  country(code: $code) {\n    name\n  }\n}\n',
    variables: { code: null },
  });
});

test('API Client streams an AI answer', async ({ page }) => {
  // A stand-in for Anthropic's streaming Messages API.
  await page.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream' },
      body: [
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":7}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there!"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
      ].join(''),
    }),
  );
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Prompt OpenAI' }).click();
  await page.getByLabel('AI provider').selectOption('anthropic');
  await expect(page.getByLabel('Model')).toHaveValue('claude-sonnet-5-5');
  await page.getByLabel('API key').fill('test-key');
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const conversation = page.locator('app-ai-panel section');
  await expect(conversation).toContainText('Hello there!');
  await expect(conversation).toContainText('7 tokens in, 3 out');
});

test('API Client lists and runs MCP tools', async ({ page }) => {
  // A stand-in MCP server answering JSON-RPC with plain JSON.
  await page.route('https://mcp.test/mcp', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postDataJSON();
    if (!body.id) return route.fulfill({ status: 202, headers: cors });
    const results: Record<string, unknown> = {
      initialize: { protocolVersion: '2025-06-18', serverInfo: { name: 'Test server', version: '0.1' }, capabilities: { tools: {} } },
      'tools/list': { tools: [{ name: 'add', description: 'Adds two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } }] },
      'tools/call': { content: [{ type: 'text', text: String((body.params?.arguments?.a ?? 0) + (body.params?.arguments?.b ?? 0)) }] },
    };
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: results[body.method] }) });
  });
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'resources and prompts' }).click();
  await page.getByLabel('URL', { exact: true }).fill('https://mcp.test/mcp');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Test server')).toBeVisible();
  await page.getByRole('button', { name: /Adds two numbers/ }).click();
  await expect(page.locator('app-mcp-panel app-code-editor')).toContainText('"a": 0');
  await page.getByRole('button', { name: 'Run tool' }).click();
  await expect(page.getByText('Result of add')).toBeVisible();
});

test('API Client talks to a WebSocket server', async ({ page }) => {
  // A stand-in echo server, so the test does not depend on the internet.
  await page.routeWebSocket('wss://echo.test/', (ws) => {
    ws.onMessage((message) => ws.send(`echo: ${message}`));
  });
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: /WebSocket/ }).click();
  await page.getByLabel('URL', { exact: true }).fill('wss://echo.test/');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await typeInEditor(page, 'Message', 'hello');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const log = page.getByRole('list', { name: 'Message log' });
  await expect(log).toContainText('echo: hello');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(log).toContainText('Disconnected: 1000');
});

test('API Client emits and receives Socket.IO events', async ({ page }) => {
  // Speaks just enough of the Engine.IO 4 and Socket.IO 5 protocol for one exchange.
  await page.routeWebSocket(/sio\.test\/socket\.io\//, (ws) => {
    ws.send('0{"sid":"s1","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
    ws.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40')) ws.send('40{"sid":"n1"}');
      else if (text.startsWith('42')) {
        const [event, data] = JSON.parse(text.slice(2));
        ws.send(`42${JSON.stringify(['reply', { got: event, data }])}`);
      }
    });
  });
  await page.goto('/api-client');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: /Socket\.IO/ }).click();
  await page.getByLabel('URL', { exact: true }).fill('https://sio.test');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByLabel('Event name').fill('chat');
  await page.getByLabel('Message format').selectOption('json');
  await typeInEditor(page, 'Message', '{"text": "hi"}');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const log = page.getByRole('list', { name: 'Message log' });
  await expect(log.getByText('reply', { exact: true })).toBeVisible();
  await expect(log).toContainText('"got": "chat"');
});

test('API Client sends a request typed before the app has started', async ({ page }) => {
  // Hold the app's script back, as on a slow phone, while the prerendered page is usable.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/main-*.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/api-client', { waitUntil: 'commit' });
  const url = `${new URL(page.url()).origin}/site.webmanifest?early=1`;
  await page.getByLabel('URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  release();
  await expect(page.getByText('200 OK')).toBeVisible();
  await expect(page.getByLabel('URL', { exact: true })).toHaveValue(url);
});

test('API Client params support descriptions, bulk edit and hiding columns', async ({ page }) => {
  await page.goto('/api-client');
  await page.getByLabel('URL', { exact: true }).fill('https://api.example.com/users?page=2');
  await page.getByLabel('Description 1').fill('Page number');
  await page.getByRole('button', { name: 'Bulk Edit' }).click();
  await expect(page.getByLabel('Keys as text')).toHaveValue('page:2');
  await page.getByLabel('Keys as text').fill('page:3\n//debug:true');
  await expect(page.getByLabel('URL', { exact: true })).toHaveValue('https://api.example.com/users?page=3');
  await page.getByRole('button', { name: 'Key-Value Edit' }).click();
  await expect(page.getByLabel('Description 1')).toHaveValue('Page number');

  await page.getByRole('button', { name: 'Table options' }).first().click();
  await page.getByRole('group', { name: 'Show columns' }).getByLabel('Description').uncheck();
  await expect(page.getByLabel('Description 1')).toHaveCount(0);
});

test('API Client offers every auth type and signs AWS requests', async ({ page }) => {
  await page.goto('/api-client');
  await page.getByLabel('URL', { exact: true }).fill('https://abc.execute-api.us-east-1.amazonaws.com/prod/items');
  await page.getByRole('tab', { name: /Authorization/ }).click();
  const type = page.locator('app-auth-editor select').first();
  await expect(type.locator('option')).toHaveCount(14);
  await type.selectOption('aws');
  await page.getByLabel('Access key', { exact: true }).fill('AKIDEXAMPLE');
  await page.getByLabel('Secret key', { exact: true }).fill('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('pre').first()).toContainText('Authorization: AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/');
  await expect(page.locator('pre').first()).toContainText('X-Amz-Date: ');
});

test('API Client explains a request the browser cannot complete', async ({ page }) => {
  await page.goto('/api-client');
  // Nothing listens on port 9, so the browser gets no response, as with a CORS refusal.
  await page.getByLabel('URL', { exact: true }).fill('http://127.0.0.1:9/nothing');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('The browser could not get a response.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy as cURL' })).toBeVisible();
  errors.length = 0; // the failed fetch is logged by the browser on purpose
});

test('the old JSON to model address opens JSON to Code', async ({ page }) => {
  await page.goto('/json-to-model');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('JSON to Code');
});

test('Background Remover shows the upload box', async ({ page }) => {
  await page.goto('/background-remover');
  await expect(page.getByText('Drop an image here')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeEnabled();
});
