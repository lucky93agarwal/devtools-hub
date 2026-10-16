/** Explanation and FAQ text shown below the image converter, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const IMAGE_CONTENT: ToolContent = {
  aboutHeading: 'About this image converter',
  about:
    'Convert PNG, JPG and WebP images in batches of up to 15, right in your browser. Choose the output format, set ' +
    'the quality for JPG and WebP, resize if you need smaller pictures, and download each image or all of them as ' +
    'one ZIP file. Your images are never uploaded, which keeps private photos and screenshots on your device.',
  steps: [
    'Drop up to 15 images on the box, choose them with Choose images, or paste them.',
    'Pick the format to convert to: PNG, JPG or WebP.',
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
        'accepts JPG. PNG keeps every pixel exactly and supports transparency, but its files are larger for photos.',
    },
    {
      question: 'What happens to transparent areas when I convert to JPG?',
      answer: 'JPG cannot store transparency, so transparent areas become white instead of black.',
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
