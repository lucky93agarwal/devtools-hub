/** cURL commands to code, built on the API Client's cURL parser and code snippet generators. */
import { prepareRequest } from '../api-client/build';
import { parseCurl } from '../api-client/curl';
import { snippet } from '../api-client/snippets';

export type CodeResult = { ok: true; code: string; summary: string } | { ok: false; error: string };

export function curlToCode(command: string, languageId: string): CodeResult {
  const text = command.trim();
  if (!text) return { ok: false, error: '' };
  try {
    // Commands copied from a terminal often wrap with "\" or "^" (Windows) at line ends.
    const request = parseCurl(text.replace(/\s*[\\^]\r?\n\s*/g, ' '));
    const prepared = prepareRequest(request, new Map());
    // A web page may not send headers such as Cookie or User-Agent, but generated code can, so put them back.
    for (const row of request.headers) {
      if (row.enabled && row.key.trim() && prepared.dropped.includes(row.key.trim())) {
        prepared.headers.push([row.key.trim(), row.value]);
      }
    }
    const headers = prepared.headers.length;
    return {
      ok: true,
      code: snippet(languageId, prepared),
      summary: `${prepared.method} ${prepared.url}${headers ? ` with ${headers} ${headers === 1 ? 'header' : 'headers'}` : ''}${prepared.bodyText || prepared.formFields.length ? ' and a body' : ''}`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'This cURL command could not be read.' };
  }
}
