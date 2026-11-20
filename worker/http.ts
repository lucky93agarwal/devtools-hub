/** Small helpers for JSON responses, cookies and request checks. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message, fields: error.fields }, error.status);
  console.error(error);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

/** Reads a JSON body, refusing other content types and requests from other sites. */
export async function readJson<T>(request: Request): Promise<T> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'This request came from another site.');
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) throw new ApiError(415, 'Send JSON.');
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'The request could not be read.');
  }
}

export const SESSION_COOKIE = 'dt_session';

export function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(/;\s*/)) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return null;
}

/** The session cookie: HttpOnly (scripts cannot read it), SameSite=Lax, Secure. Without maxAge it ends with the browser. */
export function sessionCookie(value: string, maxAgeSeconds?: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

export const clearSessionCookie = () => sessionCookie('', 0);

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
}
