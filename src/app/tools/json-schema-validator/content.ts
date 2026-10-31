import { ToolContent } from '../../shared/tool-info/tool-info';

export const SAMPLE_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "email", "items"],
  "properties": {
    "id": { "type": "integer" },
    "email": { "type": "string", "format": "email" },
    "status": { "enum": ["paid", "pending", "cancelled"] },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["sku", "qty"],
        "properties": { "sku": { "type": "string" }, "qty": { "type": "integer", "minimum": 1 } }
      }
    }
  }
}
`;

export const SAMPLE_DATA = `{
  "id": "1042",
  "email": "ada@example",
  "status": "shipped",
  "items": [{ "sku": "BK-1", "qty": 0 }]
}
`;

export const SCHEMA_CONTENT: ToolContent = {
  aboutHeading: 'About this JSON Schema validator',
  about:
    'A JSON Schema describes what valid JSON looks like: which fields are required, their types, allowed values ' +
    'and limits. Paste a schema and a JSON document to see at once whether they match, and if not, every problem ' +
    'with the exact path, such as /items/0/qty must be >= 1. Drafts 07, 2019-09 and 2020-12 and formats such as ' +
    'email, date-time, uuid and uri are supported. No schema yet? Make one from a sample of your JSON and refine it.',
  steps: [
    'Paste your JSON Schema on the left, or make one from your JSON.',
    'Paste the JSON to check on the right, such as an API response.',
    'Read the list of problems: each shows the path of the wrong value and what is wrong.',
    'Fix the JSON or the schema until it says Valid.',
  ],
  faq: [
    {
      question: 'Which JSON Schema versions are supported?',
      answer: 'Draft-07, 2019-09 and 2020-12. The version is read from the $schema keyword; without it, draft-07 is used.',
    },
    {
      question: 'Why does it say a field is not allowed?',
      answer:
        'The schema has "additionalProperties": false, so any field it does not list is an error. Remove the field ' +
        'or add it to "properties".',
    },
    {
      question: 'Is my data uploaded?',
      answer: 'No. Validation runs in your browser with the Ajv library.',
    },
  ],
};
