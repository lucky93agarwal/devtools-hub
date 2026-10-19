/** Explanation, FAQ and the sample request for the API Client. */
import { ToolContent } from '../../shared/tool-info/tool-info';
import { ApiRequest } from './model';

/**
 * A response served by this site (public/samples/api-demo.json), so it always works.
 * It holds tokens, links to images, a PDF, video and audio, dates and nested data
 * to try the tree's hover previews on. The URL is made absolute when it is loaded.
 */
export const SAMPLE_PATH = '/samples/api-demo.json';
/** A public WebSocket server that sends every message back. */
export const WEBSOCKET_SAMPLE_URL = 'wss://echo.websocket.org';
export const SAMPLE_REQUEST: Partial<ApiRequest> = {
  name: 'Sample response',
  method: 'GET',
  headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
};

export const API_CLIENT_CONTENT: ToolContent = {
  aboutHeading: 'About this API client',
  about:
    'Send HTTP requests and read the responses, like a lightweight Postman in your browser. Set the method, URL, ' +
    'query params, headers, bearer, basic or API key auth, and a JSON, text or form body. Save requests in ' +
    'collections, switch between environments with {{variables}}, import a Postman collection or a cURL command, and ' +
    'copy any request as cURL or JavaScript. Requests go straight from your browser to the API, and everything you ' +
    'save stays in this browser.',
  steps: [
    'Choose the method and enter the URL, or paste a cURL command with Import cURL.',
    'Add params, headers, auth and a body if the API needs them.',
    'Choose Send and read the status, time, size, body and headers of the response.',
    'Save the request to a collection, or import your Postman collections to bring them over.',
  ],
  faq: [
    {
      question: 'Why does a request work in Postman but not here?',
      answer:
        'Browsers only let a web page call an API on another site if that API allows it (CORS). Postman is a desktop ' +
        'app and is not limited by this. If you own the API, add this site to Access-Control-Allow-Origin; otherwise ' +
        'use Copy as cURL and run the request in a terminal.',
    },
    {
      question: 'Are my requests, tokens or responses sent to your server?',
      answer:
        'No. Requests go directly from your browser to the API you call, and collections, history and environments are ' +
        'saved only in this browser. Clearing the site data in your browser removes them.',
    },
    {
      question: 'Can I import my Postman collections?',
      answer:
        'Yes. In Postman, export the collection as Collection v2.1, then choose Import Postman here. Folders, headers, ' +
        'bodies, variables and bearer, basic and API key auth are brought over. You can also export a collection back.',
    },
    {
      question: 'Why can I not call an http:// API?',
      answer:
        'This page uses https, and browsers block calls from https pages to http addresses. Calls to your own machine ' +
        '(localhost) are allowed. Use the API\'s https address, or copy the request as cURL.',
    },
    {
      question: 'Why are some headers left out?',
      answer:
        'Browsers do not let web pages set a few headers, such as Cookie, Host, Origin and User-Agent. The page tells ' +
        'you when one is left out; cURL from a terminal can still send them.',
    },
  ],
};
