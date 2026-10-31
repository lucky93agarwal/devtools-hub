import { ToolContent } from '../../shared/tool-info/tool-info';

export const CASE_CONTENT: ToolContent = {
  aboutHeading: 'About this case converter',
  about:
    'Every language and file format has its naming style: camelCase in JavaScript and Java, snake_case in Python and ' +
    'SQL, kebab-case in CSS and URLs, CONSTANT_CASE for environment variables and PascalCase for classes. Paste a ' +
    'name, a phrase or a list with one per line and copy it in any style. Words are split at spaces, underscores, ' +
    'hyphens and capital letters, so acronyms such as HTTP stay together. The line tools sort, remove duplicates, ' +
    'trim and count lines, and the counter shows characters, words, lines and bytes.',
  steps: [
    'Type or paste text, a variable name, or a list with one name per line.',
    'Copy the naming style or letter case you need from the list.',
    'For lists, turn on the line tools: trim, remove empty lines or duplicates, sort or reverse.',
    'Choose Use as text to keep working on the result.',
  ],
  faq: [
    {
      question: 'Which naming style should I use?',
      answer:
        'Follow your language: camelCase for variables in JavaScript, TypeScript, Java, Kotlin and Swift; snake_case ' +
        'in Python, Ruby, Rust and SQL; PascalCase for classes and types; kebab-case for CSS classes, URLs and file names.',
    },
    {
      question: 'How are acronyms handled?',
      answer:
        'A run of capitals stays one word, so parseHTTPResponse splits into parse, HTTP and Response, and becomes ' +
        'parse_http_response in snake_case.',
    },
    {
      question: 'Why is the byte count different from the character count?',
      answer:
        'Characters such as é, ₹ or emoji take 2 to 4 bytes in UTF-8. Bytes matter for database column limits and ' +
        'request size limits; characters are what people see.',
    },
    {
      question: 'Is my text stored?',
      answer: 'No. Everything happens in your browser.',
    },
  ],
};
