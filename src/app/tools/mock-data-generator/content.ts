import { ToolContent } from '../../shared/tool-info/tool-info';

export const MOCK_SAMPLE = `{
  "id": 1,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+91 9876543210",
  "city": "Pune",
  "status": "active",
  "plan": "pro",
  "balance": 1250.75,
  "isVerified": true,
  "createdAt": "2026-01-02T10:00:00Z",
  "address": { "street": "12 MG Road", "pincode": "411001" },
  "tags": ["new"]
}
`;

export const MOCK_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "title", "price", "currency", "inStock"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string" },
    "price": { "type": "number", "minimum": 99, "maximum": 4999 },
    "currency": { "enum": ["INR", "USD"] },
    "inStock": { "type": "boolean" },
    "rating": { "type": "number", "minimum": 1, "maximum": 5 },
    "releasedOn": { "type": "string", "format": "date" },
    "sizes": { "type": "array", "items": { "enum": ["S", "M", "L", "XL"] }, "maxItems": 3 }
  }
}
`;

export const MOCK_CONTENT: ToolContent = {
  aboutHeading: 'About this mock data generator',
  about:
    'Front-end screens, API mocks, demos and tests need realistic data before the real backend exists. Paste one ' +
    'example record and get as many as you need with the same shape: values follow the field names, so email ' +
    'fields get emails, phone fields get phone numbers and createdAt gets dates, while short values such as a ' +
    'status are kept. You can also paste a JSON Schema; types, enums, formats, minimum and maximum and required ' +
    'fields are respected. Download the records as JSON, NDJSON, CSV or SQL INSERT statements.',
  steps: [
    'Paste one example record from your API, or a JSON Schema, or start from a sample.',
    'Choose how many records you need, up to 1,000.',
    'Pick the format: JSON for API mocks, CSV for spreadsheets, SQL INSERT to fill a database.',
    'Copy or download the data. The same seed always gives the same data; choose New data for a fresh set.',
  ],
  faq: [
    {
      question: 'Is any of the data real?',
      answer:
        'No. Names come from a small built-in list and are mixed at random; emails use example domains and phone ' +
        'numbers are random. Do not use the data to contact anyone.',
    },
    {
      question: 'Why use a seed?',
      answer:
        'A seed makes the data repeatable: tests and screenshots stay the same each time you generate with the same ' +
        'seed and input.',
    },
    {
      question: 'Which JSON Schema keywords are supported?',
      answer:
        'type, properties, required, items, enum, const, format (email, uuid, date, date-time, uri, ipv4, hostname), ' +
        'minimum, maximum, minLength, maxLength, minItems, maxItems and examples. References ($ref) are not followed.',
    },
    {
      question: 'Is my sample uploaded?',
      answer: 'No. The records are made in your browser.',
    },
  ],
};
