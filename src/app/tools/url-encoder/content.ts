import { ToolContent } from '../../shared/tool-info/tool-info';

export const URL_CONTENT: ToolContent = {
  aboutHeading: 'About this URL encoder and parser',
  about:
    'URLs can only carry a limited set of characters, so spaces, accents, & and = inside a value must be ' +
    'percent-encoded, such as %20 for a space. This tool encodes and decodes text the way browsers do, either as a ' +
    'single query value or path part (encodeURIComponent) or as a whole URL that keeps its : / ? & characters ' +
    '(encodeURI). The parser splits a URL into protocol, host, port, path, fragment and a table of decoded query ' +
    'parameters you can edit, and rebuilds the encoded URL for you.',
  steps: [
    'Choose Encode or Decode and type or paste your text.',
    'When encoding, choose whether it is a single value or a whole URL, and whether spaces become +.',
    'To inspect a URL, paste it under Parse a URL and read its parts and parameters.',
    'Edit, add or remove parameters, then copy the rebuilt URL.',
  ],
  faq: [
    {
      question: 'What is the difference between encodeURIComponent and encodeURI?',
      answer:
        'encodeURIComponent escapes every character with a meaning in a URL, including / ? & = and #, so use it for ' +
        'one value. encodeURI leaves those characters alone so a complete URL still works.',
    },
    {
      question: 'Should a space be %20 or +?',
      answer:
        'Both are common. %20 works everywhere in a URL. + means a space only in query strings sent by HTML forms ' +
        '(application/x-www-form-urlencoded). Turn on the + option when your server expects form encoding.',
    },
    {
      question: 'Why does decoding say an escape is not valid?',
      answer:
        'A % must be followed by two hexadecimal digits, and the bytes together must be valid UTF-8. A lone % or a ' +
        'value encoded in another character set, such as Latin-1, cannot be decoded as UTF-8.',
    },
    {
      question: 'Is anything sent to a server?',
      answer: 'No. The URL is never opened or requested; it is only split and encoded in your browser.',
    },
  ],
};
