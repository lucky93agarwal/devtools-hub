/**
 * The guides: longer articles that explain the ideas behind the tools. Only the
 * list lives here (routes, tool pages and the sitemap read it); the text of each
 * guide is in pages/guides/articles and loads with the guide pages.
 */
export interface GuideInfo {
  slug: string;
  title: string;
  /** Search result snippet and the line under the title, about 150 characters. */
  description: string;
  /** Tools the guide belongs to; their pages link to it. */
  tools: string[];
  /** Date of the last real change, shown on the page. */
  updated: string;
}

export const GUIDES: readonly GuideInfo[] = [
  {
    slug: 'common-json-errors',
    title: 'Common JSON Errors and How to Fix Them',
    description:
      'Trailing commas, single quotes, comments, unquoted keys and more: the JSON syntax errors developers hit most often, what each message means and how to fix it.',
    tools: ['json-formatter', 'json-compare'],
    updated: '2026-10-30',
  },
  {
    slug: 'json-vs-yaml-vs-xml',
    title: 'JSON vs YAML vs XML: Differences and When to Use Each',
    description:
      'How JSON, YAML and XML compare for config files, APIs and data exchange, with the same data in all three and the traps to watch when you convert between them.',
    tools: ['data-converter', 'yaml-validator', 'xml-formatter'],
    updated: '2026-10-30',
  },
  {
    slug: 'what-is-a-jwt',
    title: 'What Is a JWT? Structure, Claims and How to Verify One',
    description:
      'A practical explanation of JSON Web Tokens: the header, payload and signature, the standard claims, why decoding is not verifying, and the mistakes that make tokens unsafe.',
    tools: ['jwt'],
    updated: '2026-10-30',
  },
  {
    slug: 'jwt-signing-algorithms',
    title: 'JWT Signing Algorithms Explained: HS256 vs RS256 vs ES256',
    description:
      'How HMAC, RSA and elliptic-curve signatures differ for JSON Web Tokens, which one to choose for your system, and how keys are shared and rotated.',
    tools: ['jwt'],
    updated: '2026-10-30',
  },
  {
    slug: 'cors-errors-explained',
    title: 'CORS Errors Explained and How to Fix Them',
    description:
      'Why browsers block some API calls, what preflight requests and Access-Control headers do, and how to fix CORS errors properly on your server.',
    tools: ['api-client'],
    updated: '2026-10-30',
  },
  {
    slug: 'http-methods-and-status-codes',
    title: 'HTTP Methods and Status Codes: A Practical Guide',
    description:
      'GET, POST, PUT, PATCH and DELETE, which are safe and idempotent, and what the status codes you meet every day mean, from 200 and 201 to 401, 429 and 503.',
    tools: ['api-client'],
    updated: '2026-10-30',
  },
  {
    slug: 'api-authentication-methods',
    title: 'API Authentication Methods Compared',
    description:
      'API keys, Basic auth, Bearer tokens, OAuth 2.0, HMAC signatures and AWS Signature Version 4: how each works, where it fits and how to send it correctly.',
    tools: ['api-client', 'jwt'],
    updated: '2026-10-30',
  },
  {
    slug: 'image-formats-for-the-web',
    title: 'WebP vs AVIF vs PNG vs JPG: Choosing an Image Format',
    description:
      'Which image format to use for photos, screenshots, logos and transparent graphics, how the modern formats compare on size and support, and when to keep JPG or PNG.',
    tools: ['image-converter'],
    updated: '2026-10-30',
  },
  {
    slug: 'resize-images-for-the-web',
    title: 'How to Resize Images for the Web Without Losing Quality',
    description:
      'Choosing the right pixel size for screens and high-density displays, keeping the aspect ratio, cropping for social media and hitting a file size limit.',
    tools: ['image-resizer', 'image-cropper', 'image-converter'],
    updated: '2026-10-30',
  },
  {
    slug: 'app-icon-sizes',
    title: 'App Icon Sizes for Android and iOS',
    description:
      'Every icon size an Android or iOS app needs, how adaptive icons and safe zones work, and how to prepare one source image that looks right everywhere.',
    tools: ['app-icon-generator'],
    updated: '2026-10-30',
  },
  {
    slug: 'compare-json-files',
    title: 'How to Compare Two JSON Files and Read the Differences',
    description:
      'Why a plain text diff gets JSON wrong, how a structural comparison works, and practical tips for comparing API responses, configs and test snapshots.',
    tools: ['json-compare', 'json-formatter'],
    updated: '2026-10-30',
  },
  {
    slug: 'json-to-typed-models',
    title: 'Turning JSON into Typed Models in TypeScript, Kotlin and Dart',
    description:
      'How to generate classes and interfaces from a sample JSON response, how types are inferred, and what to check by hand before using the code.',
    tools: ['json-to-code'],
    updated: '2026-10-30',
  },
];

export const guideFor = (slug: string) => GUIDES.find((g) => g.slug === slug);
export const guidesForTool = (toolPath: string) => GUIDES.filter((g) => g.tools.includes(toolPath));
