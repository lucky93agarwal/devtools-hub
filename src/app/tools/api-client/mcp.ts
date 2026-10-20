/**
 * A small Model Context Protocol client for the Streamable HTTP transport:
 * JSON-RPC over POST, answered with JSON or a server-sent event stream.
 * Enough to list and call a server's tools, read its resources and get its prompts.
 */
import { readSse } from './ai';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export class McpError extends Error {}

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  instructions: string;
  capabilities: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface McpResource {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** Opens the session; the server answers with its name, version and what it offers. */
  async initialize(): Promise<McpServerInfo> {
    const result = (await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'DevTools24 API Client', version: '1.0.0' },
    })) as { protocolVersion: string; serverInfo?: { name?: string; version?: string }; instructions?: string; capabilities?: Record<string, unknown> };
    this.protocolVersion = result.protocolVersion;
    await this.notify('notifications/initialized');
    return {
      name: result.serverInfo?.name ?? 'MCP server',
      version: result.serverInfo?.version ?? '',
      protocolVersion: result.protocolVersion,
      instructions: result.instructions ?? '',
      capabilities: result.capabilities ?? {},
    };
  }

  listTools(): Promise<McpTool[]> {
    return this.listAll<McpTool>('tools/list', 'tools');
  }

  listResources(): Promise<McpResource[]> {
    return this.listAll<McpResource>('resources/list', 'resources');
  }

  listPrompts(): Promise<McpPrompt[]> {
    return this.listAll<McpPrompt>('prompts/list', 'prompts');
  }

  callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  readResource(uri: string): Promise<unknown> {
    return this.request('resources/read', { uri });
  }

  getPrompt(name: string, args: Record<string, string>): Promise<unknown> {
    return this.request('prompts/get', { name, arguments: args });
  }

  /** Ends the session on servers that keep one. */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    await this.fetchImpl(this.url, { method: 'DELETE', headers: this.requestHeaders() }).catch(() => undefined);
    this.sessionId = null;
  }

  private async listAll<T>(method: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    // Servers may page their lists; a hard stop protects against a server that never ends.
    for (let page = 0; page < 50; page++) {
      const result = (await this.request(method, cursor ? { cursor } : {})) as Record<string, unknown>;
      items.push(...((result[key] as T[]) ?? []));
      cursor = result['nextCursor'] as string | undefined;
      if (!cursor) break;
    }
    return items;
  }

  private requestHeaders(): Record<string, string> {
    return {
      ...this.headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...(this.protocolVersion ? { 'MCP-Protocol-Version': this.protocolVersion } : {}),
    };
  }

  private async notify(method: string): Promise<void> {
    await this.post({ jsonrpc: '2.0', method });
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const response = await this.post({ jsonrpc: '2.0', id, method, params });
    const message = await this.readResponse(response, id);
    if (message.error) throw new McpError(`${message.error.message} (code ${message.error.code})`);
    return message.result;
  }

  private async post(body: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, { method: 'POST', headers: this.requestHeaders(), body: JSON.stringify(body) });
    } catch {
      throw new McpError(
        'The browser could not reach the server. Check the URL, and that the server allows calls from web pages (CORS) on its Streamable HTTP endpoint.',
      );
    }
    const session = response.headers.get('Mcp-Session-Id');
    if (session) this.sessionId = session;
    if (!response.ok && response.status !== 202) {
      const text = await response.text().catch(() => '');
      if (response.status === 401) throw new McpError('401 Unauthorized: the server needs a token. Add an Authorization header.');
      throw new McpError(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    return response;
  }

  /** Reads the reply with this id, whether it comes as plain JSON or as an event stream. */
  private async readResponse(response: Response, id: number): Promise<JsonRpcResponse> {
    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('text/event-stream')) {
      const json = (await response.json()) as JsonRpcResponse | JsonRpcResponse[];
      const found = Array.isArray(json) ? json.find((m) => m.id === id) : json;
      if (!found) throw new McpError('The server sent no answer to the request.');
      return found;
    }
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      const { events, rest } = readSse(buffer + (value ?? '') + (done ? '\n\n' : ''));
      buffer = rest;
      for (const data of events) {
        const message = JSON.parse(data) as JsonRpcResponse;
        if (message.id === id) {
          void reader.cancel();
          return message;
        }
      }
      if (done) throw new McpError('The stream ended without an answer.');
    }
  }
}

/** Example arguments from a tool's input schema, required ones first, to edit before running. */
export function schemaSkeleton(schema: JsonSchema | undefined): Record<string, unknown> {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const names = Object.keys(properties).sort((a, b) => Number(required.has(b)) - Number(required.has(a)));
  return Object.fromEntries(names.map((name) => [name, exampleValue(properties[name])]));
}

function exampleValue(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  switch (type) {
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return schemaSkeleton(schema);
    default:
      return '';
  }
}
