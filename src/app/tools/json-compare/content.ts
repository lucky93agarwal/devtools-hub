/** Explanation and FAQ text shown below JSON Compare, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const COMPARE_CONTENT: ToolContent = {
  aboutHeading: 'About this JSON compare tool',
  about:
    'Paste two versions of a JSON document, such as two API responses or two config files, and see exactly what ' +
    'changed. Both sides are formatted the same way first, so spacing and line breaks never show up as differences. ' +
    'Old values are marked in red and new ones in green, side by side on wide screens and one above the other on phones.',
  steps: [
    'Paste the older JSON into Original and the newer JSON into Changed.',
    'Choose Compare. If either side is not valid JSON, click the error to jump to it.',
    'Turn on Ignore key order when the same keys can come back in a different order.',
    'Turn on Show only differences to hide unchanged lines in long documents.',
  ],
  faq: [
    {
      question: 'Are my JSON documents uploaded anywhere?',
      answer:
        'No. Both documents are formatted and compared in your browser and never sent to a server.',
    },
    {
      question: 'What does Ignore key order do?',
      answer:
        'It sorts the keys of every object alphabetically on both sides before comparing, so {"a": 1, "b": 2} and ' +
        '{"b": 2, "a": 1} count as the same. The order of items in arrays still matters.',
    },
    {
      question: 'Why are 1.0 and 1 shown as different?',
      answer:
        'The tool compares numbers exactly as they are written, so a value that changed from 1.0 to 1, or a large ID ' +
        'whose last digits changed, is never hidden. Many tools convert numbers first and miss these changes.',
    },
    {
      question: 'Does spacing or indentation count as a change?',
      answer:
        'No. Both sides are re-indented in the same way before comparing, so only real changes to keys and values show.',
    },
    {
      question: 'Can I compare large files?',
      answer:
        'Yes. Inputs of about 100 KB or more are formatted in the background, so the page stays responsive. For very ' +
        'long files, Show only differences keeps the view short.',
    },
  ],
};
