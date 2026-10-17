/** Explanation and FAQ text shown below the image converter, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const IMAGE_CONTENT: ToolContent = {
  aboutHeading: 'About this image converter',
  about:
    'Convert JPG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO and SVG images in batches of up to 15, right in your ' +
    'browser. Save them as JPG, PNG, WebP, AVIF, GIF, BMP, TIFF or ICO, set the quality for JPG, WebP and AVIF, resize ' +
    'if you need smaller pictures, and download each image or all of them as one ZIP file. Your images are never ' +
    'uploaded, which keeps private photos and screenshots on your device.',
  steps: [
    'Drop up to 15 images on the box, choose them with Choose images, or paste them.',
    'Pick the format to convert to, for example JPG, WebP or ICO.',
    'Optionally set the quality, resize the images or add a suffix to the file names.',
    'Choose Convert, then download single images or Download all as ZIP.',
  ],
  faq: [
    {
      question: 'Are my images uploaded to a server?',
      answer:
        'No. Images are decoded and converted by your own browser, and the results are created on your device. ' +
        'Nothing is sent anywhere.',
    },
    {
      question: 'Which format should I choose?',
      answer:
        'WebP usually gives the smallest files and works in all modern browsers. JPG is best when a site or app only ' +
        'accepts JPG. PNG keeps every pixel exactly and supports transparency, but its files are larger for photos. ' +
        'AVIF is often even smaller than WebP but takes a few seconds per photo to create. ICO is for website and app ' +
        'icons, and TIFF and BMP are for older programs and printing.',
    },
    {
      question: 'Can I convert iPhone HEIC photos?',
      answer:
        'Yes. HEIC and HEIF photos open in every browser here and can be saved as JPG, PNG, WebP or another format. ' +
        'Saving as HEIC is not offered, because no free encoder can be used in a browser.',
    },
    {
      question: 'What happens when I convert an SVG?',
      answer:
        'The drawing is turned into pixels, at least 1024 pixels on the longer side so small icons stay sharp. ' +
        'Converting a photo to SVG is not offered, because it would only wrap the pixels and not create real shapes.',
    },
    {
      question: 'What happens to transparent areas when I convert to JPG?',
      answer: 'JPG and BMP cannot store transparency, so transparent areas become white instead of black.',
    },
    {
      question: 'What quality setting should I use?',
      answer:
        'Between 80% and 90% looks the same as the original to most people and saves a lot of space. Lower values give ' +
        'smaller files with visible loss. PNG is lossless, so it has no quality setting.',
    },
    {
      question: 'Are there limits?',
      answer:
        'Up to 15 images per batch, 20 MB per image and 150 MB per batch. The limits protect phones from running out ' +
        'of memory. If you choose more, the first ones are kept and the page tells you what was left out.',
    },
  ],
};
