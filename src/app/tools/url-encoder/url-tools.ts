/** Percent-encoding and URL parsing, built on the browser's own URL rules. */

export type EncodeScope = 'component' | 'url';

export type TextResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Encodes text. "component" escapes everything that has a meaning in a URL (for a query value or path segment);
 * "url" keeps characters such as : / ? & = so a whole URL stays usable.
 */
export function encodeText(text: string, scope: EncodeScope, spaceAsPlus = false): string {
  const encoded = scope === 'component' ? encodeURIComponent(text) : encodeURI(text);
  return spaceAsPlus ? encoded.replace(/%20/g, '+') : encoded;
}

/** Decodes percent-encoding. With plusAsSpace, + is read as a space, as in HTML form data. */
export function decodeText(text: string, plusAsSpace = false): TextResult {
  const source = plusAsSpace ? text.replace(/\+/g, ' ') : text;
  try {
    return { ok: true, text: decodeURIComponent(source) };
  } catch {
    const bad = /%(?![0-9a-f]{2})|%[0-9a-f]{2}/i.exec(findBadEscape(source) ?? '');
    return { ok: false, error: bad ? `“${bad[0]}” is not a valid percent-encoded character.` : 'This text has a broken %-escape.' };
  }
}

/** The first %-sequence that does not decode, for the error message. */
function findBadEscape(text: string): string | null {
  for (const match of text.matchAll(/(?:%[0-9a-f]{2})+|%.{0,2}/gi)) {
    try {
      decodeURIComponent(match[0]);
    } catch {
      return match[0];
    }
  }
  return null;
}

export interface Param {
  key: string;
  value: string;
}

export interface UrlParts {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  hash: string;
  params: Param[];
}

export type ParseResult = { ok: true; parts: UrlParts } | { ok: false; error: string };

/** Splits a URL into its parts. A missing scheme is read as https:// so "example.com/a?b=1" works. */
export function parseUrl(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: '' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: 'This is not a valid URL. Check the host name and for spaces.' };
  }
  return {
    ok: true,
    parts: {
      protocol: url.protocol.replace(/:$/, ''),
      username: decodeSafe(url.username),
      password: decodeSafe(url.password),
      hostname: url.hostname,
      port: url.port,
      pathname: decodeSafe(url.pathname),
      hash: decodeSafe(url.hash.replace(/^#/, '')),
      params: [...url.searchParams].map(([key, value]) => ({ key, value })),
    },
  };
}

/** Puts a URL back together from its parts, encoding each one. */
export function buildUrl(parts: UrlParts): string {
  const url = new URL(`${parts.protocol || 'https'}://${parts.hostname || 'example.com'}`);
  url.username = parts.username;
  url.password = parts.password;
  url.port = parts.port;
  url.pathname = parts.pathname;
  const search = new URLSearchParams();
  for (const { key, value } of parts.params) if (key || value) search.append(key, value);
  url.search = search.toString();
  url.hash = parts.hash;
  return url.toString();
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
