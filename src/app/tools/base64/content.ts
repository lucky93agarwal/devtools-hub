import { ToolContent } from '../../shared/tool-info/tool-info';

export const BASE64_CONTENT: ToolContent = {
  aboutHeading: 'About this Base64 encoder and decoder',
  about:
    'Base64 turns any bytes into plain letters, digits, + and /, so binary data can travel inside JSON, email, ' +
    'URLs and config files. This tool encodes text as UTF-8 and files of any type, and decodes Base64 back to text ' +
    'or to the original file. It also reads Base64URL (the - and _ variant used in JWTs and URLs), input without ' +
    'padding, line-wrapped Base64 and data: URIs, and recognises images, PDFs and zip files by their first bytes.',
  steps: [
    'Choose Encode or Decode.',
    'Type or paste the text, or choose Encode a file to turn a file into Base64.',
    'Pick URL-safe output, 76-character lines or a data URI if you need them.',
    'Copy or download the result. Decoded files and images can be downloaded as they were.',
  ],
  faq: [
    {
      question: 'Is my data uploaded?',
      answer: 'No. Encoding and decoding happen in your browser, so files and secrets never leave your device.',
    },
    {
      question: 'What is the difference between Base64 and Base64URL?',
      answer:
        'Base64URL replaces + with - and / with _ and usually drops the = padding, so the value is safe in URLs and ' +
        'file names. JWTs use it. The decoder accepts both forms.',
    },
    {
      question: 'Why is the Base64 bigger than my file?',
      answer:
        'Base64 uses 4 characters for every 3 bytes, so it is about a third larger than the original. It is an ' +
        'encoding, not compression or encryption: anyone can decode it.',
    },
    {
      question: 'Why does decoding show “Binary data” instead of text?',
      answer:
        'The bytes are not readable UTF-8 text, for example an image, a PDF or a zip file. Download the result to ' +
        'open it; images are previewed on the page.',
    },
  ],
};
