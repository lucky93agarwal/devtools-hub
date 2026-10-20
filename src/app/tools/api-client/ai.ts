/**
 * AI requests: the same prompt sent to OpenAI, Anthropic, Google Gemini or any
 * OpenAI-compatible server (OpenRouter, Groq, Ollama…), straight from the browser.
 */
import { AiProvider, AiSettings } from './model';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiUsage {
  input?: number;
  output?: number;
}

export const AI_PROVIDERS: { value: AiProvider; label: string; models: string[]; keyHint: string }[] = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'o4-mini'], keyHint: 'sk-…' },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    keyHint: 'sk-ant-…',
  },
  { value: 'gemini', label: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], keyHint: 'AIza…' },
  { value: 'compatible', label: 'OpenAI-compatible', models: [], keyHint: 'The server’s key, if it needs one' },
];

export interface AiHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** The HTTP request for a conversation, in the provider's own format. */
export function buildAiRequest(settings: AiSettings, messages: ChatMessage[], apiKey: string): AiHttpRequest {
  const { provider, model, system, temperature, maxTokens, stream } = settings;
  const withTemperature = temperature === null || Number.isNaN(temperature) ? {} : { temperature };
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic asks browsers to opt in, since a key in a page can be read by its visitors.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages, ...withTemperature, stream }),
    };
  }
  if (provider === 'gemini') {
    const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: maxTokens, ...withTemperature },
      }),
    };
  }
  const openai = provider === 'openai';
  const base = (openai ? 'https://api.openai.com/v1' : settings.baseUrl.trim() || 'http://localhost:11434/v1').replace(/\/+$/, '');
  return {
    url: `${base}/chat/completions`,
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      ...(openai ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...withTemperature,
      stream,
      ...(stream && openai ? { stream_options: { include_usage: true } } : {}),
    }),
  };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The answer and token counts from a complete (not streamed) response. */
export function parseAiResponse(provider: AiProvider, json: Json): { text: string; usage: AiUsage } {
  if (provider === 'anthropic') {
    const text = (json['content'] ?? []).filter((c: Json) => c['type'] === 'text').map((c: Json) => c['text']).join('');
    return { text, usage: { input: json['usage']?.['input_tokens'], output: json['usage']?.['output_tokens'] } };
  }
  if (provider === 'gemini') return { text: geminiText(json), usage: geminiUsage(json) };
  return {
    text: json['choices']?.[0]?.['message']?.['content'] ?? '',
    usage: { input: json['usage']?.['prompt_tokens'], output: json['usage']?.['completion_tokens'] },
  };
}

const geminiText = (json: Json) =>
  (json['candidates']?.[0]?.['content']?.['parts'] ?? []).map((p: Json) => p['text'] ?? '').join('');
const geminiUsage = (json: Json): AiUsage =>
  json['usageMetadata']
    ? { input: json['usageMetadata']['promptTokenCount'], output: json['usageMetadata']['candidatesTokenCount'] }
    : {};

/** The text and token counts in one streamed event. */
export function streamDelta(provider: AiProvider, json: Json): { text: string; usage: AiUsage } {
  if (provider === 'anthropic') {
    if (json['type'] === 'content_block_delta') return { text: json['delta']?.['text'] ?? '', usage: {} };
    if (json['type'] === 'message_start') return { text: '', usage: { input: json['message']?.['usage']?.['input_tokens'] } };
    if (json['type'] === 'message_delta') return { text: '', usage: { output: json['usage']?.['output_tokens'] } };
    return { text: '', usage: {} };
  }
  if (provider === 'gemini') return { text: geminiText(json), usage: geminiUsage(json) };
  return {
    text: json['choices']?.[0]?.['delta']?.['content'] ?? '',
    usage: json['usage'] ? { input: json['usage']['prompt_tokens'], output: json['usage']['completion_tokens'] } : {},
  };
}

/**
 * Splits server-sent events out of text that arrives in pieces. Returns the data of
 * each finished event and the unfinished rest, to prepend to the next piece.
 */
export function readSse(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts
    .map((part) =>
      part
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n'),
    )
    .filter((data) => data && data !== '[DONE]');
  return { events, rest };
}

/** The provider's own error message, when it sent one. */
export function aiErrorMessage(status: number, text: string): string {
  try {
    const json = JSON.parse(text) as Json;
    const error = Array.isArray(json) ? json[0]?.['error'] : json['error'];
    const message = typeof error === 'string' ? error : (error?.['message'] ?? json['message']);
    if (message) return `${status}: ${message}`;
  } catch {
    // Not JSON; fall through.
  }
  return `${status}: ${text.slice(0, 300) || 'The request failed.'}`;
}
