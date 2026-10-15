/**
 * Registry of every tool. Routes, the top bar and the home grid all read from here,
 * so adding a tool means adding one entry.
 */
export interface ToolInfo {
  /** URL path without a leading slash. */
  path: string;
  /** Full name, used in the page title and H1. */
  name: string;
  /** One-line description, used for the meta description and the home card. */
  description: string;
  /** SVG path data for a 24x24 stroke icon. */
  icon: string;
  /** Phase of the roadmap in which the tool ships. */
  phase: number;
  /** Shown as a card on the home page. */
  onHome: boolean;
}

export const TOOLS: readonly ToolInfo[] = [
  {
    path: 'json-formatter',
    name: 'JSON Formatter and Validator',
    description: 'Format, minify and validate JSON with clear error messages.',
    icon: 'M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1',
    phase: 1,
    onHome: true,
  },
  {
    path: 'json-compare',
    name: 'JSON Compare',
    description: 'See what was added, removed or changed between two JSON documents.',
    icon: 'M4 4h6v16H4zM14 4h6v16h-6zM7 9h0M17 9h0M7 13h0M17 15h0',
    phase: 1,
    onHome: true,
  },
  {
    path: 'image-converter',
    name: 'Image Converter',
    description: 'Convert up to 15 images at once between PNG, JPG and WebP.',
    icon: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h0',
    phase: 2,
    onHome: true,
  },
  {
    path: 'jwt',
    name: 'JWT Decoder and Verifier',
    description: 'Decode, verify and create JSON Web Tokens without sending them anywhere.',
    icon: 'M14 10a4 4 0 1 0-3.5 4L12 16h2v2h2v2h4v-3l-6.5-6.5',
    phase: 3,
    onHome: true,
  },
  {
    path: 'background-remover',
    name: 'Background Remover',
    description: 'Remove an image background on your own device and download a transparent PNG.',
    icon: 'M6 3l12 12M6 15l3-3M12 9l3-3M4 21h16M8 21a4 4 0 0 1 8 0',
    phase: 5,
    onHome: true,
  },
  {
    path: 'json-to-model',
    name: 'JSON to Kotlin, Dart and Swift',
    description: 'Turn JSON into Kotlin data classes, Dart models or Swift Codable structs.',
    icon: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
    phase: 6,
    onHome: true,
  },
  {
    path: 'app-icon-generator',
    name: 'App Icon Generator',
    description: 'Create every Android and iOS app icon size from one image.',
    icon: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
    phase: 6,
    onHome: false,
  },
];

/** Links in the top bar, in display order. */
export const NAV_LINKS: readonly { label: string; path: string }[] = [
  { label: 'JSON', path: 'json-formatter' },
  { label: 'Compare', path: 'json-compare' },
  { label: 'Images', path: 'image-converter' },
  { label: 'JWT', path: 'jwt' },
  { label: 'Mobile tools', path: 'json-to-model' },
];
