/**
 * Live connections for WebSocket and Socket.IO requests. Both run in the browser,
 * straight to the server, so the same limits apply as for any web page: no custom
 * headers on the WebSocket handshake, and no ws:// to other machines from an https page.
 */

export type LogDirection = 'out' | 'in' | 'info' | 'error';

export interface LogEntry {
  id: number;
  at: number;
  direction: LogDirection;
  /** Socket.IO event name. */
  event?: string;
  text: string;
  size: number;
  binary?: boolean;
}

export interface RealtimeHandlers {
  open(note: string): void;
  /** A note for the log, such as a confirmed subscription. */
  info?(note: string): void;
  receive(text: string, size: number, details?: { event?: string; binary?: boolean }): void;
  closed(note: string): void;
  error(message: string): void;
}

export interface SendOptions {
  /** Socket.IO: the event, and whether to wait for an acknowledgement. */
  event?: string;
  ack?: boolean;
  /** MQTT: where and how to publish. */
  topic?: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface RealtimeConnection {
  send(text: string, format: 'text' | 'json', options?: SendOptions): { text: string; size: number };
  close(): void;
  /** MQTT only. */
  subscribe?(topic: string, qos: 0 | 1 | 2): void;
  unsubscribe?(topic: string): void;
}

const encoder = new TextEncoder();
const byteSize = (text: string) => encoder.encode(text).length;

/** Turns what the user typed into a WebSocket address: http becomes ws, and no scheme means wss. */
export function webSocketUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http/i, 'ws');
  return /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
}

/** Socket.IO connects over http(s) first, so ws becomes http, and no scheme means https. */
export function socketIoUrl(url: string): string {
  const trimmed = url.trim();
  if (/^wss?:\/\//i.test(trimmed)) return trimmed.replace(/^ws/i, 'http');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/** Why the browser will refuse the address before trying, or null when it can try. */
export function blockedReason(url: string, pageProtocol: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'This address is not valid.';
  }
  const insecure = parsed.protocol === 'ws:' || parsed.protocol === 'http:';
  if (pageProtocol === 'https:' && insecure && !LOCAL_HOST.test(parsed.hostname)) {
    return `This page is on https, so the browser blocks unencrypted ${parsed.protocol.replace(':', '://')} connections to other machines. Use ${parsed.protocol === 'ws:' ? 'wss://' : 'https://'} instead.`;
  }
  return null;
}

/** The meaning of a WebSocket close code, for the log. */
export function closeNote(code: number, reason: string): string {
  const meanings: Record<number, string> = {
    1000: 'closed normally',
    1001: 'the server is going away',
    1002: 'protocol error',
    1003: 'the server cannot accept this kind of data',
    1006: 'the connection dropped without a close message (the server refused it, or the network failed)',
    1007: 'the message data was not valid',
    1008: 'the server\'s policy refused the message',
    1009: 'the message was too big',
    1011: 'the server hit an error',
  };
  const meaning = meanings[code] ?? 'closed';
  return `Disconnected: ${code}, ${meaning}${reason ? `. Reason: ${reason}` : ''}`;
}

/** The value to send for a message: JSON is checked and parsed, text is sent as it is. */
export function messageValue(text: string, format: 'text' | 'json'): unknown {
  if (format === 'text') return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The message is not valid JSON. Choose Text to send it as it is.');
  }
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** How a binary message is shown: its size and Base64, which can be copied. */
export function describeBinary(bytes: Uint8Array): string {
  return base64(bytes);
}

export function connectWebSocket(
  url: string,
  protocols: string[],
  handlers: RealtimeHandlers,
  create: (url: string, protocols: string[]) => WebSocket = (u, p) => new WebSocket(u, p),
): RealtimeConnection {
  const socket = create(url, protocols);
  socket.binaryType = 'arraybuffer';
  let opened = false;
  socket.onopen = () => {
    opened = true;
    handlers.open(`Connected to ${url}${socket.protocol ? ` (subprotocol ${socket.protocol})` : ''}`);
  };
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data === 'string') {
      handlers.receive(event.data, byteSize(event.data));
    } else {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      handlers.receive(describeBinary(bytes), bytes.length, { binary: true });
    }
  };
  // Browsers give no details on WebSocket errors, for safety; the close event follows with a code.
  socket.onerror = () => {
    if (!opened) handlers.error('The connection could not be opened. Check the address, and that the server is running and accepts connections from web pages.');
  };
  socket.onclose = (event: CloseEvent) => handlers.closed(closeNote(event.code, event.reason));

  return {
    send(text, format) {
      messageValue(text, format);
      socket.send(text);
      return { text, size: byteSize(text) };
    },
    close() {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close(1000);
    },
  };
}

/** Text for a Socket.IO event's arguments: one argument as itself, several as a JSON array. */
export function argumentsText(args: unknown[]): { text: string; binary: boolean } {
  let binary = false;
  const plain = args.map((arg) => {
    if (arg instanceof ArrayBuffer || ArrayBuffer.isView(arg)) {
      binary = true;
      const bytes = arg instanceof ArrayBuffer ? new Uint8Array(arg) : new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength);
      return `[binary, ${bytes.length} bytes] ${describeBinary(bytes)}`;
    }
    return arg;
  });
  const value = plain.length === 1 ? plain[0] : plain;
  return { text: typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? 'undefined'), binary };
}

