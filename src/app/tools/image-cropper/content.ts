/** Explanation and FAQ text for the Image Cropper. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const IMAGE_CROPPER_CONTENT: ToolContent = {
  aboutHeading: 'About this image cropper',
  about:
    'Crop a photo to exactly the part you want: drag the box, pick a shape such as 1:1 for profile pictures, 4:5 for ' +
    'Instagram or 16:9 for thumbnails, or type the size in pixels. Rotate or flip the image, crop it as a circle with ' +
    'transparent corners, and download it as JPG, PNG or WebP. The image never leaves your browser.',
  steps: [
    'Choose or paste an image (JPG, PNG, WebP, HEIC and more).',
    'Drag the box or its corners, or pick a shape. Arrow keys move it one pixel at a time.',
    'Rotate or flip the image if it is the wrong way round.',
    'Choose the format and download the cropped image.',
  ],
  faq: [
    {
      question: 'Is my image uploaded?',
      answer: 'No. It is cropped by your own browser and never sent to a server.',
    },
    {
      question: 'Does cropping lower the quality?',
      answer:
        'The pixels you keep are not resized, so they stay as sharp as the original. Saving as JPG or WebP compresses ' +
        'the result slightly; choose PNG to keep every pixel exactly.',
    },
    {
      question: 'How do I make a round profile picture?',
      answer:
        'Choose Circle. The box becomes a square with a round preview, and the image is saved as PNG with transparent ' +
        'corners.',
    },
    {
      question: 'How do I crop to an exact size in pixels?',
      answer:
        'Type the width and height in the number fields. To also change the size of the result, crop first and then ' +
        'use the Image Resizer.',
    },
  ],
};
