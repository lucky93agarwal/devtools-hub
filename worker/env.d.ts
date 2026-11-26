/** The few Cloudflare types the Worker uses (kept here so no extra package is needed). */
export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** The few R2 bucket methods the notes vault uses. */
export interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  httpMetadata?: { contentType?: string };
}
export interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | Blob, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

/** Cloudflare Workers AI binding (text generation). */
export interface Ai {
  run(model: string, input: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; max_tokens?: number; temperature?: number }): Promise<{ response?: string }>;
}

export interface Env {
  ASSETS: Fetcher;
  /** Workers AI. */
  AI?: Ai;
  /** R2 bucket for files in the notes vault. Without it, notes work but uploads are off. */
  FILES?: R2Bucket;
  /** Local tests only: answer AI calls with a predictable fake instead of calling Workers AI. */
  AI_FAKE?: string;
  DB: D1Database;
  /** Turnstile (CAPTCHA) secret. Locally the always-pass test secret. */
  TURNSTILE_SECRET?: string;
  /** Resend API key. Without it, emails only go to the outbox table (local testing). */
  RESEND_API_KEY?: string;
  /** Sender, for example "DevTools24 <noreply@devtools24.in>". */
  MAIL_FROM?: string;
  /** The site's address for links in emails, for example http://localhost:8788 when testing locally. Defaults to the request's own address. */
  APP_URL?: string;
  /** "Continue with Google": OAuth client from Google Cloud Console. Without both, the button is hidden. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "Continue with Facebook": app from developers.facebook.com. Without both, the button is hidden. */
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  /** "Continue with GitHub": OAuth app from github.com/settings/developers. */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** "Continue with Apple": Services ID, Team ID, Key ID and the .p8 private key from developer.apple.com. */
  APPLE_SERVICES_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Local tests only: a fake Google / Facebook server. Never set on the live site. */
  OAUTH_TEST_SERVER?: string;
  /** Comma-separated emails that become admins when they sign up or log in. */
  ADMIN_EMAILS?: string;
}
