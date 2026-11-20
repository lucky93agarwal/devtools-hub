import base from './playwright.config';
// Temporary: same tests on port 4319 while another session uses 4317.
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:4319' }, webServer: { ...base.webServer, command: 'node e2e/serve.mjs dist/devtools-hub/browser 4319', url: 'http://127.0.0.1:4319' } };
