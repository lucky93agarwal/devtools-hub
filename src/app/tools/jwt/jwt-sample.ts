import { base64UrlEncode } from './jwt-tools';

/** Secret for the sample token only. Shown on the page so the signature check can be tried. */
export const SAMPLE_SECRET = 'devtools-hub-sample-secret-for-demo-only';

/**
 * Builds an HS256 sample token issued an hour ago that expires in an hour,
 * so the sample never shows as expired. Signed with Web Crypto in the browser.
 */
export async function createSampleToken(now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000) - 3600;
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: 'user-1024',
      name: 'Sample User',
      email: 'sample@example.com',
      roles: ['editor'],
      iss: 'https://auth.example.com',
      aud: 'devtools-hub-demo',
      iat,
      nbf: iat,
      exp: iat + 2 * 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SAMPLE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}
