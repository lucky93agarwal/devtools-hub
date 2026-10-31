/** User-Agent strings explained: browser, engine, operating system, device type and well-known bots. */
import Bowser from 'bowser';

const BOTS: [RegExp, string][] = [
  [/googlebot/i, 'Googlebot (Google Search)'],
  [/bingbot/i, 'Bingbot (Microsoft Bing)'],
  [/duckduckbot/i, 'DuckDuckBot'],
  [/yandex(bot)?/i, 'YandexBot'],
  [/baiduspider/i, 'Baiduspider'],
  [/applebot/i, 'Applebot'],
  [/facebookexternalhit|facebot/i, 'Facebook link preview'],
  [/twitterbot/i, 'X (Twitter) link preview'],
  [/linkedinbot/i, 'LinkedIn link preview'],
  [/slackbot/i, 'Slack link preview'],
  [/whatsapp/i, 'WhatsApp link preview'],
  [/telegrambot/i, 'Telegram link preview'],
  [/discordbot/i, 'Discord link preview'],
  [/gptbot|chatgpt-user|oai-searchbot/i, 'OpenAI crawler'],
  [/claudebot|claude-web|anthropic/i, 'Anthropic crawler'],
  [/perplexitybot/i, 'Perplexity crawler'],
  [/curl\//i, 'curl'],
  [/wget\//i, 'Wget'],
  [/postmanruntime/i, 'Postman'],
  [/python-requests|aiohttp|httpx/i, 'Python HTTP client'],
  [/okhttp/i, 'OkHttp (Android or Java)'],
  [/axios|node-fetch|undici/i, 'Node.js HTTP client'],
  [/headlesschrome/i, 'Headless Chrome (automation)'],
  [/bot|crawler|spider|crawling/i, 'A bot or crawler'],
];

export interface UaInfo {
  browser: string;
  engine: string;
  os: string;
  device: string;
  /** The bot or tool, when the string is not from a person's browser. */
  bot: string | null;
}

export function parseUserAgent(ua: string): UaInfo | null {
  const text = ua.trim();
  if (!text) return null;
  const r = Bowser.getParser(text).getResult();
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ') || 'Unknown';
  const device = r.platform.type ? `${r.platform.type[0].toUpperCase()}${r.platform.type.slice(1)}${r.platform.vendor || r.platform.model ? ` (${join(r.platform.vendor, r.platform.model)})` : ''}` : 'Unknown';
  return {
    browser: join(r.browser.name, r.browser.version),
    engine: join(r.engine.name, r.engine.version),
    os: join(r.os.name, r.os.versionName ?? r.os.version),
    device,
    bot: BOTS.find(([pattern]) => pattern.test(text))?.[1] ?? null,
  };
}

export const SAMPLE_AGENTS = [
  { label: 'Chrome on Windows', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
  { label: 'Safari on iPhone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' },
  { label: 'Chrome on Android', ua: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' },
  { label: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { label: 'OkHttp', ua: 'okhttp/4.12.0' },
];
