import { ToolContent } from '../../shared/tool-info/tool-info';

export const REGEX_CONTENT: ToolContent = {
  aboutHeading: 'About this regex tester',
  about:
    'Write a regular expression and see every match highlighted in your text as you type, with capture groups, ' +
    'named groups and positions in a table. Try a replacement with $1 or $<name> references, read what each part ' +
    'of the pattern means in plain English, and copy it as code for JavaScript, Python, Java, Kotlin, Go, PHP or C#. ' +
    'Ready-made patterns cover emails, URLs, IP addresses, dates, UUIDs and Indian formats such as mobile numbers, ' +
    'PAN, GSTIN, IFSC and PIN codes. Patterns run in a separate thread and are stopped if they take too long.',
  steps: [
    'Type a pattern, or start from one of the common patterns.',
    'Turn on the flags you need, such as g for every match or i to ignore case.',
    'Paste your test text and check the highlighted matches and the groups table.',
    'Try a replacement, read the explanation, then copy the pattern as code for your language.',
  ],
  faq: [
    {
      question: 'Which regex flavour does this use?',
      answer:
        'JavaScript’s, as in Chrome and Node.js. Python, Java, Go and PHP agree on most syntax; differences are ' +
        'mainly named groups ((?P<name>…) in Python and Go), lookbehind (not in Go) and Unicode classes.',
    },
    {
      question: 'Why was my pattern stopped?',
      answer:
        'Some patterns, such as (a+)+$ or (.*)*, can try billions of ways to match before failing. This is called ' +
        'catastrophic backtracking and can freeze a server too. Make repeats more specific or remove the nesting.',
    },
    {
      question: 'How do I refer to a group in the replacement?',
      answer: 'Use $1, $2 and so on for numbered groups, $<name> for named groups and $& for the whole match.',
    },
    {
      question: 'Is my text uploaded?',
      answer: 'No. Matching happens in your browser. A Share link puts the pattern and text in the link itself.',
    },
  ],
};