/** How long to wait for a Socket.IO acknowledgement. */
export const ACK_TIMEOUT_MS = 10_000;

export interface SocketIoOptions {
  path: string;
  /** Handshake auth, as the JSON object the server reads from socket.handshake.auth. */
  auth: Record<string, unknown> | undefined;
}

/** Loads the Socket.IO client only when a Socket.IO request connects. */
export async function connectSocketIo(
  url: string,
  options: SocketIoOptions,
  handlers: RealtimeHandlers,
  load: () => Promise<typeof import('socket.io-client')> = () => import('socket.io-client'),
): Promise<RealtimeConnection> {
  const { io } = await load();
  const socket = io(url, {
    path: options.path || '/socket.io',
    auth: options.auth,
    reconnection: false,
    // Straight to WebSocket, as Postman does: no HTTP long-polling first, which CORS would often block.
    transports: ['websocket'],
    // Each request gets its own connection, even to the same server.
    forceNew: true,
  });
  socket.on('connect', () => handlers.open(`Connected to ${url} (id ${socket.id})`));
  socket.on('connect_error', (error: Error) =>
    handlers.error(`Could not connect: ${error.message}. Check the address and path, and that the server runs Socket.IO 3 or 4.`),
  );
  socket.on('disconnect', (reason: string) => handlers.closed(`Disconnected: ${reason}`));
  socket.onAny((event: string, ...args: unknown[]) => {
    const { text, binary } = argumentsText(args);
    handlers.receive(text, byteSize(text), { event, binary });
  });

  return {
    send(text, format, { event = 'message', ack = false } = {}) {
      const value = messageValue(text, format);
      if (ack) {
        socket.timeout(ACK_TIMEOUT_MS).emit(event, value, (error: Error | null, ...reply: unknown[]) => {
          if (error) handlers.error(`No acknowledgement for "${event}" within ${ACK_TIMEOUT_MS / 1000} seconds.`);
          else {
            const shown = argumentsText(reply);
            handlers.receive(shown.text, byteSize(shown.text), { event: `${event} (acknowledgement)`, binary: shown.binary });
          }
        });
      } else {
        socket.emit(event, value);
      }
      return { text, size: byteSize(text) };
    },
    close() {
      socket.disconnect();
    },
  };
}

/** MQTT in a browser runs over WebSocket: http becomes ws, and no scheme means wss. */
export function mqttUrl(url: string): string {
  return webSocketUrl(url);
}

export interface MqttOptions {
  clientId: string;
  username: string;
  password: string;
  keepalive: number;
  clean: boolean;
  subscriptions: { topic: string; qos: 0 | 1 | 2 }[];
}

/** Loads mqtt.js only when an MQTT request connects. */
export async function connectMqtt(
  url: string,
  options: MqttOptions,
  handlers: RealtimeHandlers,
  load: () => Promise<typeof import('mqtt')> = () => import('mqtt'),
): Promise<RealtimeConnection> {
  const loaded = await load();
  // The browser build puts everything on its default export.
  const connect = loaded.connect ?? (loaded as unknown as { default: typeof loaded }).default.connect;
  const client = connect(url, {
    clientId: options.clientId || `devtools24_${Math.random().toString(16).slice(2, 10)}`,
    username: options.username || undefined,
    password: options.password || undefined,
    keepalive: options.keepalive || 60,
    clean: options.clean,
    reconnectPeriod: 0,
    connectTimeout: 15_000,
  });
  const subscribe = (topic: string, qos: 0 | 1 | 2) =>
    client.subscribe(topic, { qos }, (error, granted) => {
      if (error) handlers.error(`Could not subscribe to ${topic}: ${error.message}`);
      else if (granted?.[0]?.qos === 128) handlers.error(`The broker refused the subscription to ${topic}.`);
      else handlers.info?.(`Subscribed to ${topic} (QoS ${granted?.[0]?.qos ?? qos})`);
    });

  client.on('connect', () => {
    handlers.open(`Connected to ${url} as ${client.options.clientId}`);
    for (const subscription of options.subscriptions) subscribe(subscription.topic, subscription.qos);
  });
  client.on('message', (topic, payload, packet) => {
    let text: string;
    let binary = false;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    } catch {
      text = describeBinary(payload);
      binary = true;
    }
    handlers.receive(text, payload.length, { event: packet.retain ? `${topic} (retained)` : topic, binary });
  });
  client.on('error', (error) => handlers.error(`MQTT error: ${error.message}`));
  client.on('close', () => handlers.closed('Disconnected'));

  return {
    send(text, format, { topic = '', qos = 0, retain = false } = {}) {
      messageValue(text, format);
      if (!topic) throw new Error('Enter a topic to publish to.');
      client.publish(topic, text, { qos, retain }, (error) => {
        if (error) handlers.error(`Could not publish to ${topic}: ${error.message}`);
      });
      return { text, size: byteSize(text) };
    },
    close() {
      client.end(true);
    },
    subscribe,
    unsubscribe(topic) {
      client.unsubscribe(topic, (error) => {
        if (error) handlers.error(`Could not unsubscribe from ${topic}: ${error.message}`);
        else handlers.info?.(`Unsubscribed from ${topic}`);
      });
    },
  };
}
