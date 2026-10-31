import { ToolContent } from '../../shared/tool-info/tool-info';

export const TEXT_DIFF_SAMPLE = {
  original:
    'server:\n  host: 0.0.0.0\n  port: 8080\n  timeout: 30s\n\ndatabase:\n  url: postgres://db.internal:5432/shop\n' +
    '  pool: 10\n\nfeatures:\n  - search\n  - checkout\n',
  changed:
    'server:\n  host: 0.0.0.0\n  port: 9090\n  timeout: 30s\n\ndatabase:\n  url: postgres://db.internal:5432/shop\n' +
    '  pool: 25\n  ssl: true\n\nfeatures:\n  - search\n',
};

export const TEXT_DIFF_CONTENT: ToolContent = {
  aboutHeading: 'About this text diff checker',
  about:
    'Paste two versions of any text, such as config files, logs, SQL, code or a contract, and see exactly what ' +
    'changed. Removed lines are marked red and added lines green, with the changed words inside a line highlighted. ' +
    'Compare side by side or in one column, ignore spaces at the start and end of lines, or hide unchanged lines to ' +
    'focus on the differences. For JSON, the JSON Compare tool also ignores formatting and key order.',
  steps: [
    'Paste the original text on the left and the changed text on the right, or try the sample.',
    'The differences appear below as you type, with a count of changed, added and removed lines.',
    'Turn on Ignore spaces or Hide unchanged lines when the texts are long.',
    'Use Swap sides to see the change the other way round.',
  ],
  faq: [
    {
      question: 'Is my text uploaded?',
      answer: 'No. The comparison runs in your browser, so private files, keys and logs never leave your device.',
    },
    {
      question: 'How does it decide what changed?',
      answer:
        'It uses the same line-by-line diff algorithm as the Visual Studio Code editor, then highlights the changed ' +
        'characters inside lines that were edited rather than added or removed.',
    },
    {
      question: 'Why does every line show as changed?',
      answer:
        'Usually the line endings (Windows CRLF against Unix LF) or the indentation differ. Turn on Ignore spaces, or ' +
        'convert both texts to the same line endings in your editor.',
    },
    {
      question: 'Can I compare JSON or code?',
      answer:
        'Yes, any text works. For JSON, the JSON Compare tool formats both sides first so only real data changes show.',
    },
  ],
};
