# DevTools24 browser extension

A small Chrome / Edge extension (Manifest V3) for https://devtools24.in.

- **Right-click selected text → DevTools24** to open it in a tool: Format JSON, Decode JWT, Decode Base64,
  URL decode, Convert timestamp, Explain cron, Hash, or "detect" to pick the tool from the text.
- **Toolbar button (Alt+Shift+D)** to search every tool.

The selected text travels only in the part of the link after `#`, which browsers never send to a server, in the same
format as the site's Share links. The only permission is `contextMenus`; the extension reads no pages.

## Build

```bash
node scripts/build-extension.mjs
```

This writes `tools.json` (from `src/app/core/tools.ts`), the icons, and `dist/devtools24-extension.zip`.
Run it again after adding tools.

## Try it

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick this `extension` folder.

## Publish

Upload `dist/devtools24-extension.zip` in the Chrome Web Store Developer Dashboard (a one-time US$5 developer
account is needed). Edge Add-ons accepts the same zip. The listing needs: a 128 px icon (`icons/icon-128.png`), at
least one 1280×800 screenshot, a short description, and a privacy note: "No data is collected. Selected text is put in
a devtools24.in link and is processed in the browser."
