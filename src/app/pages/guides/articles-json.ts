import { Article } from './article';

export const JSON_ARTICLES: Record<string, Article> = {
  'common-json-errors': {
    intro:
      'JSON looks simple, and that is exactly why small mistakes in it are so frustrating. A single stray comma makes a whole file unreadable to a parser, and the error message often points somewhere unhelpful. This guide walks through the errors developers run into most, explains what the parser is complaining about, and shows the fix for each.',
    body: [
      { h: 'Why JSON is so strict' },
      {
        p: 'JSON (JavaScript Object Notation) is defined by RFC 8259 and ECMA-404. The grammar is deliberately tiny: objects in braces, arrays in brackets, strings in double quotes, numbers, `true`, `false` and `null`. There is no room for "almost JSON". Because every parser must accept exactly the same input, anything outside the grammar is rejected, even when a human can see what was meant.',
      },
      {
        p: 'Most errors come from writing JSON by hand, or from copying a JavaScript object literal and expecting it to be JSON. JavaScript is far more forgiving: it allows comments, single quotes, trailing commas and unquoted keys. JSON allows none of them.',
      },
      { h: '1. Trailing commas' },
      { p: 'The most common error of all. A comma after the last item of an object or array is valid JavaScript but invalid JSON.' },
      { code: '{\n  "name": "Ada",\n  "language": "JSON",\n}' },
      {
        p: 'Parsers report this as something like `Unexpected token }` or "Expected a property name". The fix is to delete the comma after the last item. When you edit a list and remove its last line, check the line above it.',
      },
      { h: '2. Single quotes instead of double quotes' },
      {
        p: 'JSON strings and keys must use double quotes. `{\'name\': \'Ada\'}` is rejected. This often happens with output copied from Python, whose `print()` of a dictionary uses single quotes. In Python, use `json.dumps(data)` to get real JSON instead of printing the dictionary.',
      },
      { h: '3. Unquoted keys' },
      {
        p: 'In JavaScript you can write `{ name: "Ada" }`. In JSON every key is a string, so it must be `{ "name": "Ada" }`. The same applies to keys that look like numbers: `{ 1: "one" }` is invalid, `{ "1": "one" }` is valid.',
      },
      { h: '4. Comments' },
      {
        p: 'JSON has no comments. Neither `// note` nor `/* note */` is allowed. Some tools accept "JSON with comments" (JSONC), for example VS Code settings files and `tsconfig.json`, but a standard parser will fail on them. If you need notes in data that other programs read, add a field such as `"_comment": "..."` or keep the notes in a separate file.',
      },
      { h: '5. Missing commas between items' },
      {
        p: 'When two lines are both followed by a new key but one of them has no comma, the parser fails on the second line, not the first. A message like "Expected \',\' or \'}\' after property value" at line 4 usually means the comma is missing at the end of line 3. Always look one line up from the reported position.',
      },
      { h: '6. Unescaped characters inside strings' },
      {
        p: 'Inside a string, a double quote must be written `\\"` and a backslash `\\\\`. Raw line breaks and tabs are not allowed either; they must be `\\n` and `\\t`. Windows paths are a classic trap: `"C:\\Users\\ada"` contains `\\U` and `\\a`, which are not valid escapes. Write `"C:\\\\Users\\\\ada"` or use forward slashes.',
      },
      { h: '7. Values JSON does not have' },
      {
        ul: [
          '`undefined` does not exist in JSON. Leave the key out or use `null`.',
          '`NaN` and `Infinity` are not valid numbers. Most serializers turn them into `null`, which can surprise you later.',
          'Numbers cannot have leading zeros (`007`), a leading plus sign (`+5`) or a trailing dot (`5.`).',
          'Hexadecimal (`0xFF`) is not allowed. Use the decimal value.',
          'Dates have no type of their own. Use an ISO 8601 string such as `"2026-10-30T09:30:00Z"`.',
        ],
      },
      { h: '8. Two documents in one file' },
      {
        p: 'A JSON text has exactly one top-level value. Log files often contain one JSON object per line (JSON Lines, `.jsonl`). Each line is valid on its own, but the file as a whole is not JSON. Parse it line by line, or wrap the objects in an array.',
      },
      { h: '9. Invisible characters' },
      {
        p: 'Text copied from a web page, chat app or word processor can bring a byte order mark (BOM) at the start, non-breaking spaces, or curly “smart” quotes. They look right but are different characters. If an error points at a position that looks perfectly fine, retype the quotes and spaces around it.',
      },
      { h: 'Reading an error message' },
      {
        p: 'Parsers report a line and column, or a character offset, where they first noticed something was wrong. That is where reading stopped making sense, which is often just after the real mistake. A good habit is to look at the reported spot, then at the end of the previous line.',
      },
      {
        table: {
          head: ['Message (wording varies by parser)', 'Usual cause'],
          rows: [
            ['Unexpected token } / ]', 'Trailing comma before the closing bracket'],
            ["Expected ',' or '}'", 'Missing comma at the end of the previous line'],
            ["Unexpected token '", 'Single quotes instead of double quotes'],
            ['Expected property name', 'Unquoted key, or a trailing comma in an object'],
            ['Unexpected end of JSON input', 'Missing closing bracket or brace, or the input is empty'],
            ['Bad control character in string', 'A raw line break or tab inside a string'],
          ],
        },
      },
      { h: 'Preventing JSON errors' },
      {
        ul: [
          'Generate JSON with a serializer (`JSON.stringify`, `json.dumps`, Jackson, Gson) instead of building strings by hand.',
          'Validate files in CI. A small script that parses every `.json` file in the repository catches mistakes before they ship.',
          'Use an editor that highlights JSON errors as you type.',
          'Format the file before reading it. Indented JSON makes a missing bracket easy to spot.',
        ],
      },
      {
        note: 'The JSON Formatter on this site shows each error with its line and column and jumps to it, and it runs in your browser, so the data you check is never uploaded.',
      },
    ],
  },

  'json-vs-yaml-vs-xml': {
    intro:
      'JSON, YAML and XML can all describe the same data, yet each feels at home in different places: JSON in web APIs, YAML in configuration, XML in documents and older enterprise systems. Choosing well saves you from awkward workarounds later, and knowing their differences helps when you have to convert between them.',
    body: [
      { h: 'The same data three ways' },
      { p: 'Here is a small record in each format.' },
      { code: '{\n  "service": "billing",\n  "port": 8080,\n  "debug": false,\n  "owners": ["ada", "grace"]\n}' },
      { code: 'service: billing\nport: 8080\ndebug: false\nowners:\n  - ada\n  - grace' },
      {
        code: '<config>\n  <service>billing</service>\n  <port>8080</port>\n  <debug>false</debug>\n  <owners>\n    <owner>ada</owner>\n    <owner>grace</owner>\n  </owners>\n</config>',
      },
      {
        p: 'Notice what each one needs. JSON uses braces, brackets and quotes. YAML uses indentation and dashes. XML wraps every value in named tags and needs an extra element name (`owner`) for the items of a list.',
      },
      { h: 'JSON' },
      {
        p: 'JSON has a small, strict grammar and six value types: object, array, string, number, boolean and null. Every mainstream language can read and write it, and browsers parse it natively, which makes it the default for REST APIs and for data sent between services.',
      },
      {
        ul: [
          'Strengths: simple, unambiguous, fast to parse, the same everywhere.',
          'Weaknesses: no comments, noisy to write by hand, no date type, large integers can lose precision in JavaScript.',
          'Best for: API requests and responses, data stored or exchanged by programs, package manifests.',
        ],
      },
      { h: 'YAML' },
      {
        p: 'YAML (YAML Ain\'t Markup Language) aims at people. It uses indentation instead of brackets, allows comments, and supports multi-line strings, anchors and aliases for reuse. Since YAML 1.2, any JSON document is also valid YAML.',
      },
      {
        ul: [
          'Strengths: readable, comments, less punctuation, good for long configuration files.',
          'Weaknesses: indentation errors are easy to make and hard to see; implicit typing can change meaning.',
          'Best for: configuration (Kubernetes, Docker Compose, GitHub Actions, CI pipelines), files people edit often.',
        ],
      },
      {
        p: 'The best-known YAML trap is implicit typing. In YAML 1.1 parsers, unquoted `no`, `yes`, `on` and `off` become booleans, so a country code `NO` (Norway) can turn into `false`. Version strings like `3.10` become the number 3.1. Quote values that must stay strings: `version: "3.10"`.',
      },
      { h: 'XML' },
      {
        p: 'XML is a markup language: it describes documents made of nested elements that can carry attributes and mixed text. It brings mature tooling with it: schemas (XSD) for validation, namespaces, XPath for queries and XSLT for transformations.',
      },
      {
        ul: [
          'Strengths: rich validation, namespaces, mixed content, long history in enterprise and document formats.',
          'Weaknesses: verbose, two ways to store a value (element or attribute), no built-in notion of arrays or numbers.',
          'Best for: documents (SVG, RSS, Office files), SOAP services, systems that require schemas, Android layouts and Maven builds.',
        ],
      },
      { h: 'Side by side' },
      {
        table: {
          head: ['', 'JSON', 'YAML', 'XML'],
          rows: [
            ['Comments', 'No', 'Yes (#)', 'Yes (<!-- -->)'],
            ['Data types', '6 built in', 'Inferred from text', 'All text unless a schema says otherwise'],
            ['Arrays', 'Yes', 'Yes', 'Repeated elements'],
            ['Readability by hand', 'Fair', 'Good', 'Fair'],
            ['Schema / validation', 'JSON Schema', 'JSON Schema (usually)', 'XSD, DTD, RelaxNG'],
            ['Typical use', 'APIs', 'Configuration', 'Documents, enterprise'],
          ],
        },
      },
      { h: 'Converting between them' },
      { p: 'Conversion is usually straightforward, but some information does not survive the trip.' },
      {
        ul: [
          'YAML to JSON loses comments and anchors (the aliased values are copied in place).',
          'XML to JSON has to decide how to represent attributes (often as keys starting with `@`) and when a repeated element should become an array. A single `<owner>` may become a string instead of a one-item array, so check the shape.',
          'JSON to XML needs a root element and valid element names: keys with spaces or starting with a digit must be renamed.',
          'Everything that is text in XML (numbers, booleans) stays a string in JSON unless the converter guesses types.',
          'CSV only holds flat rows. Nested objects are flattened into column names like `address.city`, or the conversion is refused.',
        ],
      },
      { h: 'How to choose' },
      {
        ol: [
          'If programs exchange the data, especially over HTTP, use JSON.',
          'If people edit the file and it is configuration, use YAML, and quote strings that could be mistaken for other types.',
          'If a standard, a partner or a document format requires it, or you need schemas and namespaces, use XML.',
          'Whatever you choose, validate it automatically. All three formats fail in quiet ways when edited by hand.',
        ],
      },
      {
        note: 'The Data Converter turns JSON into YAML, XML or CSV and back, and the YAML and XML validators point to the exact line of an error. Everything runs locally in your browser.',
      },
    ],
  },

  'compare-json-files': {
    intro:
      'Comparing two JSON documents sounds like a job for any diff tool, until the tool reports that every line changed because one file is indented with tabs and the other with spaces. JSON is data, not text, and comparing it well means comparing its structure. This guide explains how structural comparison works and how to use it on API responses, configuration and test fixtures.',
    body: [
      { h: 'Why a text diff falls short' },
      { p: 'Two JSON documents can mean exactly the same thing while looking different as text:' },
      {
        ul: [
          'Formatting: indentation, spaces after colons, line breaks, minified versus pretty output.',
          'Key order: `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same object, because JSON objects are unordered.',
          'Number spelling: `1.0` and `1`, or `1e3` and `1000`, are equal numbers for most parsers.',
          'String escapes: `"é"` and `"\\u00e9"` are the same string.',
        ],
      },
      {
        p: 'A line-based diff treats every one of these as a change, which buries the real differences in noise. It also cannot tell that a value moved within an array.',
      },
      { h: 'How a structural comparison works' },
      {
        p: 'A structural diff parses both documents and walks them side by side. For each object it compares the keys: a key only on the left was removed, a key only on the right was added, and a key on both sides is compared recursively. Values of different types (a string on one side, a number on the other) are reported as a type change. The result is a list of paths, for example `$.user.address.city`, with the old and new value.',
      },
      { h: 'The hard part: arrays' },
      {
        p: 'Arrays are ordered, so the obvious comparison matches item 0 with item 0, item 1 with item 1, and so on. That works when items only change in place. When an item is inserted at the start, every later item appears changed. There are a few ways to deal with this:',
      },
      {
        ul: [
          'Compare by position. Simple and predictable, right for arrays where order matters, such as coordinates or steps.',
          'Sort both arrays first, when order carries no meaning (tags, permission lists).',
          'Match items by an identifying key such as `id`, then compare the matched items. This is how you compare lists of records from an API.',
        ],
      },
      { h: 'Comparing API responses' },
      {
        p: 'A common task is checking what changed between two versions of an API, or between staging and production. Some fields always differ and should be ignored: timestamps, request IDs, ETags, tokens and generated IDs. Remove or mask them first, otherwise they hide the differences you care about.',
      },
      {
        ol: [
          'Capture both responses, ideally with the same input and the same user.',
          'Format both and remove volatile fields such as `requestId` or `generatedAt`.',
          'Run a structural comparison and read the changes grouped by path.',
          'Pay special attention to removed keys and type changes; these are the ones that break clients.',
        ],
      },
      { h: 'Comparing configuration' },
      {
        p: 'For configuration files the question is usually "which settings differ between these environments?" A structural diff answers it directly, as a short list of changed keys. Sorting keys before comparing makes the result stable even if one file was written by a different tool.',
      },
      { h: 'Snapshot tests' },
      {
        p: 'Snapshot tests store a JSON output and fail when it changes. When one fails, a structural view shows at a glance whether the change is intended (a new field) or a regression (a missing field or a number that became a string). Keep snapshots formatted with sorted keys so that their text diffs in code review stay readable too.',
      },
      { h: 'Things to watch for' },
      {
        ul: [
          'Large integers above 2^53 lose precision in JavaScript, so two different IDs can look equal after parsing. Compare them as strings when they come from databases.',
          'Floating point: `0.1 + 0.2` is not `0.3` exactly. Values computed on different machines may differ in the last digits.',
          '`null` and a missing key are different things in JSON, and an API change from one to the other can break clients.',
          'Duplicate keys are technically allowed by some parsers, which keep only the last one. A diff will only see that last value.',
        ],
      },
      {
        note: 'JSON Compare on this site shows a side-by-side diff with the changes counted, can sort keys first, and runs entirely in your browser.',
      },
    ],
  },

  'json-to-typed-models': {
    intro:
      'When you call a new API, the first job is usually to write classes that match its responses. Doing it by hand is slow and error-prone for large payloads. Generators can infer the types from a sample response in seconds, but the result is only as good as the sample. This guide explains how type inference from JSON works and what to check before you rely on the generated code.',
    body: [
      { h: 'What a generator does' },
      {
        p: 'A JSON-to-code generator reads a sample document and builds a type for every object it finds. Keys become fields, and each value decides the field type: a string becomes `String`, a whole number `Int` or `Long`, a decimal `Double`, `true`/`false` a boolean, a nested object a new class, and an array a list of whatever its items are.',
      },
      { code: '{\n  "id": 42,\n  "name": "Ada",\n  "rating": 4.8,\n  "tags": ["admin"],\n  "address": { "city": "Pune", "pin": "411001" }\n}' },
      { p: 'From this sample a TypeScript generator produces something like:' },
      {
        code: 'export interface User {\n  id: number;\n  name: string;\n  rating: number;\n  tags: string[];\n  address: Address;\n}\n\nexport interface Address {\n  city: string;\n  pin: string;\n}',
      },
      { p: 'and a Kotlin generator using kotlinx.serialization:' },
      {
        code: '@Serializable\ndata class User(\n    val id: Long,\n    val name: String,\n    val rating: Double,\n    val tags: List<String>,\n    val address: Address,\n)\n\n@Serializable\ndata class Address(\n    val city: String,\n    val pin: String,\n)',
      },
      { h: 'Where inference can go wrong' },
      { p: 'A sample shows one moment of the data. The generator cannot know about values it never saw.' },
      {
        ul: [
          'Nullable fields. If a field happens to be filled in the sample, it is generated as required. When the API later sends `null`, the app crashes or the parser throws. Mark fields nullable when the API documentation says they can be missing.',
          'Optional keys. A key that is sometimes absent is invisible if the sample does not include it.',
          'Empty arrays. `"items": []` says nothing about the item type, so generators fall back to `Any` or `unknown`. Use a sample where the array has items.',
          'Numbers. `4` in the sample may be `4.5` tomorrow. If a field is a price or a rating, make it a decimal type even if the sample shows a whole number.',
          'Large integers. IDs above 2^53 cannot be represented exactly by JavaScript numbers. Use `string` in TypeScript, or `Long` in Kotlin and Java.',
          'Mixed arrays. An array of objects with slightly different shapes needs the union of their fields, with the rarer ones optional.',
        ],
      },
      { h: 'Use several samples' },
      {
        p: 'The best fix is more data. Paste an array containing several real responses, including edge cases: an empty list, a user with no address, an order without a discount. A good generator merges the shapes it sees and marks a field optional when it is missing from some of them.',
      },
      { h: 'Naming' },
      {
        p: 'JSON keys often use `snake_case` while your language prefers `camelCase`. Generators either rename fields and add an annotation that keeps the JSON name (`@SerialName("created_at")`, `@JsonProperty`, `@SerializedName`, `json:"created_at"` in Go), or keep the original names. Prefer renaming with annotations so your code reads naturally and the wire format still matches.',
      },
      {
        p: 'Nested class names come from the key that holds the object: `address` becomes `Address`, `line_items` becomes `LineItem`. Rename them if the result is vague. Watch for clashes with built-in names such as `Error`, `Date` or `Object`.',
      },
      { h: 'Dates and enums' },
      {
        p: 'JSON has no date type, so dates arrive as strings. Generators usually keep them as `String`. Convert them to proper date types (`Instant`, `DateTime`, `Date`) yourself, with a custom serializer where needed. The same goes for fields that only take a few values, such as a status: turn them into enums once you know the full list.',
      },
      { h: 'A checklist before you commit the code' },
      {
        ol: [
          'Compare the generated types with the API documentation or its OpenAPI schema, if there is one.',
          'Make every field that can be missing or null optional.',
          'Choose number types deliberately: decimals for money and ratings, 64-bit integers or strings for IDs.',
          'Replace string dates and status codes with real date types and enums.',
          'Write one test that parses a real response, so a future API change fails loudly instead of quietly.',
        ],
      },
      {
        note: 'JSON to Code on this site generates models for TypeScript, Kotlin, Java, Dart, Swift, C#, Python, Go, Rust, PHP, Ruby and more, plus JSON Schema, from a sample you paste. The sample stays in your browser.',
      },
    ],
  },
};
