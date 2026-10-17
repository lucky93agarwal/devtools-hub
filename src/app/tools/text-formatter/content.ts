/** Samples, explanation and FAQ for the XML Formatter and the YAML Validator. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export type TextFormat = 'xml' | 'yaml';

export const TEXT_SAMPLES: Record<TextFormat, { valid: string; broken: string }> = {
  xml: {
    valid:
      '<?xml version="1.0" encoding="UTF-8"?><!-- Order export --><order id="1042" status="paid"><customer>' +
      '<name>Ada Lovelace</name><email>ada@example.com</email></customer><items><item sku="BK-1" qty="2">' +
      'Notebook</item><item sku="PN-7" qty="1"><![CDATA[Pen <blue>]]></item></items><note/></order>',
    broken: '<order id="1042">\n  <customer>\n    <name>Ada Lovelace</name>\n  </custmer>\n</order>\n',
  },
  yaml: {
    valid:
      '# Deployment settings\nservice:   shop-api\nreplicas: 3\nenv:\n    LOG_LEVEL: info   # or debug\n    CACHE: true\n' +
      'ports: [8080, 9090]\n---\nservice: worker\nreplicas: 1\n',
    broken: 'service: shop-api\nenv:\n  LOG_LEVEL: info\n\tCACHE: true\nports: [8080, 9090\n',
  },
};

export const TEXT_CONTENT: Record<TextFormat, ToolContent> = {
  xml: {
    aboutHeading: 'About this XML formatter',
    about:
      'Format, minify and validate XML in your browser. Only the whitespace between tags changes: comments, CDATA ' +
      'sections, the XML declaration, the DOCTYPE and the order and quoting of attributes stay exactly as you wrote ' +
      'them. Mistakes such as a closing tag that does not match are shown with their line, and a click takes you there.',
    steps: [
      'Paste XML, upload a file or try a sample.',
      'Choose Formatted for readable XML or Minified for the smallest size, and the indent.',
      'If the XML has a mistake, choose Go to error to jump to the line.',
      'Copy the result or download it as a file.',
    ],
    faq: [
      {
        question: 'Is my XML uploaded?',
        answer: 'No. The XML is checked and formatted by your browser and never sent to a server.',
      },
      {
        question: 'Will formatting change my data?',
        answer:
          'Only the whitespace between tags changes. Text inside elements, attributes, comments and CDATA are kept ' +
          'as they are. Minify removes whitespace between tags but keeps spaces inside text.',
      },
      {
        question: 'What does the validator check?',
        answer:
          'That the XML is well-formed: every tag is closed in the right order, attributes are quoted and appear ' +
          'once, and there is a single root element. It does not check against an XSD or DTD schema.',
      },
    ],
  },
  yaml: {
    aboutHeading: 'About this YAML validator',
    about:
      'Check YAML files such as Docker Compose, Kubernetes, GitHub Actions and app config for mistakes, and format ' +
      'them with a consistent indent. Errors are shown with their line, comments are kept, files with several ' +
      'documents separated by --- work, and duplicate keys are flagged. Everything runs in your browser.',
    steps: [
      'Paste YAML, upload a file or try a sample.',
      'Read the result: valid, or the line and reason of the first mistake.',
      'Choose Go to error to jump to the line, and fix it in the editor.',
      'Copy or download the formatted YAML.',
    ],
    faq: [
      {
        question: 'Is my YAML uploaded?',
        answer: 'No. Config files often hold secrets, so the YAML is checked in your browser and never sent anywhere.',
      },
      {
        question: 'Why is a tab an error?',
        answer: 'YAML does not allow tabs for indentation. Replace them with spaces; two spaces per level is usual.',
      },
      {
        question: 'Why are duplicate keys only a warning?',
        answer:
          'The YAML specification forbids them, but many tools quietly keep the last value. That usually hides a ' +
          'mistake, so the validator points them out without refusing the file.',
      },
      {
        question: 'Which YAML version is used?',
        answer:
          'YAML 1.2, the current version. Values such as yes and no are text in 1.2; older 1.1 tools read them as ' +
          'true and false.',
      },
    ],
  },
};
