/** Sizes and placement for resizing, and shrinking a file below a size limit. Pure, so it is easy to test. */

/** How the image goes into an exact width and height. */
export type FitMode =
  /** Keep the shape and fit inside; the result can be smaller on one side. */
  | 'fit'
  /** Fill the whole size, cutting off what sticks out (centred). */
  | 'fill'
  /** Keep the shape, centre it, and fill the empty sides with a colour. */
  | 'pad'
  /** Fill the whole size, changing the shape. */
  | 'stretch';

export type SizeSpec =
  | { mode: 'percent'; percent: number }
  /** Leave width or height empty (null) to work it out from the image's shape. */
  | { mode: 'size'; width: number | null; height: number | null; fit: FitMode };

export interface Layout {
  width: number;
  height: number;
  /** Part of the source to use, and where it goes on the output (drawImage's 8 numbers). */
  source: { x: number; y: number; width: number; height: number };
  target: { x: number; y: number; width: number; height: number };
}

/** Browsers refuse canvases larger than this on a side. */
export const MAX_SIDE = 16384;

const clampSide = (value: number) => Math.min(MAX_SIDE, Math.max(1, Math.round(value)));

export function layout(sourceWidth: number, sourceHeight: number, spec: SizeSpec): Layout {
  const whole = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const plain = (width: number, height: number): Layout => ({
    width,
    height,
    source: whole,
    target: { x: 0, y: 0, width, height },
  });

  if (spec.mode === 'percent') {
    const factor = spec.percent / 100;
    return plain(clampSide(sourceWidth * factor), clampSide(sourceHeight * factor));
  }

  const { width, height, fit } = spec;
  if (!width && !height) return plain(sourceWidth, sourceHeight);
  // One side given: the other follows the image's shape.
  if (!height) return plain(clampSide(width!), clampSide((sourceHeight * width!) / sourceWidth));
  if (!width) return plain(clampSide((sourceWidth * height) / sourceHeight), clampSide(height));

  const W = clampSide(width);
  const H = clampSide(height);
  const contain = Math.min(W / sourceWidth, H / sourceHeight);
  switch (fit) {
    case 'stretch':
      return plain(W, H);
    case 'fit':
      return plain(clampSide(sourceWidth * contain), clampSide(sourceHeight * contain));
    case 'pad': {
      const w = sourceWidth * contain;
      const h = sourceHeight * contain;
      return { width: W, height: H, source: whole, target: { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h } };
    }
    case 'fill': {
      const cover = Math.max(W / sourceWidth, H / sourceHeight);
      const sw = W / cover;
      const sh = H / cover;
      return {
        width: W,
        height: H,
        source: { x: (sourceWidth - sw) / 2, y: (sourceHeight - sh) / 2, width: sw, height: sh },
        target: { x: 0, y: 0, width: W, height: H },
      };
    }
  }
}

export interface Preset {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** Common sizes; the image fills them and the edges are cut where the shape differs. */
export const PRESETS: Preset[] = [
  { id: 'instagram-square', label: 'Instagram post (1:1)', width: 1080, height: 1080 },
  { id: 'instagram-portrait', label: 'Instagram post (4:5)', width: 1080, height: 1350 },
  { id: 'story', label: 'Instagram, WhatsApp or Facebook story', width: 1080, height: 1920 },
  { id: 'youtube-thumbnail', label: 'YouTube thumbnail', width: 1280, height: 720 },
  { id: 'youtube-banner', label: 'YouTube channel banner', width: 2560, height: 1440 },
  { id: 'facebook-post', label: 'Facebook post', width: 1200, height: 630 },
  { id: 'facebook-cover', label: 'Facebook cover', width: 820, height: 312 },
  { id: 'x-post', label: 'X (Twitter) post', width: 1600, height: 900 },
  { id: 'x-header', label: 'X (Twitter) header', width: 1500, height: 500 },
  { id: 'linkedin-post', label: 'LinkedIn post', width: 1200, height: 627 },
  { id: 'linkedin-banner', label: 'LinkedIn banner', width: 1584, height: 396 },
  { id: 'profile', label: 'Profile picture', width: 500, height: 500 },
  { id: 'passport', label: 'Passport photo (35×45 mm at 300 dpi)', width: 413, height: 531 },
  { id: 'full-hd', label: 'Full HD (1920×1080)', width: 1920, height: 1080 },
];

export interface ShrinkResult {
  blob: Blob;
  /** Scale of the final image, from 0 to 1. */
  scale: number;
  quality: number;
  /** False when even the smallest attempt was still too big. */
  reached: boolean;
}

/** Quality range tried for JPG, WebP and AVIF; below 0.3 photos look broken. */
const MIN_QUALITY = 0.3;
const MAX_QUALITY = 0.95;
const QUALITY_STEPS = 6;
const SCALE_STEP = 0.85;
const MAX_SCALE_STEPS = 12;

/**
 * Makes the file fit under `maxBytes`. For lossy formats it first looks for the
 * highest quality that fits; only if the lowest quality is still too big does it
 * make the image smaller. Lossless formats can only get smaller in pixels.
 * `encode` draws the image at a scale and quality and returns the file.
 */
export async function shrinkToSize(
  encode: (scale: number, quality: number) => Promise<Blob>,
  maxBytes: number,
  lossy: boolean,
  quality = MAX_QUALITY,
): Promise<ShrinkResult> {
  let scale = 1;
  for (let step = 0; step <= MAX_SCALE_STEPS; step++) {
    if (!lossy) {
      const blob = await encode(scale, quality);
      if (blob.size <= maxBytes) return { blob, scale, quality, reached: true };
    } else {
      const best = await bestQuality(encode, scale, maxBytes, quality);
      if (best) return { ...best, scale, reached: true };
    }
    if (step < MAX_SCALE_STEPS) scale *= SCALE_STEP;
  }
  const blob = await encode(scale, lossy ? MIN_QUALITY : quality);
  return { blob, scale, quality: lossy ? MIN_QUALITY : quality, reached: blob.size <= maxBytes };
}

/** Binary search for the highest quality under the limit at this scale, or null if none fits. */
async function bestQuality(
  encode: (scale: number, quality: number) => Promise<Blob>,
  scale: number,
  maxBytes: number,
  top: number,
): Promise<{ blob: Blob; quality: number } | null> {
  const first = await encode(scale, top);
  if (first.size <= maxBytes) return { blob: first, quality: top };
  let low = MIN_QUALITY;
  let high = top;
  let best: { blob: Blob; quality: number } | null = null;
  for (let i = 0; i < QUALITY_STEPS; i++) {
    const quality = Math.round(((low + high) / 2) * 100) / 100;
    const blob = await encode(scale, quality);
    if (blob.size <= maxBytes) {
      best = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }
  if (best) return best;
  const lowest = await encode(scale, MIN_QUALITY);
  return lowest.size <= maxBytes ? { blob: lowest, quality: MIN_QUALITY } : null;
}
