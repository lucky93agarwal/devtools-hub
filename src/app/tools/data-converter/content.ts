/** Samples, explanation and FAQ text for the Data Converter. */
import { ToolContent } from '../../shared/tool-info/tool-info';
import { DataFormat } from './formats';

export const SAMPLES: Record<DataFormat, string> = {
  json: `[
  { "id": 1, "name": "Ada Lovelace", "active": true, "address": { "city": "London" }, "tags": ["math", "code"] },
  { "id": 2, "name": "Alan Turing", "active": false, "address": { "city": "Wilmslow" }, "tags": ["logic"] }
]
`,
  yaml: `service: shop-api
version: 2
replicas: 3
env:
  LOG_LEVEL: info
  CACHE: true
ports:
  - 8080
  - 9090
`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101">
    <title>Notes on the Analytical Engine</title>
    <author>Ada Lovelace</author>
    <price>12.5</price>
  </book>
  <book id="bk102">
    <title>On Computable Numbers</title>
    <author>Alan Turing</author>
    <price>9.99</price>
  </book>
</catalog>
`,
  csv: `id,name,email,address.city,active
1,Ada Lovelace,ada@example.com,London,true
2,Alan Turing,alan@example.com,Wilmslow,false
3,"Hopper, Grace",grace@example.com,New York,true
`,
};

export const DATA_CONVERTER_CONTENT: ToolContent = {
  aboutHeading: 'About the Data Converter',
  about:
    'Convert between JSON, YAML, XML and CSV in either direction: JSON to YAML for config files, YAML to JSON for APIs, ' +
    'XML to JSON for old feeds and services, and JSON to CSV for spreadsheets. Mistakes in the input are shown with ' +
    'their line, and everything happens in your browser, so private data and config files never leave your device.',
  steps: [
    'Choose what you have in From and what you need in To.',
    'Paste your data, upload a file or try the sample. The result appears as you type.',
    'Adjust the indent, the XML root element or the CSV delimiter if you need to.',
    'Copy the result or download it as a file. Use the swap button to convert it back.',
  ],
  faq: [
    {
      question: 'Is my data uploaded anywhere?',
      answer: 'No. The conversion runs in your browser, and nothing you paste or upload is sent to a server.',
    },
    {
      question: 'How does JSON with nested objects become CSV?',
      answer:
        'Each object becomes a row, and nested keys become columns with dot paths, such as address.city or tags.0. ' +
        'Converting that CSV back to JSON rebuilds the nested objects and lists.',
    },
    {
      question: 'How are XML attributes handled?',
      answer:
        'Attributes become keys that start with @, such as "@id", and text next to child elements goes into "#text". ' +
        'The same keys turn back into attributes and text when you convert JSON to XML.',
    },
    {
      question: 'Why does XML output have a root element?',
      answer:
        'An XML document needs exactly one outer element. If your data has a single top-level key, that key is used; ' +
        'otherwise the data is wrapped in the root element, which you can rename.',
    },
    {
      question: 'Are numbers kept as numbers?',
      answer:
        'JSON and YAML keep their types. XML and CSV store everything as text, so values that look like numbers or ' +
        'true and false are converted. Turn off "Detect numbers and booleans" to keep values such as 00123 as text.',
    },
  ],
};
