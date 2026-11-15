/** The favicon files a website needs today, and the HTML and manifest that point to them. */

export interface FaviconFile {
  name: string;
  /** Square size in pixels. */
  size: number;
  /** Apple and Android home screen icons get the background colour; tab icons stay transparent. */
  opaque: boolean;
}

export const FAVICON_PNGS: readonly FaviconFile[] = [
  { name: 'favicon-16x16.png', size: 16, opaque: false },
  { name: 'favicon-32x32.png', size: 32, opaque: false },
  { name: 'apple-touch-icon.png', size: 180, opaque: true },
  { name: 'android-chrome-192x192.png', size: 192, opaque: false },
  { name: 'android-chrome-512x512.png', size: 512, opaque: false },
];

/** Sizes packed into favicon.ico, for old browsers and tools that read /favicon.ico. */
export const ICO_SIZES = [16, 32, 48];

/** Keeps a colour value safe to put in HTML and JSON. */
export function safeColour(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : '#ffffff';
}

/** Name text for the manifest, without characters that could break the HTML. */
export function safeName(name: string): string {
  return name.replace(/[<>"&]/g, '').trim().slice(0, 45) || 'My Website';
}

/** The tags to paste into the page's <head>. */
export function headTags(themeColour: string): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${safeColour(themeColour)}">`,
  ].join('\n');
}

/** The web app manifest, which Android uses for "Add to home screen". */
export function webManifest(name: string, themeColour: string, backgroundColour: string): string {
  const clean = safeName(name);
  return (
    JSON.stringify(
      {
        name: clean,
        short_name: clean.slice(0, 12),
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: safeColour(themeColour),
        background_color: safeColour(backgroundColour),
        display: 'standalone',
      },
      null,
      2,
    ) + '\n'
  );
}

/** Where the image sits in a square: centred, keeping its shape, with `padding` (0 to 0.4) around it. */
export function fit(width: number, height: number, size: number, padding: number) {
  const box = size * (1 - 2 * padding);
  const scale = box / Math.max(width, height);
  const w = width * scale;
  const h = height * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, width: w, height: h };
}
