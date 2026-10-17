# DevTools Hub

[![CI](https://github.com/lucky93agarwal/devtools-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/lucky93agarwal/devtools-hub/actions/workflows/ci.yml)

Free, privacy-first developer tools that run entirely in the browser. Nothing you paste or upload is sent to a server.

**Live site:** https://devtools-hub.agarwal-lucky93.workers.dev

## Tools

| Tool | Status |
|---|---|
| [JSON Formatter and Validator](https://devtools-hub.agarwal-lucky93.workers.dev/json-formatter) | Live |
| [JSON Compare](https://devtools-hub.agarwal-lucky93.workers.dev/json-compare) | Live |
| [Image Converter](https://devtools-hub.agarwal-lucky93.workers.dev/image-converter) | Live |
| [JWT Decoder and Verifier](https://devtools-hub.agarwal-lucky93.workers.dev/jwt) | Live (decode, verify and create) |
| [Background Remover](https://devtools-hub.agarwal-lucky93.workers.dev/background-remover) | Live |
| [JSON to Code](https://devtools-hub.agarwal-lucky93.workers.dev/json-to-code) | Live (Kotlin, Java, TypeScript, Dart, Swift, C#, Python, Pydantic, Go, Rust, PHP, Ruby, JSON Schema, Protobuf, GraphQL, SQL) |
| [Data Converter](https://devtools-hub.agarwal-lucky93.workers.dev/data-converter) | Live (JSON, YAML, XML, CSV both ways) |
| [XML Formatter and Validator](https://devtools-hub.agarwal-lucky93.workers.dev/xml-formatter) | Live |
| [YAML Validator and Formatter](https://devtools-hub.agarwal-lucky93.workers.dev/yaml-validator) | Live |
| [App Icon Generator](https://devtools-hub.agarwal-lucky93.workers.dev/app-icon-generator) | Live (Android and iOS) |
| App Icon Generator | Planned |

## Deployment

Every push to `main` is tested and deployed automatically.

| What | Where |
|---|---|
| Live site | https://devtools-hub.agarwal-lucky93.workers.dev |
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
