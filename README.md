# DevTools24

[![CI](https://github.com/lucky93agarwal/devtools-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/lucky93agarwal/devtools-hub/actions/workflows/ci.yml)

Free, privacy-first developer tools that run entirely in the browser. Nothing you paste or upload is sent to a server.

**Live site:** https://devtools24.in

## Tools

| Tool | Status |
|---|---|
| [JSON Formatter and Validator](https://devtools24.in/json-formatter) | Live |
| [JSON Compare](https://devtools24.in/json-compare) | Live |
| [Image Converter](https://devtools24.in/image-converter) | Live |
| [Image Resizer](https://devtools24.in/image-resizer) | Live (exact size, percent, social presets, KB limit) |
| [Image Cropper](https://devtools24.in/image-cropper) | Live (shapes, rotate, flip, circle) |
| [JWT Decoder and Verifier](https://devtools24.in/jwt) | Live (decode, verify and create) |
| [Background Remover](https://devtools24.in/background-remover) | Live |
| [JSON to Code](https://devtools24.in/json-to-code) | Live (Kotlin, Java, TypeScript, Dart, Swift, C#, Python, Pydantic, Go, Rust, PHP, Ruby, JSON Schema, Protobuf, GraphQL, SQL) |
| [Data Converter](https://devtools24.in/data-converter) | Live (JSON, YAML, XML, CSV both ways) |
| [API Client](https://devtools24.in/api-client) | Live (HTTP, GraphQL with schema explorer, WebSocket, Socket.IO, MQTT, AI and MCP requests, collections, environments, all Postman auth types, cURL and Postman import, raw/binary/GraphQL bodies and form-data files, response search, JSON tree with copy, type, JWT and link previews) |
| [XML Formatter and Validator](https://devtools24.in/xml-formatter) | Live |
| [YAML Validator and Formatter](https://devtools24.in/yaml-validator) | Live |
| [App Icon Generator](https://devtools24.in/app-icon-generator) | Live (Android and iOS) |
| App Icon Generator | Planned |

## Deployment

Every push to `main` is tested and deployed automatically.

| What | Where |
|---|---|
| Live site | https://devtools24.in |
| Deployment dashboard (Cloudflare Workers) | https://dash.cloudflare.com/909829c17e0b4061fb4da72309180706/workers/services/view/devtools-hub/production/deployments |
| CI runs (tests and build) | https://github.com/lucky93agarwal/devtools-hub/actions |

How it works:

1. GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs the unit tests and a production build.
2. Cloudflare Workers Builds runs `npm run build`, then `npx wrangler deploy`.
3. The site is served as static files from `dist/devtools-hub/browser` (see [wrangler.jsonc](wrangler.jsonc)). Unknown URLs get `404.html` with a 404 status.

The Worker name in the Cloudflare dashboard must stay `devtools-hub`, matching `wrangler.jsonc`, or the build fails.

## Tech stack

- Angular 22 (standalone components, signals), every page prerendered at build time
- Tailwind CSS 4, self-hosted Poppins, Inter and JetBrains Mono fonts
- Monaco editor for code input and output
- Vitest for unit tests
- Cloudflare Workers static assets for hosting

## Run locally

Requires Node.js 24 (see [.node-version](.node-version)).

```bash
npm ci
```

```bash
npm start
```

Then open http://localhost:4200.

## Test and build

```bash
npm test
```

```bash
npm run build
```

The build output is in `dist/devtools-hub/browser`. To preview it the way Cloudflare serves it:

```bash
npx wrangler dev
```

## Turning on ads (Google AdSense)

Ads are built in but stay off until the AdSense IDs are added. AdSense needs the site on its own domain first.
AdSense has no test IDs for websites, so to see where ads will go before then, add `?ad-preview` to any tool address
(for example `/json-formatter?ad-preview`): dashed boxes mark the ad spaces and nothing is loaded from Google.

1. In AdSense, add the site, then copy the publisher ID (`ca-pub-` and 16 digits).
2. Create two display ad units (Ads, By ad unit) and copy their IDs.
3. In AdSense, Privacy & messaging, create and publish the European regulations message (Google's consent form).
4. Put the three IDs in `ADS` in `src/app/core/app-config.ts` and push.

The build then adds the `google-adsense-account` tag, publishes `ads.txt`, shows labelled ad space below each tool, loads the ad script only after the page is idle, and switches the privacy policy and About page to describe the ads.
