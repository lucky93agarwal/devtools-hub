import { Injectable } from '@angular/core';
import { PreparedRequest } from './build';

export interface ApiResponse {
  status: number;
  statusText: string;
  /** Only the headers the server lets a web page read (see the note on the Headers tab). */
  headers: [string, string][];
  contentType: string;
  /** Text of the body, unless it is an image or other binary file. */
  text: string | null;
  blob: Blob;
  size: number;
  ms: number;
  url: string;
  redirected: boolean;
}

export type FailureKind = 'mixed-content' | 'offline' | 'blocked' | 'timeout' | 'cancelled' | 'invalid-url' | 'auth';

export class RequestFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

/** Seconds before a request is given up. */
export const TIMEOUT_SECONDS = 60;
/** Larger bodies are not shown as text; they can still be downloaded. */
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;

const LOCAL_HOSTS = /^(localhost|127(?:\.\d+){3}|\[::1\]|[^.]+\.localhost)$/i;

/** Reasons a request cannot even start, found before sending. */
export function checkBeforeSending(url: string, pageProtocol: string): RequestFailure | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new RequestFailure('invalid-url', 'This is not a valid address. Check the URL and any {{variables}} in it.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return new RequestFailure('invalid-url', 'Only http:// and https:// addresses can be called from a browser.');
  }
  // Browsers block http:// calls from an https:// page, except to your own machine.
  if (pageProtocol === 'https:' && parsed.protocol === 'http:' && !LOCAL_HOSTS.test(parsed.hostname)) {
    return new RequestFailure(
      'mixed-content',
      'This page uses https, so the browser blocks calls to http:// addresses (mixed content). Use the https:// address of the API if it has one, or copy the request as cURL and run it in a terminal.',
    );
  }
  return null;
}

/** AbortSignal.any where available (2024+ browsers), a small stand-in elsewhere. */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  if ('any' in AbortSignal) return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) s.addEventListener('abort', () => controller.abort(), { once: true });
  return controller.signal;
}

const isText = (type: string) =>
  !type || /^text\/|json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml|csv|html/i.test(type);

/**
 * Sends requests with the browser's fetch(). Kept as a service so tests can
 * swap it out. The request goes from the user's browser straight to the API.
 */
@Injectable({ providedIn: 'root' })
export class ApiSender {
  async send(prepared: PreparedRequest, signal: AbortSignal, pageProtocol = location.protocol): Promise<ApiResponse> {
    const problem = checkBeforeSending(prepared.url, pageProtocol);
    if (problem) throw problem;

    const timeout = AbortSignal.timeout(TIMEOUT_SECONDS * 1000);
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body,
        signal: anySignal(signal, timeout),
        // Never send this site's cookies to other APIs.
        credentials: 'omit',
        redirect: 'follow',
      });
    } catch (e) {
      throw this.explain(e, signal, timeout);
    }
    const blob = await response.blob();
    const ms = Math.round(performance.now() - started);
    const contentType = response.headers.get('content-type') ?? '';
    const text = isText(contentType) && blob.size <= MAX_TEXT_BYTES ? await blob.text() : null;
    return {
      status: response.status,
      statusText: response.statusText || reasonPhrase(response.status),
      headers: [...response.headers.entries()],
      contentType,
      text,
      blob,
      size: blob.size,
      ms,
      url: response.url,
      redirected: response.redirected,
    };
  }

  private explain(error: unknown, signal: AbortSignal, timeout: AbortSignal): RequestFailure {
    if (signal.aborted) return new RequestFailure('cancelled', 'The request was cancelled.');
    if (timeout.aborted) {
      return new RequestFailure('timeout', `No answer after ${TIMEOUT_SECONDS} seconds. The server may be down or slow.`);
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return new RequestFailure('offline', 'You seem to be offline. Check your internet connection and try again.');
    }
    // The browser gives no reason here on purpose: it is CORS, a wrong address, a bad certificate or the server being down.
    return new RequestFailure(
      'blocked',
      error instanceof Error && error.name === 'TypeError'
        ? 'The browser could not get a response.'
        : 'The request failed.',
    );
  }
}

const REASONS: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  409: 'Conflict', 410: 'Gone', 415: 'Unsupported Media Type', 422: 'Unprocessable Content', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

/** HTTP/2 and HTTP/3 send no status text, so the usual words for the code are shown instead. */
export function reasonPhrase(status: number): string {
  return REASONS[status] ?? '';
}
