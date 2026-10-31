import { ToolContent } from '../../shared/tool-info/tool-info';

export const NUMBER_BASE_CONTENT: ToolContent = {
  aboutHeading: 'About this number base converter',
  about:
    'Convert whole numbers between binary, octal, decimal, hexadecimal and any base from 2 to 36. Type in any box ' +
    'and the others update. There is no size limit, so 64-bit ids, hashes and huge values convert exactly. The ' +
    'fixed-size view shows how a number is stored in 8, 16, 32, 64 or 128 bits, including the two’s complement ' +
    'pattern of negative numbers and the signed value of a pattern with its top bit set.',
  steps: [
    'Type a number into the binary, octal, decimal, hexadecimal or custom base box.',
    'Prefixes such as 0x, 0b and 0o and separators such as _ are accepted.',
    'Turn grouping on or off to read long numbers more easily. Copy always gives plain digits.',
    'Choose a bit width to see the stored bit pattern and its signed and unsigned values.',
  ],
  faq: [
    {
      question: 'How do I convert a negative number to hex?',
      answer:
        'Type it in the decimal box with a minus sign. The hex box shows the plain value with a minus; the ' +
        'fixed-size section shows the two’s complement pattern, such as 0xFF for -1 in 8 bits.',
    },
    {
      question: 'Why does 200 show as -56 when signed?',
      answer:
        'In 8 bits, 200 is 1100 1000. Its top bit is set, so a signed 8-bit integer reads the same bits as 200 - 256 = -56.',
    },
    {
      question: 'Can it convert fractions?',
      answer: 'No. It converts whole numbers only, which is what bit patterns, ids and colour values use.',
    },
    {
      question: 'Is there a limit on size?',
      answer:
        'No. Numbers are handled as BigInt, so values beyond 2⁵³ that lose precision in JavaScript numbers are converted exactly.',
    },
  ],
};
