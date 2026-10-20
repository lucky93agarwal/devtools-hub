import { aiErrorMessage, buildAiRequest, parseAiResponse, readSse, streamDelta } from './ai';
import { McpClient, McpError, schemaSkeleton } from './mcp';
import { AiSettings, defaultAi } from './model';

const settings = (changes: Partial<AiSettings>): AiSettings => ({ ...defaultAi(), model: 'm', system: 'Be brief', temperature: 0.2, maxTokens: 50, ...changes });
const user = [{ role: 'user' as const, content: 'Hi' }];

describe('AI requests', () => {
  it('builds each provider’s request', () => {
    const openai = buildAiRequest(settings({ provider: 'openai' }), user, 'sk');
    expect(openai.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(openai.headers['Authorization']).toBe('Bearer sk');
    expect(JSON.parse(openai.body)).toMatchObject({
      model: 'm',
      messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hi' }],
      max_completion_tokens: 50,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    });

    const claude = buildAiRequest(settings({ provider: 'anthropic', stream: false, temperature: null }), user, 'sk-ant');
    expect(claude.url).toBe('https://api.anthropic.com/v1/messages');
    expect(claude.headers).toMatchObject({ 'x-api-key': 'sk-ant', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(JSON.parse(claude.body)).toEqual({ model: 'm', max_tokens: 50, system: 'Be brief', messages: user, stream: false });

    const gemini = buildAiRequest(settings({ provider: 'gemini' }), [...user, { role: 'assistant', content: 'Yo' }], 'AIza');
    expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m:streamGenerateContent?alt=sse');
    expect(JSON.parse(gemini.body)).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }, { role: 'model', parts: [{ text: 'Yo' }] }],
      systemInstruction: { parts: [{ text: 'Be brief' }] },
      generationConfig: { maxOutputTokens: 50, temperature: 0.2 },
    });

    const local = buildAiRequest(settings({ provider: 'compatible', baseUrl: 'https://openrouter.ai/api/v1/' }), user, '');
    expect(local.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(local.headers['Authorization']).toBeUndefined();
    expect(JSON.parse(local.body).max_tokens).toBe(50);
  });

  it('reads answers, streamed pieces and errors', () => {
    expect(parseAiResponse('openai', { choices: [{ message: { content: 'A' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } })).toEqual({ text: 'A', usage: { input: 3, output: 1 } });
    expect(parseAiResponse('anthropic', { content: [{ type: 'text', text: 'B' }], usage: { input_tokens: 4, output_tokens: 2 } })).toEqual({ text: 'B', usage: { input: 4, output: 2 } });
    expect(parseAiResponse('gemini', { candidates: [{ content: { parts: [{ text: 'C' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 } })).toEqual({ text: 'C', usage: { input: 5, output: 6 } });
    expect(streamDelta('openai', { choices: [{ delta: { content: 'x' } }] }).text).toBe('x');
    expect(streamDelta('anthropic', { type: 'content_block_delta', delta: { text: 'y' } }).text).toBe('y');
    expect(streamDelta('anthropic', { type: 'message_delta', usage: { output_tokens: 9 } }).usage).toEqual({ output: 9 });
    expect(readSse('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b"')).toEqual({ events: ['{"a":1}'], rest: 'data: {"b"' });
    expect(aiErrorMessage(401, '{"error":{"message":"Incorrect API key"}}')).toBe('401: Incorrect API key');
    expect(aiErrorMessage(500, 'oops')).toBe('500: oops');
  });
});

describe('MCP client', () => {
  const sse = (message: unknown) =>
    new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });

  it('initializes, keeps the session, pages lists and calls tools', async () => {
    const sent: { method?: string; headers: Record<string, string> }[] = [];
    const fake: typeof fetch = async (_url, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      sent.push({ method: body.method, headers: init?.headers as Record<string, string> });
      if (body.method === 'initialize') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'Demo', version: '1' }, capabilities: { tools: {} } } }), {
          headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'abc' },
        });
      }
      if (!body.id) return new Response(null, { status: 202 });
      if (body.method === 'tools/list') {
        return sse({ jsonrpc: '2.0', id: body.id, result: body.params.cursor ? { tools: [{ name: 'b' }] } : { tools: [{ name: 'a' }], nextCursor: 'p2' } });
      }
      if (body.method === 'tools/call') return sse({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: body.params.arguments.q }] } });
      return sse({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
    };
    const client = new McpClient('https://x.dev/mcp', { Authorization: 'Bearer t' }, fake);
    expect(await client.initialize()).toMatchObject({ name: 'Demo', version: '1', protocolVersion: '2025-06-18' });
    expect(sent[1]).toMatchObject({ method: 'notifications/initialized', headers: { 'Mcp-Session-Id': 'abc', 'MCP-Protocol-Version': '2025-06-18', Authorization: 'Bearer t' } });
    expect((await client.listTools()).map((t) => t.name)).toEqual(['a', 'b']);
    expect(await client.callTool('echo', { q: 'hi' })).toEqual({ content: [{ type: 'text', text: 'hi' }] });
    await expect(client.listPrompts()).rejects.toThrow('Method not found (code -32601)');
  });

  it('explains a server it cannot reach or that wants a token', async () => {
    const down = new McpClient('https://x.dev/mcp', {}, async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(down.initialize()).rejects.toThrow(McpError);
    const locked = new McpClient('https://x.dev/mcp', {}, async () => new Response('no', { status: 401, statusText: 'Unauthorized' }));
    await expect(locked.initialize()).rejects.toThrow('Add an Authorization header');
  });

  it('makes example arguments from a schema', () => {
    expect(
      schemaSkeleton({
        type: 'object',
        properties: { limit: { type: 'integer' }, repo: { type: 'string' }, deep: { type: 'boolean', default: true }, kind: { enum: ['a', 'b'] } },
        required: ['repo'],
      }),
    ).toEqual({ repo: '', limit: 0, deep: true, kind: 'a' });
  });
});
