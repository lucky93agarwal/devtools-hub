import { ToolContent } from '../../shared/tool-info/tool-info';

export const QR_CONTENT: ToolContent = {
  aboutHeading: 'About this QR code generator',
  about:
    'Make a QR code for a link, an app deep link, any text, a Wi-Fi network, an email or a phone number. The code ' +
    'is drawn in your browser and can be saved as a sharp PNG up to 2048 pixels or as an SVG that scales to any ' +
    'size for print. Codes are static: they hold the data itself, never expire and do not pass through a ' +
    'redirect service that tracks scans. Text in any language and emoji are encoded as UTF-8.',
  steps: [
    'Choose Link or text, Wi-Fi, Email or Phone and fill in the details.',
    'Pick the error correction level, colours and quiet zone. The preview updates as you type.',
    'Scan the preview with your phone to test it.',
    'Download it as PNG for screens and documents or as SVG for print.',
  ],
  faq: [
    {
      question: 'Do these QR codes expire or track scans?',
      answer:
        'No. The link or text is stored in the code itself, so it works for as long as the link does. Nothing is ' +
        'counted or redirected, and no account is needed.',
    },
    {
      question: 'Which error correction level should I choose?',
      answer:
        'Medium suits most uses. Choose High if the code will be printed small, may get dirty, or will have a logo ' +
        'placed over its centre. Higher levels make the code denser.',
    },
    {
      question: 'How do I test a deep link in my mobile app?',
      answer:
        'Enter the link, such as myapp://orders/42 or an https App Link, and scan the preview with the phone that ' +
        'has the app installed. The camera app offers to open it.',
    },
    {
      question: 'Is my Wi-Fi password safe?',
      answer:
        'It is only used to draw the code in your browser and is never sent anywhere. Anyone who scans the code can ' +
        'read the password, so share it only with people you trust.',
    },
  ],
};
