/** Explanation and FAQ text shown below the JSON formatter, mainly for search engines. */
import { FaqItem, ToolContent } from '../../shared/tool-info/tool-info';

export const COMMON_ERRORS: { name: string; example: string; fix: string }[] = [
  {
    name: 'Trailing comma',
    example: '[1, 2, 3,]',
    fix: 'Remove the comma after the last item in an array or object.',
  },
  {
    name: 'Missing comma',
    example: '{"a": 1 "b": 2}',
    fix: 'Put a comma between every two values or properties.',
  },
  {
    name: 'Single quotes',
    example: "{'name': 'Ada'}",
    fix: 'JSON strings and property names must use double quotes.',
  },
  {
    name: 'Unquoted property names',
    example: '{name: "Ada"}',
    fix: 'Wrap every property name in double quotes.',
  },
  {
    name: 'Comments',
    example: '{"a": 1 // note}',
    fix: 'JSON has no comments. Remove them or move the note into a property.',
  },
  {
    name: 'Values JSON does not know',
    example: '{"a": undefined, "b": NaN}',
    fix: 'Use null, a number, a string, true or false instead.',
  },
];

export const FAQ: FaqItem[] = [
  {
    question: 'Is my JSON uploaded anywhere?',
    answer:
      'No. Formatting, minifying and validation run in your browser. The JSON you paste or upload is never sent to a server.',
  },
  {
    question: 'What is the difference between Format and Minify?',
    answer:
      'Format adds line breaks and indentation so people can read the JSON. Minify removes all optional spaces and line breaks, which makes the file as small as possible for sending or storing.',
  },
  {
    question: 'How large a file can I format?',
    answer:
      'You can upload files up to 20 MB. Large inputs are processed in the background, so the page stays responsive while it works.',
  },
  {
    question: 'Why is my JSON invalid when JavaScript accepts it?',
    answer:
      'JavaScript object literals allow single quotes, unquoted keys, trailing commas and comments. JSON allows none of these. The error message shows the line and column of the first problem, and clicking it jumps there.',
  },
  {
    question: 'Does formatting change my data?',
    answer:
      'No. Only spaces and line breaks change. Keys stay in their order, numbers keep their exact digits (so 1.0 stays 1.0 and very large IDs are not rounded), escape sequences in strings are kept, and repeated keys are not removed.',
  },
];

export const FORMATTER_CONTENT: ToolContent = {
  aboutHeading: 'About this JSON formatter',
  about:
    'Paste or upload JSON to make it readable, shrink it, or find out exactly why it does not parse. The checker names ' +
    'the first problem in plain words with its line and column, and the editor marks the spot. Everything runs in ' +
    'your browser, so private API responses and config files stay on your device.',
  steps: [
    'Paste JSON into the Input box, or choose Upload file to open a .json file.',
    'Choose Format for readable output with 2 spaces, 4 spaces or tabs, or Minify for the smallest size.',
    'If the JSON is invalid, click the error message to jump to the line and fix it.',
    'Copy the result or download it as a file.',
  ],
  faq: FAQ,
};
