# Chrome Web Store listing: copy into the Developer Dashboard

Upload: `dist/devtools24-extension.zip` (run `node scripts/build-extension.mjs` first).
Images: `extension/store/` (run `node scripts/extension-store-images.mjs`).

## Store listing tab

**Name** (from the manifest): DevTools24

**Summary** (max 132 characters, from the manifest):
Open selected text in DevTools24: format JSON, decode JWT, Base64 and URLs, explain cron. Search 80+ developer tools.

**Description**:

DevTools24 puts 80+ free developer tools one click away.

• Right-click any selected text and choose DevTools24 to open it in the right tool:
  – Format and validate JSON
  – Decode a JWT
  – Decode Base64 or a URL-encoded string
  – Turn a Unix timestamp into a date
  – Explain a cron expression
  – Hash text with SHA-256, MD5 and more
  – Or "detect" to let the extension pick the tool from the text
• Click the toolbar button, or press Alt+Shift+D, to search every tool: JSON, JWT, regex, Base64, UUID,
  QR codes, image and video tools, Kotlin and Dart playgrounds and more.

Private by design: the extension reads no web pages and collects nothing. Selected text is put in the
part of a devtools24.in link after the # sign, which browsers never send to a server, and the tools run
in your browser.

**Category**: Developer Tools
**Language**: English

**Graphic assets**:
- Store icon 128×128: `extension/icons/icon-128.png`
- Screenshots 1280×800: `extension/store/screenshot-1-search.png`, `extension/store/screenshot-2-right-click.png`
- Small promo tile 440×280: `extension/store/promo-small-440x280.png`

**Official URL / homepage**: https://devtools24.in
**Support URL**: https://devtools24.in/contact

## Privacy practices tab

**Single purpose**:
Open text the user selects in the matching DevTools24 developer tool, and search DevTools24's tools.

**Permission justification: contextMenus**:
Adds the "DevTools24" item to the right-click menu for selected text, so the user can open that text in a tool.

**Remote code**: No, I am not using remote code. (All extension scripts are in the package. Links open devtools24.in in a normal tab.)

**Data usage**: tick none of the data types. The extension does not collect or transmit user data.
Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: https://devtools24.in/privacy

## Distribution tab

Visibility: Public. Regions: all.

## Edge Add-ons (optional)

The same zip and texts work at https://partner.microsoft.com/dashboard/microsoftedge (free developer account).
