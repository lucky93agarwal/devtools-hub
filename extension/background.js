import { detect, toolUrl } from './share.js';

/** Right-click menu items for selected text. "auto" picks the tool from the text. */
const ITEMS = [
  { id: 'auto', title: 'Open in DevTools24 (detect)' },
  { id: 'json-formatter', title: 'Format JSON', data: (t) => ({ input: t }) },
  { id: 'jwt', title: 'Decode JWT', data: (t) => ({ token: t }) },
  { id: 'base64', title: 'Decode Base64', data: (t) => ({ input: t, mode: 'decode' }) },
  { id: 'url-encoder', title: 'URL decode', data: (t) => ({ text: t, direction: 'decode' }) },
  { id: 'timestamp-converter', title: 'Convert timestamp', data: (t) => ({ input: t }) },
  { id: 'cron-expression', title: 'Explain cron expression', data: (t) => ({ input: t }) },
  { id: 'hash-generator', title: 'Hash it (SHA-256, MD5…)', data: (t) => ({ input: t }) },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'root', title: 'DevTools24', contexts: ['selection'] });
    for (const item of ITEMS) chrome.contextMenus.create({ id: item.id, parentId: 'root', title: item.title, contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText ?? '').trim();
  if (!text) return;
  const item = ITEMS.find((i) => i.id === info.menuItemId);
  if (!item) return;
  const target = item.id === 'auto' ? detect(text) : { path: item.id, data: item.data(text) };
  chrome.tabs.create({ url: await toolUrl(target.path, target.data), index: tab ? tab.index + 1 : undefined });
});
