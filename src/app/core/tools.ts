/**
 * Registry of every tool. Routes, the top bar and the home grid all read from here,
 * so adding a tool means adding one entry.
 */
export interface ToolInfo {
  /** URL path without a leading slash. */
  path: string;
  /** Full name, used in the page title and H1. */
  name: string;
  /** One-line description, used on the home card and under the H1. */
  description: string;
  /** Browser tab and search result title; " | DevTools Hub" is added after it. */
  seoTitle: string;
  /** Search result snippet, about 150 characters. */
  metaDescription: string;
  /** SVG path data for a 24x24 stroke icon. */
  icon: string;
  /** Phase of the roadmap in which the tool ships. */
  phase: number;
  /** Shown as a card on the home page. */
  onHome: boolean;
  /** Built and usable. Tools that are not live show a "coming soon" page kept out of search results. */
  live: boolean;
}

export const TOOLS: readonly ToolInfo[] = [
  {
    path: 'json-formatter',
    name: 'JSON Formatter and Validator',
    description: 'Format, minify and validate JSON with clear error messages.',
    seoTitle: 'JSON Formatter and Validator Online',
    metaDescription:
      'Format, minify and validate JSON in your browser. See each error with its line and column, upload files up to 20 MB, then copy or download the result.',
    icon: 'M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1',
    phase: 1,
    onHome: true,
    live: true,
  },
  {
    path: 'json-compare',
    name: 'JSON Compare',
    description: 'See what was added, removed or changed between two JSON documents.',
    seoTitle: 'JSON Compare: Diff Two JSON Files Online',
    metaDescription:
      'Compare two JSON documents side by side and see what was added, removed or changed. Ignore key order or hide unchanged lines. Runs in your browser.',
    icon: 'M4 4h6v16H4zM14 4h6v16h-6zM7 9h0M17 9h0M7 13h0M17 15h0',
    phase: 1,
    onHome: true,
    live: true,
  },
  {
    path: 'image-converter',
    name: 'Image Converter',
    description: 'Convert up to 15 images at once between JPG, PNG, WebP, AVIF, HEIC, GIF, TIFF, ICO and more.',
    seoTitle: 'Image Converter: JPG, PNG, WebP, HEIC, AVIF',
    metaDescription:
      'Convert JPG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO and SVG images, 15 at a time. Set quality, resize and download a ZIP. Nothing is uploaded.',
    icon: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h0',
    phase: 2,
    onHome: true,
    live: true,
  },
  {
    path: 'jwt',
    name: 'JWT Decoder and Verifier',
    description: 'Decode, verify and create JSON Web Tokens without sending them anywhere.',
    seoTitle: 'JWT Decoder, Verifier and Generator',
    metaDescription:
      'Decode JSON Web Tokens, check HS256, RS256 and ES256 signatures, and create test tokens. Dates show in your time zone. Tokens stay in your browser.',
    icon: 'M14 10a4 4 0 1 0-3.5 4L12 16h2v2h2v2h4v-3l-6.5-6.5',
    phase: 3,
    onHome: true,
    live: true,
  },
  {
    path: 'image-resizer',
    name: 'Image Resizer',
    description: 'Resize images to an exact size, by percent or for social media, and keep files under a size limit.',
    seoTitle: 'Resize Images Online: Exact Size or KB Limit',
    metaDescription:
      'Resize up to 15 images to an exact width and height, by percent or for Instagram and YouTube, and keep them under a KB limit. Nothing is uploaded.',
    icon: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
    phase: 2,
    onHome: true,
    live: true,
  },
  {
    path: 'image-cropper',
    name: 'Image Cropper',
    description: 'Crop images with a free or fixed shape, rotate and flip them, or cut a circle.',
    seoTitle: 'Crop Images Online, Free and Private',
    metaDescription:
      'Crop photos to 1:1, 4:5, 16:9 or any shape, rotate and flip them, or make a round profile picture. Your image never leaves your browser.',
    icon: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
    phase: 2,
    onHome: true,
    live: true,
  },
  {
    path: 'background-remover',
    name: 'Background Remover',
    description: 'Remove an image background on your own device and download a transparent PNG.',
    seoTitle: 'Remove Image Background: Free and Private',
    metaDescription:
      'Remove the background from a photo and download a transparent PNG. The AI runs on your own device, so your image is never uploaded. Free, no sign-up.',
    icon: 'M6 3l12 12M6 15l3-3M12 9l3-3M4 21h16M8 21a4 4 0 0 1 8 0',
    phase: 5,
    onHome: true,
    live: true,
  },
  {
    path: 'api-client',
    name: 'API Client',
    description: 'Send HTTP requests and read responses, with collections, environments and Postman import.',
    seoTitle: 'API Client: Test REST APIs Online',
    metaDescription:
      'Send GET, POST, PUT and DELETE requests with headers, auth and JSON bodies. Collections, environments, cURL and Postman import. Free.',
    icon: 'M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3',
    phase: 6,
    onHome: true,
    live: true,
  },
  {
    path: 'json-to-code',
    name: 'JSON to Code',
    description: 'Turn JSON into model classes for Kotlin, Java, TypeScript, Dart, Swift, C#, Python, Go, Rust, PHP and Ruby.',
    seoTitle: 'JSON to Code: Kotlin, Swift, Dart and More',
    metaDescription:
      'Convert JSON to Kotlin, Java, TypeScript, Dart, Swift, C#, Python, Pydantic, Go, Rust, PHP and Ruby classes. Free, and your JSON stays in your browser.',
    icon: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
    phase: 6,
    onHome: true,
    live: true,
  },
  {
    path: 'data-converter',
    name: 'Data Converter',
    description: 'Convert between JSON, YAML, XML and CSV, in either direction.',
    seoTitle: 'Convert JSON to YAML, XML and CSV (and Back)',
    metaDescription:
      'Free JSON to YAML, YAML to JSON, XML to JSON and JSON to CSV converter. Errors shown by line, and your data never leaves your browser.',
    icon: 'M4 7h13l-3-3M20 17H7l3 3',
    phase: 6,
    onHome: true,
    live: true,
  },
  {
    path: 'xml-formatter',
    name: 'XML Formatter and Validator',
    description: 'Format, minify and validate XML, keeping comments, CDATA and attributes as written.',
    seoTitle: 'XML Formatter and Validator Online',
    metaDescription:
      'Format, minify and validate XML online. Errors shown by line, comments and CDATA kept, and your XML never leaves your browser.',
    icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    phase: 6,
    onHome: true,
    live: true,
  },
  {
    path: 'yaml-validator',
    name: 'YAML Validator and Formatter',
    description: 'Check YAML for mistakes and format it, with errors shown by line.',
    seoTitle: 'YAML Validator and Formatter Online',
    metaDescription:
      'Validate and format YAML for Docker Compose, Kubernetes and CI files. Errors by line, comments kept, and nothing is uploaded.',
    icon: 'M5 6h14M5 12h9M5 18h12M17 15l2 2 4-4',
    phase: 6,
    onHome: true,
    live: true,
  },
  {
    path: 'app-icon-generator',
    name: 'App Icon Generator',
    description: 'Create every Android and iOS app icon size from one image, ready for your project.',
    seoTitle: 'App Icon Generator for Android and iOS',
    metaDescription:
      'Make Android mipmaps, adaptive icons, the Play Store icon and an iOS AppIcon.appiconset from one image. Free, and nothing is uploaded.',
    icon: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
    phase: 6,
    onHome: true,
    live: true,
  },
];

/** Links in the top bar, in display order. */
export const NAV_LINKS: readonly { label: string; path: string }[] = [
  { label: 'JSON', path: 'json-formatter' },
  { label: 'Compare', path: 'json-compare' },
  { label: 'Images', path: 'image-converter' },
  { label: 'JWT', path: 'jwt' },
  { label: 'JSON to Code', path: 'json-to-code' },
  { label: 'Data', path: 'data-converter' },
  { label: 'API', path: 'api-client' },
];
