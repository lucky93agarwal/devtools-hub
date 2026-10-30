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
  adsenseClient: 'ca-pub-7468871768869194',
  slots: {
    /** Below the tool, at the start of its explanation. */
    belowTool: '1529008897',
    /** Between the "How to use it" steps and the FAQ. */
    beforeFaq: '4304090909',
  },
} as const;

/**
 * Ads from other networks, shown next to AdSense: two tall side ads on wide
 * screens and a popup ad on arrival and after clicks. Each value is a banner "key"
 * from an Adsterra publisher account (Websites, Get code, Banner). While a key is
 * empty, that place shows DevTools24's own "Advertise here" card instead.
 */
export const EXTRA_ADS = {
  /** 160 x 600 banner, used for both side ads. */
  railKey: 'c59e81b34e3d365626477d469b324cde',
  /** 300 x 250 banner, used in the popup. */
  popupKey: 'f8e426f4d247212ec83018234503a6cd',
  popup: {
    /** Set to false to turn the popup ad off. */
    enabled: true,
    /** Open once shortly after a visitor first arrives (once per browser session). */
    onFirstLoad: true,
    /** Then open again after every this many clicks. */
    everyClicks: 5,
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
