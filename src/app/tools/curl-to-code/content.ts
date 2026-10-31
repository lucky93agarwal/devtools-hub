import { ToolContent } from '../../shared/tool-info/tool-info';

export const CURL_SAMPLE = `curl 'https://api.example.com/v1/orders?status=paid' \\
  -X POST \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"item":"notebook","qty":2}'`;

export const CURL_CONTENT: ToolContent = {
  aboutHeading: 'About this cURL to code converter',
  about:
    'API documentation, Postman and the browser’s network panel all give requests as cURL commands. Paste one ' +
    'and get the same request as ready-to-run code in 35 languages and libraries, including Python requests, ' +
    'JavaScript fetch, Node.js Axios, Go, Java and Kotlin OkHttp, PHP Guzzle, C# HttpClient, Swift, Dart, Ruby, ' +
    'Rust and PowerShell. The method, URL, headers, cookies, basic auth, JSON bodies and form fields are all carried over.',
  steps: [
    'Copy a request as cURL, for example from Chrome DevTools: Network tab, right-click, Copy as cURL (bash).',
    'Paste the command. Line breaks with \\ or ^ are fine.',
    'Choose a language, or pick one of the popular ones.',
    'Copy the code into your project and replace any tokens with your own.',
  ],
  faq: [
    {
      question: 'Are my tokens and cookies safe?',
      answer:
        'The command is only read and converted in your browser; it is never sent or stored. Remove real tokens ' +
        'before sharing the generated code with anyone.',
    },
    {
      question: 'Which cURL options are supported?',
      answer:
        'The method (-X), headers (-H), cookies (-b), user agent (-A), data (-d, --data-raw, --data-binary, --data-urlencode), form fields ' +
        '(-F), basic auth (-u) and -G for query strings. Options about the connection, such as --compressed, -k ' +
        'and -L, do not change the code.',
    },
    {
      question: 'Can I send the request and see the response?',
      answer:
        'Yes, with the API Client on this site: it imports cURL commands, sends them from your browser and shows ' +
        'the response.',
    },
    {
      question: 'Why does my command copied on Windows not work?',
      answer:
        'Chrome on Windows offers Copy as cURL (cmd), which uses ^ for escaping. Choose Copy as cURL (bash) instead ' +
        'for the most reliable result.',
    },
  ],
};
