/** Explanation and FAQ text shown below the JSON formatter, mainly for search engines. */

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

export const FAQ: { question: string; answer: string }[] = [
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
      'Only spaces and line breaks change, and the order of keys stays the same. Two cases differ: integers larger than 9007199254740991 lose precision, and numbers are written in their shortest form, so 1.0 becomes 1. If an object repeats a key, the last value is kept.',
  },
];
