import { Article } from './article';

export const IMAGE_ARTICLES: Record<string, Article> = {
  'image-formats-for-the-web': {
    intro:
      'Images are usually the heaviest part of a web page, and the format you save them in can change their size several times over without any visible difference. JPG and PNG have served the web for decades; WebP and AVIF now offer much smaller files with support in every current browser. This guide explains what each format is good at and how to choose.',
    body: [
      { h: 'Lossy and lossless' },
      {
        p: 'Lossy compression throws away detail the eye is unlikely to miss, which makes photos much smaller. Lossless compression keeps every pixel exactly, which matters for screenshots, text, line art and logos. Some formats can do both.',
      },
      { h: 'JPG (JPEG)' },
      {
        ul: [
          'Lossy only, no transparency.',
          'Still the most compatible format for photos everywhere: email, old software, printers, every image viewer.',
          'Weak for text and sharp edges, which get blurry halos (compression artifacts).',
          'A quality setting around 75 to 85 is usually indistinguishable from the original for photos.',
        ],
      },
      { h: 'PNG' },
      {
        ul: [
          'Lossless, with full alpha transparency.',
          'Ideal for screenshots, diagrams, UI elements and logos with flat colours.',
          'Very large for photos, often five to ten times the size of a good JPG.',
          'PNG-8 (256 colours) can shrink simple graphics a lot more than PNG-24.',
        ],
      },
      { h: 'WebP' },
      {
        ul: [
          'Supports lossy and lossless compression, transparency and animation.',
          'Lossy WebP is typically around 25 to 35 percent smaller than a JPG of similar quality.',
          'Lossless WebP is usually smaller than PNG for the same image.',
          'Supported by all current versions of Chrome, Edge, Firefox and Safari (Safari since version 14 on macOS Big Sur and newer).',
        ],
      },
      { h: 'AVIF' },
      {
        ul: [
          'Based on the AV1 video codec; lossy and lossless, transparency, HDR and wide colour.',
          'Often 30 to 50 percent smaller than JPG at similar quality, and noticeably better than WebP at low file sizes.',
          'Slower to encode, which matters when images are converted on the fly.',
          'Supported by current Chrome, Edge, Firefox and Safari (Safari since version 16).',
        ],
      },
      { h: 'GIF, SVG and the rest' },
      {
        ul: [
          'GIF is limited to 256 colours and makes large animations. For animation, an MP4 or WebM video, or animated WebP, is much smaller.',
          'SVG is a vector format: it describes shapes, not pixels, so it stays sharp at any size and is tiny for icons and logos. It is the right choice for anything drawn rather than photographed.',
          'HEIC is the default photo format on iPhones. It compresses well, but most browsers cannot show it, so convert it before publishing.',
          'TIFF and BMP are for editing and printing workflows, not for web pages.',
          'ICO holds several sizes of a small icon in one file and is still used for the classic `favicon.ico`.',
        ],
      },
      { h: 'Which format for which image' },
      {
        table: {
          head: ['Image', 'Best choice', 'Fallback'],
          rows: [
            ['Photo', 'AVIF or WebP (lossy)', 'JPG'],
            ['Screenshot or diagram', 'WebP (lossless) or PNG', 'PNG'],
            ['Logo or icon', 'SVG', 'PNG or WebP'],
            ['Image with transparency', 'WebP or AVIF', 'PNG'],
            ['Short animation', 'Video (MP4/WebM) or animated WebP', 'GIF'],
            ['Email or documents', 'JPG or PNG', 'JPG or PNG'],
          ],
        },
      },
      { h: 'Serving modern formats with a fallback' },
      { p: 'The `<picture>` element lets the browser pick the first format it supports:' },
      {
        code: '<picture>\n  <source srcset="hero.avif" type="image/avif">\n  <source srcset="hero.webp" type="image/webp">\n  <img src="hero.jpg" alt="Team at work" width="1200" height="800">\n</picture>',
      },
      {
        p: 'Always set `width` and `height` (or an aspect ratio in CSS) so the browser reserves space and the page does not jump when the image loads. Add `loading="lazy"` to images below the fold.',
      },
      { h: 'Quality settings that work' },
      {
        ul: [
          'JPG: 75 to 85 for photos.',
          'WebP lossy: 75 to 80.',
          'AVIF: around 50 to 65 on its own scale often matches JPG at 80. Compare by eye, because scales differ between encoders.',
          'Check the result at 100 percent zoom on a sharp edge or a face. If you cannot see a difference, try lower.',
        ],
      },
      { h: 'Do not forget metadata' },
      {
        p: 'Photos from phones contain EXIF metadata, sometimes including GPS coordinates of where they were taken. Converting or re-encoding an image usually strips it, which is good for privacy and saves a few kilobytes.',
      },
      {
        note: 'The Image Converter on this site converts between JPG, PNG, WebP, AVIF, GIF, BMP, TIFF and ICO, and opens HEIC and SVG. The images are processed in your browser and never uploaded.',
      },
    ],
  },

  'resize-images-for-the-web': {
    intro:
      'A 4000-pixel photo straight from a phone camera can weigh several megabytes, yet it is shown in a column 800 pixels wide. Resizing images to the size they are actually displayed at is the simplest performance win there is. This guide covers how to choose dimensions, keep proportions, crop for social media and hit a file size limit.',
    body: [
      { h: 'Pixels, display size and high-density screens' },
      {
        p: 'The display size is how big the image appears on the page in CSS pixels. Phones and modern laptops have 2x or 3x pixel density, meaning one CSS pixel is drawn with 2 or 3 physical pixels. To look sharp, an image needs about twice its display width in actual pixels. An image shown at 600 CSS pixels wide therefore needs to be about 1200 pixels wide; going beyond 2x rarely adds anything visible.',
      },
      { h: 'Choosing a target size' },
      {
        table: {
          head: ['Use', 'Typical width'],
          rows: [
            ['Full-width hero image', '1920 to 2560 px'],
            ['Content image in an article', '1200 to 1600 px'],
            ['Card or thumbnail', '400 to 800 px'],
            ['Avatar', '128 to 256 px'],
            ['Open Graph / social share card', '1200 × 630 px'],
          ],
        },
      },
      { h: 'Keep the aspect ratio' },
      {
        p: 'The aspect ratio is width divided by height. If you change only one dimension, set the other to scale with it; otherwise the image stretches or squashes. To fit an image into a fixed box you have three options:',
      },
      {
        ul: [
          'Fit (contain): scale until the whole image fits inside the box, leaving empty bands if the ratios differ.',
          'Fill (cover): scale until the box is filled, cropping what overflows.',
          'Stretch: force both dimensions, distorting the image. Almost never what you want.',
        ],
      },
      { h: 'Cropping for social media' },
      {
        table: {
          head: ['Where', 'Size', 'Ratio'],
          rows: [
            ['Instagram square post', '1080 × 1080', '1:1'],
            ['Instagram portrait post', '1080 × 1350', '4:5'],
            ['Stories and Reels (Instagram, Facebook, YouTube Shorts)', '1080 × 1920', '9:16'],
            ['YouTube thumbnail', '1280 × 720', '16:9'],
            ['Link previews (Facebook, LinkedIn, X)', '1200 × 630', '1.91:1'],
          ],
        },
      },
      {
        p: 'Platforms change their recommendations from time to time, so treat these as a starting point. Keep faces and text away from the edges, since some apps crop previews further.',
      },
      { h: 'Upscaling' },
      {
        p: 'Making an image bigger than its original cannot add detail; it only makes the existing pixels larger and softer. If you need a large image, start from the largest original you have. Small upscales of 10 to 20 percent usually look fine; doubling usually does not.',
      },
      { h: 'Hitting a file size limit' },
      {
        p: 'Forms for job applications, government portals and exam registrations often demand a photo under, say, 100 KB or 50 KB. File size depends on both dimensions and compression, so work in this order:',
      },
      {
        ol: [
          'Resize to the pixel size the form asks for, or the smallest size that still looks right.',
          'Save as JPG, unless the form requires another format.',
          'Lower the quality step by step until the file fits. A tool that searches for the best quality under the limit saves the trial and error.',
          'If quality drops too far, reduce the dimensions a little more instead.',
        ],
      },
      { h: 'Responsive images' },
      {
        p: 'On a website, provide a few sizes and let the browser choose with `srcset` and `sizes`, so phones download a small file and large screens a large one:',
      },
      {
        code: '<img\n  src="photo-800.jpg"\n  srcset="photo-400.jpg 400w, photo-800.jpg 800w, photo-1600.jpg 1600w"\n  sizes="(max-width: 600px) 100vw, 600px"\n  alt="Mountain lake at sunrise"\n  width="1600" height="1067">',
      },
      { h: 'A quick checklist' },
      {
        ul: [
          'Resize to about twice the largest display width, no more.',
          'Keep the aspect ratio unless you crop on purpose.',
          'Crop to the platform ratio before uploading to social media.',
          'Compress with a modern format such as WebP or AVIF where you can.',
          'Set width and height on the `<img>` to avoid layout shift.',
        ],
      },
      {
        note: 'The Image Resizer here resizes by pixels, percent or social media presets and can aim for a file size limit; the Image Cropper crops to any ratio, rotates and flips. Both work in your browser without uploading the image.',
      },
    ],
  },

  'app-icon-sizes': {
    intro:
      'A mobile app needs its icon in many sizes: for different screen densities, for the home screen, settings and notifications, and for the stores. Android adds adaptive icons with separate layers, while iOS now builds most sizes from one large image. This guide lists what each platform expects and how to prepare a source image that works everywhere.',
    body: [
      { h: 'Start with a good source image' },
      {
        ul: [
          'Use a square image of at least 1024 × 1024 pixels, ideally exported from vector artwork.',
          'Keep the design simple: one recognisable shape that still reads at 48 pixels.',
          'Leave padding around the main shape. Both platforms mask the corners, and Android crops adaptive icons into different shapes.',
          'Avoid fine text and thin lines; they vanish at small sizes.',
        ],
      },
      { h: 'Android launcher icons' },
      {
        p: 'Android picks icons by screen density. The base size is 48 × 48 dp, which becomes these pixel sizes in the `mipmap` folders:',
      },
      {
        table: {
          head: ['Folder', 'Density', 'Size'],
          rows: [
            ['mipmap-mdpi', '1x', '48 × 48'],
            ['mipmap-hdpi', '1.5x', '72 × 72'],
            ['mipmap-xhdpi', '2x', '96 × 96'],
            ['mipmap-xxhdpi', '3x', '144 × 144'],
            ['mipmap-xxxhdpi', '4x', '192 × 192'],
          ],
        },
      },
      { h: 'Android adaptive icons' },
      {
        p: 'Since Android 8.0 (API 26), launcher icons are adaptive: a foreground layer and a background layer, each 108 × 108 dp. The launcher masks them into a circle, squircle or rounded square depending on the device, and can move the layers slightly for parallax effects.',
      },
      {
        ul: [
          'Only the central 72 × 72 dp is guaranteed to be visible.',
          'Keep important content inside the central 66 dp circle, the safe zone.',
          'The background layer is usually a solid colour or a simple pattern; the foreground holds the logo on a transparent background.',
          'They are declared in `mipmap-anydpi-v26/ic_launcher.xml` with `<adaptive-icon>`, plus an optional monochrome layer for themed icons on Android 13 and later.',
        ],
      },
      { h: 'Google Play' },
      {
        p: 'The Play Store listing needs a 512 × 512 pixel PNG of up to 1 MB. Google Play applies its own rounding and shadow, so upload a full square without rounded corners.',
      },
      { h: 'iOS app icons' },
      {
        p: 'Since Xcode 14 an app can provide a single 1024 × 1024 icon and let Xcode generate the smaller sizes. Many teams still provide each size by hand to fine-tune small ones, and older Xcode versions require them. The classic set in the asset catalog (`AppIcon.appiconset`) is:',
      },
      {
        table: {
          head: ['Use', 'Points', 'Pixels'],
          rows: [
            ['iPhone home screen', '60 pt', '120 (@2x), 180 (@3x)'],
            ['iPad home screen', '76 pt', '152 (@2x)'],
            ['iPad Pro home screen', '83.5 pt', '167 (@2x)'],
            ['Spotlight', '40 pt', '80 (@2x), 120 (@3x)'],
            ['Settings', '29 pt', '58 (@2x), 87 (@3x)'],
            ['Notifications', '20 pt', '40 (@2x), 60 (@3x)'],
            ['App Store', '1024 pt', '1024 (@1x)'],
          ],
        },
      },
      { h: 'iOS rules to remember' },
      {
        ul: [
          'The App Store icon must not have transparency or an alpha channel; submissions are rejected otherwise.',
          'Do not round the corners yourself. iOS applies its own mask.',
          'iOS 18 adds dark and tinted variants of the icon. You can provide them in Xcode or let the system tint the default one.',
        ],
      },
      { h: 'Web and PWA icons' },
      {
        p: 'A progressive web app lists its icons in the web app manifest, typically 192 × 192 and 512 × 512, plus a maskable version with extra padding for Android. Browsers also look for a 180 × 180 `apple-touch-icon` and a `favicon.ico` or SVG favicon.',
      },
      { h: 'A workflow that saves time' },
      {
        ol: [
          'Design the icon as vector artwork on a square canvas with generous padding.',
          'Export one 1024 × 1024 PNG with a transparent background for the foreground, and decide on a background colour.',
          'Generate the Android mipmaps, adaptive icon layers and Play Store icon, and the iOS asset catalog from that single image.',
          'Check the result on a real device, in light and dark mode, at the smallest size in the settings screen.',
        ],
      },
      {
        note: 'The App Icon Generator on this site creates the Android mipmap folders, adaptive icon XML and Play Store icon, and an iOS AppIcon.appiconset, from one image, as a ZIP file. The image stays in your browser.',
      },
    ],
  },
};
