/** Explanation and FAQ text shown below the background remover, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const BACKGROUND_REMOVER_CONTENT: ToolContent = {
  aboutHeading: 'About this background remover',
  about:
    'Remove the background from a photo and download it as a PNG with a transparent background, without uploading ' +
    'the photo anywhere. A small AI model (U2-Netp, Apache-2.0 licence) finds the main subject, such as a person, ' +
    'pet or product, and runs inside your browser. The model and its runtime come from this site and are kept in ' +
    'your browser after the first use, so later images start straight away.',
  steps: [
    'Drop a PNG, JPG or WebP image on the box, choose it with Choose image, or paste it.',
    'The first time, wait a moment while the model downloads; after that it is ready at once.',
    'Check the result next to the original; transparent areas show as a checkerboard.',
    'Choose Download PNG to save the image with a transparent background.',
  ],
  faq: [
    {
      question: 'Is my photo uploaded to a server?',
      answer:
        'No. The model runs on your own device, in your browser. The only downloads are the model and the code that ' +
        'runs it, both from this site; your photo is never sent anywhere.',
    },
    {
      question: 'Why does the first image take longer?',
      answer:
        'The first time, your browser downloads the AI model and the runtime that executes it, about 18 MB in total. ' +
        'They are saved in your browser, so later images, even on another day, skip this step.',
    },
    {
      question: 'How good is the result?',
      answer:
        'It works well for clear subjects such as people, pets and products on a plain or busy background. Fine ' +
        'details like hair, fur and thin edges can be softer than with paid server-side tools, because the model is ' +
        'small enough to run on your device.',
    },
    {
      question: 'How long does it take?',
      answer:
        'A few seconds on a recent laptop. Phones and older computers can take noticeably longer, because all the ' +
        'work happens on your device instead of a server.',
    },
    {
      question: 'What image sizes are supported?',
      answer:
        'PNG, JPG and WebP images up to 20 MB. The result keeps the original width and height and is saved as PNG, ' +
        'the common format that supports transparency.',
    },
  ],
};
