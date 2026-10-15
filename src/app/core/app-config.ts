/**
 * Single place for site-wide settings and limits.
 * Change a value here and every tool picks it up.
 */
export const SITE_NAME = 'DevTools Hub';

export const LIMITS = {
  /** Maximum images per batch in the image converter. */
  MAX_IMAGES: 15,
  /** Maximum size of one image, in bytes (20 MB). */
  MAX_IMAGE_BYTES: 20 * 1024 * 1024,
  /** Maximum total size of one batch, in bytes (150 MB). */
  MAX_BATCH_BYTES: 150 * 1024 * 1024,
} as const;
