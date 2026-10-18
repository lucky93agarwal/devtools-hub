/** Explanation and FAQ text for the Image Resizer. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const IMAGE_RESIZER_CONTENT: ToolContent = {
  aboutHeading: 'About this image resizer',
  about:
    'Resize up to 15 images at once to an exact width and height, by percent, or to a ready-made size for Instagram, ' +
    'YouTube, Facebook, X, LinkedIn or a passport photo. Choose whether the image fits inside, fills the size and ' +
    'crops the edges, or gets coloured borders, and set a maximum file size for forms that only accept small uploads. ' +
    'Everything happens in your browser.',
  steps: [
    'Add images: JPG, PNG, WebP, HEIC and more.',
    'Choose width and height, a percent, or a social media size.',
    'Optionally pick the format, quality and a maximum file size in KB.',
    'Choose Resize, then download each image or all of them as a ZIP.',
  ],
  faq: [
    {
      question: 'Are my images uploaded?',
      answer: 'No. They are resized by your own browser and never leave your device.',
    },
    {
      question: 'How do I keep the shape of my image?',
      answer:
        'Fill in only the width or only the height, and the other side follows. With both filled in, choose Fit inside ' +
        'to keep the shape within that size.',
    },
    {
      question: 'How does the maximum file size work?',
      answer:
        'The resizer first lowers the quality step by step and keeps the highest quality that fits. If even low ' +
        'quality is too big, it makes the image smaller until it fits. PNG has no quality setting, so only its size ' +
        'can change; choose JPG or WebP for the smallest files.',
    },
    {
      question: 'Can it make images bigger?',
      answer:
        'Yes, with a width and height or a percent above 100. Enlarging cannot add detail, so very large enlargements ' +
        'look soft.',
    },
  ],
};
