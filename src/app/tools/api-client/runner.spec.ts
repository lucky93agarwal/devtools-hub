import { TestBed } from '@angular/core/testing';
import { Collection, newRequest } from './model';
import { RunItem, runCollection, runItems, runOrder } from './runner';
import { ApiResponse, RequestFailure } from './sender';
import { ApiStore } from './store';

const response = (status: number): ApiResponse => ({
  status,
  statusText: '',
  headers: [],
  contentType: 'application/json',
  text: '{}',
  blob: new Blob(['{}']),
  size: 2,
  ms: 5,
  url: '',
  redirected: false,
});

function collection(): Collection {
  return {
    id: 'c',
    name: 'Shop',
    auth: { type: 'bearer', token: '{{token}}' },
    variables: [
      { key: 'base', value: 'https://x.dev', enabled: true },
      { key: 'token', value: 'collection-token', enabled: true },
    ],
    folders: [{ id: 'f', name: 'Users', folders: [], requests: [newRequest({ id: 'r2', name: 'List users', url: '{{base}}/users', auth: { type: 'inherit' } })] }],
    requests: [
      newRequest({ id: 'r1', name: 'Health', url: '{{base}}/health' }),
      newRequest({ id: 'r3', name: 'Live feed', kind: 'websocket', url: 'wss://x.dev' }),
      newRequest({ id: 'r4', name: 'Missing', url: '{{base}}/missing' }),
    ],
  };
}

describe('collection runner', () => {
  it('runs requests in sidebar order with variables, inherited auth and pass/fail', async () => {
    expect(runOrder(collection()).map((r) => `${r.folder}:${r.request.name}`)).toEqual(['Users:List users', ':Health', ':Live feed', ':Missing']);
    const items: RunItem[] = runItems(collection());
    const sent: { url: string; headers: [string, string][] }[] = [];
    await runCollection(collection(), {
      environment: [{ key: 'token', value: 'env-token', enabled: true }],
      send: async (prepared) => {
        sent.push({ url: prepared.url, headers: prepared.headers });
        return response(prepared.url.endsWith('/missing') ? 404 : 200);
      },
      signal: new AbortController().signal,
      delay: 0,
      update: (index, change) => Object.assign(items[index], change),
    });
    expect(sent.map((s) => s.url)).toEqual(['https://x.dev/users', 'https://x.dev/health', 'https://x.dev/missing']);
    // The environment's value wins over the collection's.
    expect(sent[0].headers).toContainEqual(['Authorization', 'Bearer env-token']);
    expect(items.map((i) => i.state)).toEqual(['passed', 'passed', 'skipped', 'failed']);
    expect(items[3].status).toBe(404);
  });

  it('stops when cancelled and reports network failures', async () => {
    const controller = new AbortController();
    const items = runItems(collection());
    await runCollection(collection(), {
      environment: [],
      send: async () => {
        controller.abort();
        throw new RequestFailure('blocked', 'The browser could not get a response.');
      },
      signal: controller.signal,
      delay: 0,
      update: (index, change) => Object.assign(items[index], change),
    });
    expect(items[0]).toMatchObject({ state: 'failed', note: 'The browser could not get a response.' });
    expect(items[1].state).toBe('waiting');
  });
});

describe('collection folders and requests', () => {
  it('adds, renames and deletes folders, and opens a new request inside one', () => {
    localStorage.clear();
    const store = TestBed.inject(ApiStore);
    const c = store.addCollection('Shop');
    const folder = store.addFolder(c.id);
    const inner = store.addFolder(c.id, folder.id, 'Admin');
    store.renameFolder(c.id, folder.id, 'Users');
    const request = store.addRequest(c.id, inner.id);
    const saved = () => store.collections().find((x) => x.id === c.id)!;
    expect(saved().folders[0].name).toBe('Users');
    expect(saved().folders[0].folders[0].requests.map((r) => r.id)).toEqual([request.id]);
    expect(store.draftSource()).toEqual({ collectionId: c.id, requestId: request.id });
    store.deleteFolder(c.id, folder.id);
    expect(saved().folders).toEqual([]);
    expect(store.draftSource()).toBeNull();
    expect(saved().createdAt).toBeGreaterThan(0);
  });
});
