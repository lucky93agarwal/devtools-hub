import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { ApiClient } from './api-client';
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
    const fixture = TestBed.createComponent(ApiClient);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === label);
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
    const editors = () => fixture.debugElement.queryAll(By.directive(FakeCodeEditor)).map((d) => d.componentInstance as FakeCodeEditor);
    return { fixture, el, settle, text, click, type, editors, store: TestBed.inject(ApiStore) };
  }

  it('sends a request and shows the status, time, size and pretty JSON', async () => {
    const { el, click, type, text, editors } = await setup();
    await type('input[aria-label=URL]', 'https://api.example.com/posts/1?x=1');
    await click('Send');
    expect(sent[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/posts/1?x=1' });
    expect(text()).toContain('200 OK');
    expect(text()).toContain('42 ms');
    expect(editors().at(-1)!.value()).toBe('{\n  "id": 1,\n  "title": "Hello"\n}');
    expect(track).toHaveBeenCalledWith('api-send', { method: 'GET', status: '2xx' });
    // The URL's params show in the Params tab.
    expect([...el.querySelectorAll<HTMLInputElement>('app-kv-table input[type=text]')].map((i) => i.value)).toContain('x');
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
    await click('JSON');
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
    const { el, click, type, store, text } = await setup();
    await type('input[aria-label=URL]', 'https://x.dev/users');
    await click('Save');
    await click('Save request');
    expect(store.collections()[0].requests[0].name).toBe('GET /users');
    expect(text()).toContain('Saved in a collection');
    await click('New');
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
      value: [new File([exportPostman(collection)], 'shop.postman_collection.json', { type: 'application/json' })],
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
