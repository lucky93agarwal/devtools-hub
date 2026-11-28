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
  {
    slug: 'compress-pdf-under-1mb',
    title: 'How to Compress a PDF to Under 1 MB',
    description:
      'Shrink a PDF for email and upload limits: when lossless compression is enough, when to redraw pages as JPEG, and which DPI and quality to pick.',
    tools: ['compress-pdf', 'split-pdf', 'pdf-to-image'],
    updated: '2026-11-28',
  },
  {
    slug: 'test-file-upload-size-limits',
    title: 'How to Test File Upload Size Limits with Exact-Size Files',
    description:
      'Test "file too large" errors precisely: MB vs MiB, files of exactly 1,048,576 bytes, server and proxy limits, and a checklist for upload features.',
    tools: ['dummy-pdf-generator', 'merge-pdf', 'compress-pdf'],
    updated: '2026-11-28',
  },
  {
    slug: 'jasperreports-page-x-of-y-and-blank-pages',
    title: 'JasperReports: Page X of Y, Totals and Blank Pages',
    description:
      'Fix the most common JasperReports layout problems: Page X of Y with evaluationTime, report totals, and why reports print blank or extra pages.',
    tools: ['jrxml-debugger', 'jrxml-preview', 'jasper-expression-helper'],
    updated: '2026-11-28',
  },
  {
    slug: 'jasperreports-json-data-source',
    title: 'Using JSON Data in JasperReports',
    description:
      'Feed an API response to a JasperReports template: field declarations, fieldDescription paths, JsonDataSource, subDataSource for item lists and date handling.',
    tools: ['jrxml-field-mapper', 'jrxml-snippet-builder', 'jrxml-preview'],
    updated: '2026-11-28',
  },
  {
    slug: 'professional-email-from-hinglish-notes',
    title: 'Writing Professional Work Messages from Hinglish Notes',
    description:
      'Turn quick Hinglish notes into clear, polite work emails and Slack messages: structure, tone, subject lines, and ready examples for common situations.',
    tools: ['message-assistant'],
    updated: '2026-11-28',
  },
  {
    slug: 'merge-request-review-and-deploy-message',
    title: 'How to Ask for MR Review, Merge and Deployment',
    description:
      'A clear template for asking reviewers to merge backend and UI merge requests and deploy to QA or UAT, with examples for several tickets and bug fixes.',
    tools: ['message-assistant'],
    updated: '2026-11-28',
  },
  {
    slug: 'printable-invoice-html-css',
    title: 'Designing Printable Invoices in HTML and CSS',
    description:
      'Make HTML invoices and reports print cleanly: @page size and margins, page breaks, repeating table headers, fonts and converting the result to PDF.',
    tools: ['html-to-pdf', 'text-to-pdf', 'merge-pdf'],
    updated: '2026-11-28',
  },
  {
    slug: 'cron-expressions-explained',
    title: 'Cron Expressions Explained with Examples',
    description:
      'Read and write cron schedules: the five fields, ranges, steps and lists, common examples, time zones, and the differences in Quartz and Spring cron.',
    tools: ['cron-expression'],
    updated: '2026-11-28',
  },
];

export const guideFor = (slug: string) => GUIDES.find((g) => g.slug === slug);
export const guidesForTool = (toolPath: string) => GUIDES.filter((g) => g.tools.includes(toolPath));
