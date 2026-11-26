/** Text generation with Cloudflare Workers AI, shared by the assistant and the AI generators. */
import type { Env } from './env';
import { ApiError } from './http';

export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Removes chatty openings ("Here is your email:") and wrapping quotes or code fences the model sometimes adds. */
export function cleanOutput(text: string): string {
  let out = text.trim();
  out = out.replace(/^(?:sure[,!.]?\s*)?(?:here(?:'s| is| are)[^:\n]{0,80}:)\s*/i, '');
  out = out.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1');
  if (/^"[\s\S]*"$/.test(out) && !out.slice(1, -1).includes('"')) out = out.slice(1, -1);
  return out.trim();
}

/** Asks the model; throws a readable error when AI is not available. */
export async function generate(env: Env, system: string, user: string, maxTokens = 900): Promise<string> {
  if (env.AI_FAKE === '1') return `[fake AI] ${user.split('\n').find((l) => l.trim()) ?? ''}`.slice(0, 400);
  if (!env.AI) throw new ApiError(503, 'AI is not available right now. Please try again later.');
  try {
    const result = await env.AI.run(AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    });
    const text = cleanOutput(result.response ?? '');
    if (!text) throw new Error('empty');
    return text;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('ai', e);
    throw new ApiError(502, 'The AI could not answer right now (the free daily allowance may be used up). Please try again later.');
  }
}
