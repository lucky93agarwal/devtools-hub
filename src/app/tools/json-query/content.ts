import { ToolContent } from '../../shared/tool-info/tool-info';

export const JSON_QUERY_CONTENT: ToolContent = {
  aboutHeading: 'About this JSONPath and jq playground',
  about:
    'Large API responses and config files hide the few values you need. Write a JSONPath expression or a jq filter ' +
    'and see the result as you type. JSONPath, as used by Postman tests, Kubernetes kubectl -o jsonpath and many ' +
    'libraries, picks values by path and filter. jq is the command-line JSON processor; this page runs the real jq ' +
    '1.8 compiled to WebAssembly, so filters, map, select, group_by and the rest behave exactly as in your terminal.',
  steps: [
    'Choose JSONPath or jq.',
    'Paste your JSON, or keep the sample to experiment.',
    'Type a query or click one of the examples to start from.',
    'Copy the result, or share a link with the query and data.',
  ],
  faq: [
    {
      question: 'Should I use JSONPath or jq?',
      answer:
        'JSONPath is simpler and is built into many tools and libraries for picking values. jq is a full language: ' +
        'it can also reshape, compute totals, group and build new JSON, and it is the standard tool in shell scripts.',
    },
    {
      question: 'Is this the real jq?',
      answer:
        'Yes. It is jq 1.8.2 compiled to WebAssembly (via the jq-wasm package), so output and error messages match ' +
        'the jq command. Options that read files or the environment do not apply in a browser.',
    },
    {
      question: 'Why does JSONPath return a list?',
      answer:
        'A path can match any number of values, so results always come back as an array, even for a single match.',
    },
    {
      question: 'Is my JSON uploaded?',
      answer: 'No. Queries run on your device. A Share link puts the JSON and query in the link itself.',
    },
  ],
};
