import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { ApiClient } from './api-client';
import { GraphqlEditor } from './graphql-editor';
import { PreparedRequest } from './build';
import { newRequest } from './model';
import { exportPostman } from './postman';
import { ApiResponse, ApiSender, RequestFailure, checkBeforeSending } from './sender';
import { ApiStore } from './store';

const okResponse = (changes: Partial<ApiResponse> = {}): ApiResponse => ({
  status: 200,
  statusText: 'OK',
  headers: [['content-type', 'application/json']],
  contentType: 'application/json',
  text: '{"id":1,"title":"Hello"}',
  blob: new Blob(['{"id":1,"title":"Hello"}']),
  size: 24,
  ms: 42,
  url: 'https://api.example.com/posts/1',
  redirected: false,
  ...changes,
});

describe('checkBeforeSending', () => {
  it('blocks http from an https page, except to this computer', () => {
    expect(checkBeforeSending('http://api.example.com', 'https:')?.kind).toBe('mixed-content');
    expect(checkBeforeSending('http://localhost:8080/a', 'https:')).toBeNull();
    expect(checkBeforeSending('http://127.0.0.1:3000', 'https:')).toBeNull();
    expect(checkBeforeSending('http://api.example.com', 'http:')).toBeNull();
  });

  it('explains addresses that are not http', () => {
    expect(checkBeforeSending('https://', 'https:')?.kind).toBe('invalid-url');
    expect(checkBeforeSending('ftp://x.dev', 'https:')?.message).toContain('Only http:// and https://');
  });
});

describe('ApiStore', () => {
  beforeEach(() => localStorage.clear());

  it('saves, finds and updates requests, and keeps them after a reload', () => {
    const store = TestBed.inject(ApiStore);
    const collection = store.addCollection('Users API');
    store.openNew(newRequest({ url: 'https://x.dev/users' }));
    store.saveAs('List users', collection.id);
    expect(store.collections()[0].requests.map((r) => r.name)).toEqual(['List users']);
    store.update({ method: 'POST' });
    expect(store.saveOver()).toBe(true);
    expect(store.collections()[0].requests[0].method).toBe('POST');
    TestBed.tick();

    TestBed.resetTestingModule();
    const again = TestBed.inject(ApiStore);
    expect(again.collections()[0].requests[0]).toMatchObject({ name: 'List users', method: 'POST' });
    expect(again.draft().url).toBe('https://x.dev/users');
  });

  it('keeps 50 history entries, newest first', () => {
    const store = TestBed.inject(ApiStore);
    for (let i = 0; i < 55; i++) store.addHistory(newRequest({ url: `https://x.dev/${i}` }), 200, 1);
    expect(store.history()).toHaveLength(50);
    expect(store.history()[0].request.url).toBe('https://x.dev/54');
  });

  it('lets environment variables win over collection variables', () => {
    const store = TestBed.inject(ApiStore);
    const collection = store.addCollection('C');
    store.setCollectionVariables(collection.id, [{ key: 'base', value: 'https://c.dev', enabled: true }]);
    store.openNew(newRequest());
    store.saveAs('r', collection.id);
    const env = store.addEnvironment('Prod');
    store.updateEnvironment(env.id, { variables: [{ key: 'base', value: 'https://prod.dev', enabled: true }] });
    expect(store.variables()).toEqual([
      [{ key: 'base', value: 'https://c.dev', enabled: true }],
      [{ key: 'base', value: 'https://prod.dev', enabled: true }],
    ]);
  });
});

