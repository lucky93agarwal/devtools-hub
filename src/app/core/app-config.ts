/**
 * Single place for site-wide settings and limits.
 * Change a value here and every tool picks it up.
 */
export const SITE_NAME = 'DevTools24';

/** Public address of the site, without a trailing slash. Used for canonical links and the sitemap. */
export const SITE_URL = 'https://devtools24.in';

/** Source code and the place to report bugs or ask for tools. */
export const REPO_URL = 'https://github.com/lucky93agarwal/devtools-hub';

/**
 * Umami Cloud visit counting. Copy both values from the Umami dashboard
 * (Website settings, Tracking code). While either is empty, no analytics script
 * loads and the privacy policy says so.
 */
export const ANALYTICS = {
  umamiScriptUrl: 'https://cloud.umami.is/script.js',
  umamiWebsiteId: 'bf4bcdb4-c125-4482-a8d5-1ac888e88da2',
} as const;

/**
 * Google AdSense. adsenseClient is the publisher ID from the AdSense account
 * ("ca-pub-" and 16 digits); each slot is the ID of a display ad unit made in
 * AdSense (Ads, By ad unit). While adsenseClient is empty, no ad script loads,
 * no ad space is shown, no ads.txt is published and the privacy policy says
 * there are no ads. A slot left empty is simply not shown.
 */
export const ADS = {
  adsenseClient: '',
  slots: {
    /** Below the tool, at the start of its explanation. */
    belowTool: '',
    /** Between the "How to use it" steps and the FAQ. */
    beforeFaq: '',
  },
} as const;

/** Google Search Console "HTML tag" verification code (only the content value). Empty adds no tag. */
export const GOOGLE_SITE_VERIFICATION = '';

export const LIMITS = {
  /** Maximum images per batch in the image converter. */
  MAX_IMAGES: 15,
  /** Maximum size of one image, in bytes (20 MB). */
  MAX_IMAGE_BYTES: 20 * 1024 * 1024,
  /** Maximum total size of one batch, in bytes (150 MB). */
  MAX_BATCH_BYTES: 150 * 1024 * 1024,
  /** Maximum JSON file size for upload, in bytes (20 MB). */
  MAX_JSON_BYTES: 20 * 1024 * 1024,
} as const;
