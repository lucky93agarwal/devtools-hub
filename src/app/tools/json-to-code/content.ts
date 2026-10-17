/** Explanation and FAQ text shown below JSON to Code, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

/** A typical API response: nested objects, a list whose items differ, nulls and snake_case keys. */
export const SAMPLE_JSON = `{
  "id": 1024,
  "user_name": "ada_lovelace",
  "email": "ada@example.com",
  "is_active": true,
  "rating": 4.8,
  "created_at": "2026-10-17T09:30:00Z",
  "address": {
    "city": "Pune",
    "postal_code": "411001",
    "geo": { "lat": 18.5204, "lng": 73.8567 }
  },
  "roles": ["admin", "editor"],
  "orders": [
    { "order_id": 9001, "total": 499.0, "items": [{ "sku": "BK-1", "qty": 2 }] },
    { "order_id": 9002, "total": 120, "coupon": null, "items": [] }
  ]
}
`;

export const JSON_TO_CODE_CONTENT: ToolContent = {
  aboutHeading: 'About JSON to Code',
  about:
    'Paste a JSON response and get ready-to-use model classes: Kotlin data classes (plain, kotlinx.serialization, ' +
    'Moshi, Gson or Jackson), Java POJOs and records, TypeScript interfaces or types, Dart classes with fromJson and ' +
    'toJson, Swift Codable structs, C# classes, Python dataclasses and Pydantic models, Go and Rust structs, and PHP ' +
    'and Ruby classes. ' +
    'Every item of a list is checked, so keys that are missing from some items become optional and values that are ' +
    'sometimes null become nullable. Your JSON never leaves your browser.',
  steps: [
    'Paste JSON, upload a .json file or try the sample.',
    'Pick the output in Convert to, for example Kotlin Serialization or TypeScript interface.',
    'Set the root class name and the options for the language, such as the JSON library.',
    'Copy the code or download it as a file.',
  ],
  faq: [
    {
      question: 'Is my JSON sent to a server?',
      answer: 'No. The classes are worked out and written by your own browser. Nothing is uploaded.',
    },
    {
      question: 'How are the types chosen?',
      answer:
        'Text becomes a string, true and false a boolean, whole numbers an Int (or Long when they are too big), and ' +
        'numbers with a decimal point a Double. When a list mixes 1 and 2.5, the field becomes a Double. Values of ' +
        'different kinds, or a value that is only ever null, get a general type such as Any, Object or unknown.',
    },
    {
      question: 'Why are some fields nullable or optional?',
      answer:
        'If a key is null in the sample, or missing from some items of a list, real responses can leave it out too, ' +
        'so the code allows for it. Use a sample with several list items to get the most accurate result.',
    },
    {
      question: 'What happens to keys like user_name?',
      answer:
        'Kotlin and Java use camelCase names such as userName, with an annotation that keeps the original JSON key. ' +
        'TypeScript keeps the keys exactly as they are, because it reads the JSON directly.',
    },
    {
      question: 'Does the Dart code work with Flutter?',
      answer:
        'Yes. The default style writes fromJson and toJson by hand, so it needs no packages. Choose json_serializable ' +
        'to get the annotations for that code generator instead, then run build_runner.',
    },
    {
      question: 'Which library should I pick for Kotlin?',
      answer:
        'kotlinx.serialization is the usual choice for new Kotlin and Kotlin Multiplatform projects. Pick Moshi, Gson or ' +
        'Jackson to match a project that already uses one of them.',
    },
  ],
};