describe('ApiClient', () => {
  let sent: PreparedRequest[];
  let reply: () => Promise<ApiResponse>;
  let track: ReturnType<typeof vi.fn>;

  async function setup() {
    localStorage.clear();
    sent = [];
    track = vi.fn();
    reply = async () => okResponse();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiSender,
          useValue: {
            send: (prepared: PreparedRequest) => {
              sent.push(prepared);
              return reply();
            },
          },
        },
        { provide: Analytics, useValue: { track, load: vi.fn(), limitHit: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(ApiClient, { remove: { imports: [CodeEditor] }, add: { imports: [FakeCodeEditor] } });
    TestBed.overrideComponent(GraphqlEditor, { remove: { imports: [CodeEditor] }, add: { imports: [FakeCodeEditor] } });
    // The GraphQL editor is a deferred block, loaded on demand.
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ApiClient);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find(
        (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label || b.getAttribute('aria-label') === label,
      );
      if (!button) throw new Error(`No button "${label}"`);
      button.click();
      await settle();
    };
    const type = async (selector: string, value: string, event = 'input') => {
      const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event(event));
      await settle();
    };
    /** Opens the New menu and picks a request kind. */
    const newOf = async (label: string) => {
      el.querySelector<HTMLButtonElement>('button[aria-label="New"]')!.click();
      await settle();
      [...el.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find((b) => b.textContent!.includes(label))!.click();
      await settle();
    };
    /** Opens the response format menu and picks a format. */
    const chooseFormat = async (label: string) => {
      el.querySelector<HTMLButtonElement>('button[aria-label^="Format: "]')!.click();
      await settle();
      const item = [...el.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')].find((b) => b.textContent!.trim().endsWith(label));
      item!.click();
      // Hex and Base64 read the body's bytes first.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await settle();
    };
    const editors = () => fixture.debugElement.queryAll(By.directive(FakeCodeEditor)).map((d) => d.componentInstance as FakeCodeEditor);
    return { fixture, el, settle, text, click, type, editors, chooseFormat, newOf, store: TestBed.inject(ApiStore) };
  }

  it('sends a request and shows the status, time, size and the body in each format', async () => {
    const { el, click, type, text, editors, chooseFormat } = await setup();
    await type('input[aria-label=URL]', 'https://api.example.com/posts/1?x=1');
    await click('Send');
    expect(sent[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/posts/1?x=1' });
    expect(text()).toContain('200 OK');
    expect(text()).toContain('42 ms');
    // JSON opens as a tree; Raw shows the text as the server sent it.
    expect(el.querySelector('app-json-view')!.textContent).toContain('"title": "Hello"');
    await chooseFormat('Raw');
    expect(editors().at(-1)!.value()).toBe('{"id":1,"title":"Hello"}');
    await chooseFormat('Hex');
    expect(editors().at(-1)!.value()).toMatch(/^00000000 {2}7b 22 69 64 22 3a 31 2c {2}22 74 69 74 6c 65 22 3a {2}\|\{"id":1,"title":\|/);
    await chooseFormat('Base64');
    expect(editors().at(-1)!.value()).toBe(btoa('{"id":1,"title":"Hello"}'));
    expect(track).toHaveBeenCalledWith('api-send', { method: 'GET', status: '2xx' });
    // The URL's params show in the Params tab.
    expect([...el.querySelectorAll<HTMLInputElement>('app-kv-table input[type=text]')].map((i) => i.value)).toContain('x');
  });

  it('copies any part of a JSON response and shows a key\'s type on hover', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { el, click, type, settle, text } = await setup();
    reply = async () => okResponse({ text: '{"user":{"id":7,"name":"Asha"},"list":[1,2]}' });
    await type('input[aria-label=URL]', 'https://api.example.com/me');
    await click('Send');
    el.querySelector<HTMLButtonElement>('button[aria-label="Copy $.user"]')!.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('{\n  "id": 7,\n  "name": "Asha"\n}');
    expect(text()).toContain('"user" copied');

    el.querySelector<HTMLButtonElement>('button[aria-label="Collapse $.user"]')!.click();
    await settle();
    expect(text()).toContain('{…}');
    expect(text()).not.toContain('"Asha"');

    el.querySelector<HTMLElement>('[aria-label="Type of $.list"]')!.dispatchEvent(new Event('focus'));
    await settle();
    const popover = el.querySelector('[role=dialog]')!;
    expect(popover.textContent).toContain('array');
    expect(popover.textContent).toContain('2 items, all numbers');
  });

  it('searches the response tree, raw text and headers', async () => {
    const { el, click, type, settle, text, editors, chooseFormat } = await setup();
    const items = Array.from({ length: 150 }, (_, i) => ({ id: i, name: i === 140 ? 'needle' : `item ${i}` }));
    reply = async () =>
      okResponse({
        text: JSON.stringify({ deep: { inner: { word: 'Needle here' } }, items }),
        headers: [
          ['content-type', 'application/json'],
          ['x-request-id', 'abc'],
        ],
      });
    await type('input[aria-label=URL]', 'https://api.example.com/search');
    await click('Send');
    // Fold everything, then search: the match inside is opened and marked.
    await click('Collapse all');
    expect(text()).not.toContain('Needle here');
    el.querySelector<HTMLButtonElement>('button[aria-label=Search]')!.click();
    await settle();
    await type('input[aria-label="Search response body"]', 'NEEDLE');
    expect(text()).toContain('1 of 2');
    expect(el.querySelector('app-json-view mark')!.textContent).toBe('Needle');
    // The second match is item 140, past the first page of 100 items.
    const next = async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Next match"]')!.click();
      await settle();
    };
    await next();
    expect(text()).toContain('2 of 2');
    expect(el.querySelector('[data-row="0/1/140/1"]')!.className).toContain('bg-warning');
    await next();
    expect(text()).toContain('1 of 2');

    await chooseFormat('Raw');
    expect(text()).toContain('1 of 2');
    expect(editors().at(-1)!.search).toHaveBeenLastCalledWith('NEEDLE', 0);

    await click('Headers (2)');
    await type('input[aria-label="Search headers"]', 'request');
    expect(text()).toContain('1 found');
    expect([...el.querySelectorAll('[aria-labelledby=response-heading] td')].map((td) => td.textContent!.trim())).toEqual(['x-request-id', 'abc']);
  });

  it('builds a GraphQL query from the schema and sends it', async () => {
    const { el, settle, type, click, newOf, store, text } = await setup();
    const { buildSchema, introspectionFromSchema } = await import('graphql');
    const schema = buildSchema('type Query { country(code: ID!): Country } type Country { name: String capital: String }');
    reply = async () => okResponse({ text: JSON.stringify({ data: introspectionFromSchema(schema) }) });
    await newOf('GraphQL');
    expect(text()).toContain('GraphQL');
    expect(el.querySelector('select[aria-label=Method]')).toBeNull();
    await type('input[aria-label=URL]', 'https://api.example.com/graphql');
    [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((t) => t.textContent!.trim().startsWith('Query'))!.click();
    await settle();
    // The schema is read by itself shortly after the URL is entered.
    await new Promise((resolve) => setTimeout(resolve, 900));
    await settle();
    expect(sent.at(-1)).toMatchObject({ method: 'POST', url: 'https://api.example.com/graphql' });
    expect(sent.at(-1)!.bodyText).toContain('IntrospectionQuery');

    el.querySelector<HTMLInputElement>('input[aria-label="Argument code of country"]')?.click();
    await settle();
    // Arguments show once the field is open.
    el.querySelector<HTMLButtonElement>('button[aria-label="Expand country"]')!.click();
    await settle();
    el.querySelector<HTMLInputElement>('input[aria-label="Argument code of country"]')!.click();
    await settle();
    expect(store.draft().body.graphql.query).toBe('query MyQuery($code: ID!) {\n  country(code: $code) {\n    name\n    capital\n  }\n}\n');
    expect(JSON.parse(store.draft().body.graphql.variables)).toEqual({ code: null });
    el.querySelector<HTMLInputElement>('input[aria-label="Select country/capital"]')!.click();
    await settle();
    expect(store.draft().body.graphql.query).not.toContain('capital');

    store.update({ body: { ...store.draft().body, graphql: { ...store.draft().body.graphql, query: '{ country { population } }' } } });
    await settle();
    expect(el.querySelector('[aria-label="Query problems"]')!.textContent).toContain('Cannot query field "population" on type "Country".');

    reply = async () => okResponse({ text: '{"data":{"country":{"name":"India"}}}' });
    await click('Send');
    expect(JSON.parse(sent.at(-1)!.bodyText!)).toEqual({ query: '{ country { population } }', variables: { code: null } });
  });

  it('points out where a JSON response is broken', async () => {
    const { el, click, type, text, editors } = await setup();
    reply = async () => okResponse({ contentType: 'text/plain', text: '{\n  "id": 1,\n  "name": "Ada"\n  "age": 36\n}' });
    await type('input[aria-label=URL]', 'https://api.example.com/broken');
    await click('Send');
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Invalid JSON at line 4, column 3');
    await new Promise((resolve) => setTimeout(resolve));
    expect(editors().at(-1)!.showError).toHaveBeenCalledWith(4, 3, expect.stringContaining(','));
    await click('Go to error');
    expect(editors().at(-1)!.revealError).toHaveBeenCalledWith(4, 3);
  });

  it('previews HTML in a sandboxed frame that runs no scripts', async () => {
    const { el, click, type } = await setup();
    reply = async () => okResponse({ contentType: 'text/html', text: '<h1>Hi</h1><script>alert(1)</script>' });
    await type('input[aria-label=URL]', 'https://x.dev/page');
    await click('Send');
    await click('Preview');
    const frame = el.querySelector<HTMLIFrameElement>('iframe[title="HTML returned by the API"]')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('srcdoc')).toContain('<base href="https://api.example.com/posts/1" target="_blank"><h1>Hi</h1>');
  });

  it('decodes a JWT in a response when it is clicked', async () => {
    const { el, click, type, settle } = await setup();
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    reply = async () => okResponse({ text: `{"token":"${token}","photo":"https://x.dev/a.png"}` });
    await type('input[aria-label=URL]', 'https://api.example.com/login');
    await click('Send');
    el.querySelector<HTMLElement>('[aria-label="Decode token at $.token"]')!.click();
    await settle();
    const popover = el.querySelector('[role=dialog]')!;
    expect(popover.textContent).toContain('HS256');
    expect(popover.textContent).toContain('"name": "John Doe"');
    expect(popover.textContent).toContain('No expiry');

    el.querySelector<HTMLElement>('[aria-label="Preview link at $.photo"]')!.click();
    await settle();
    expect(el.querySelector('[role=dialog] img')!.getAttribute('src')).toBe('https://x.dev/a.png');
    expect(el.querySelector('[role=dialog]')!.textContent).toContain('Download');
  });

  it('explains a blocked request and offers cURL', async () => {
    const { click, type, text } = await setup();
    reply = async () => {
      throw new RequestFailure('blocked', 'The browser could not get a response.');
    };
    await type('input[aria-label=URL]', 'https://internal.example.com/api');
    await click('Send');
    expect(text()).toContain('CORS:');
    expect(text()).toContain('Copy as cURL');
  });

  it('keeps the URL and the params table in sync', async () => {
    const { el, type, store, settle } = await setup();
    await type('input[aria-label=URL]', 'https://x.dev/search?q=a');
    const key = el.querySelectorAll<HTMLInputElement>('app-kv-table input[aria-label="Key 2"]')[0];
    key.value = 'page';
    key.dispatchEvent(new Event('input'));
    await settle();
    expect(store.draft().url).toBe('https://x.dev/search?q=a&page');
  });

  it('adds a bearer token and a JSON body to what is sent', async () => {
    const { el, click, type, store, settle } = await setup();
    await type('input[aria-label=URL]', 'https://x.dev/users');
    store.update({ method: 'POST' });
    await click('Authorization');
    const authType = el.querySelector<HTMLSelectElement>('select:not([aria-label=Method])')!;
    authType.value = 'bearer';
    authType.dispatchEvent(new Event('change'));
    await settle();
    await type('input[type=password]', 'secret-token');
    await click('Body');
    el.querySelector<HTMLInputElement>('input[name=body-mode][value=raw]')!.click();
    await settle();
    expect(el.querySelector<HTMLSelectElement>('select[aria-label="Raw body type"]')!.value).toBe('json');
    store.update({ body: { ...store.draft().body, raw: '{"name":"Ada"}' } });
    await click('Send');
    expect(sent[0].headers).toEqual([
      ['Authorization', 'Bearer secret-token'],
      ['Content-Type', 'application/json'],
    ]);
    expect(sent[0].body).toBe('{"name":"Ada"}');
  });

  it('imports a cURL command', async () => {
    const { click, type, store } = await setup();
    await click('Import cURL');
    await type('#curl-text', `curl -X DELETE 'https://x.dev/users/7' -H 'X-Trace: 1'`);
    await click('Import');
    expect(store.draft()).toMatchObject({ method: 'DELETE', url: 'https://x.dev/users/7', name: 'DELETE /users/7' });
  });

  it('saves a request into a collection and opens it from the sidebar', async () => {
    const { el, click, type, store, text, newOf } = await setup();
    await type('input[aria-label=URL]', 'https://x.dev/users');
    await click('Save');
    await click('Save request');
    expect(store.collections()[0].requests[0].name).toBe('GET /users');
    expect(text()).toContain('Saved in a collection');
    await newOf('HTTP');
    expect(store.draft().url).toBe('');
    [...el.querySelectorAll('aside button')].find((b) => b.textContent?.includes('GET /users'))!.dispatchEvent(new Event('click'));
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.draft().url).toBe('https://x.dev/users');
  });

  it('imports a Postman collection file', async () => {
    const { el, settle, store, text } = await setup();
    const collection = { id: 'c', name: 'Shop', requests: [newRequest({ name: 'Orders', url: '{{base}}/orders' })], folders: [], variables: [] };
    const input = el.querySelector<HTMLInputElement>('aside input[type=file]')!;
    Object.defineProperty(input, 'files', {
      value: [new File([exportPostman(collection).text], 'shop.postman_collection.json', { type: 'application/json' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await settle();
    await settle();
    expect(store.collections()[0].name).toBe('Shop');
    expect(text()).toContain('Imported 1 request from Shop.');
  });

  it('warns about missing variables and headers the browser drops', async () => {
    const { type, store, text, settle } = await setup();
    await type('input[aria-label=URL]', '{{base}}/me');
    store.update({ headers: [{ key: 'Cookie', value: 'a=1', enabled: true }] });
    await settle();
    expect(text()).toContain('No value for base.');
    expect(text()).toContain('Browsers do not let web pages send Cookie');
  });
});
