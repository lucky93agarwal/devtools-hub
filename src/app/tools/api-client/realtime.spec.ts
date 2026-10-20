import {
  RealtimeHandlers,
  argumentsText,
  blockedReason,
  closeNote,
  connectMqtt,
  connectSocketIo,
  connectWebSocket,
  messageValue,
  socketIoUrl,
  webSocketUrl,
} from './realtime';

/** Records what the connection reports. */
function recorder() {
  const events: string[] = [];
  const handlers: RealtimeHandlers = {
    open: (note) => events.push(`open ${note}`),
    receive: (text, size, details) => events.push(`in${details?.event ? ` [${details.event}]` : ''}${details?.binary ? ' binary' : ''} ${size} ${text}`),
    closed: (note) => events.push(`closed ${note}`),
    error: (message) => events.push(`error ${message}`),
  };
  return { events, handlers };
}

/** A WebSocket stand-in the test drives by hand. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = 0;
  protocol = '';
  binaryType = 'blob';
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}
  send(text: string) {
    this.sent.push(text);
  }
  close(code: number) {
    this.closedWith = code;
  }
}

describe('realtime addresses', () => {
  it('turns typed addresses into WebSocket and Socket.IO URLs', () => {
    expect(webSocketUrl('echo.websocket.org')).toBe('wss://echo.websocket.org');
    expect(webSocketUrl('https://x.dev/ws')).toBe('wss://x.dev/ws');
    expect(webSocketUrl('ws://localhost:8080')).toBe('ws://localhost:8080');
    expect(socketIoUrl('wss://x.dev/chat')).toBe('https://x.dev/chat');
    expect(socketIoUrl('x.dev')).toBe('https://x.dev');
  });

  it('explains what an https page cannot open', () => {
    expect(blockedReason('ws://x.dev', 'https:')).toContain('Use wss://');
    expect(blockedReason('http://x.dev', 'https:')).toContain('Use https://');
    expect(blockedReason('ws://localhost:3000', 'https:')).toBeNull();
    expect(blockedReason('ws://x.dev', 'http:')).toBeNull();
    expect(blockedReason('wss://', 'https:')).toBe('This address is not valid.');
  });

  it('says what close codes mean', () => {
    expect(closeNote(1000, '')).toBe('Disconnected: 1000, closed normally');
    expect(closeNote(1006, '')).toContain('without a close message');
    expect(closeNote(4001, 'bad token')).toBe('Disconnected: 4001, closed. Reason: bad token');
  });

  it('checks JSON messages before sending', () => {
    expect(messageValue('{"a":1}', 'json')).toEqual({ a: 1 });
    expect(messageValue('{oops', 'text')).toBe('{oops');
    expect(() => messageValue('{oops', 'json')).toThrow('not valid JSON');
  });

  it('shows Socket.IO arguments as text', () => {
    expect(argumentsText(['hi'])).toEqual({ text: 'hi', binary: false });
    expect(argumentsText([{ a: 1 }, 2]).text).toBe('[\n  {\n    "a": 1\n  },\n  2\n]');
    expect(argumentsText([new Uint8Array([1, 2]).buffer])).toEqual({ text: '[binary, 2 bytes] AQI=', binary: true });
  });
});

describe('WebSocket connection', () => {
  it('opens, sends, receives text and binary, and closes', () => {
    const { events, handlers } = recorder();
    let socket!: FakeWebSocket;
    const connection = connectWebSocket('wss://x.dev', ['chat'], handlers, (url, protocols) => {
      socket = new FakeWebSocket(url, protocols);
      return socket as unknown as WebSocket;
    });
    expect(socket.protocols).toEqual(['chat']);
    expect(socket.binaryType).toBe('arraybuffer');
    socket.protocol = 'chat';
    socket.readyState = 1;
    socket.onopen!();
    expect(connection.send('héllo', 'text')).toEqual({ text: 'héllo', size: 6 });
    expect(socket.sent).toEqual(['héllo']);
    expect(() => connection.send('{', 'json')).toThrow('not valid JSON');
    socket.onmessage!({ data: 'pong' } as MessageEvent);
    socket.onmessage!({ data: new Uint8Array([255, 0]).buffer } as MessageEvent);
    connection.close();
    expect(socket.closedWith).toBe(1000);
    socket.onclose!({ code: 1000, reason: '' } as CloseEvent);
    expect(events).toEqual([
      'open Connected to wss://x.dev (subprotocol chat)',
      'in 4 pong',
      'in binary 2 /wA=',
      'closed Disconnected: 1000, closed normally',
    ]);
  });

  it('reports a connection that never opens', () => {
    const { events, handlers } = recorder();
    let socket!: FakeWebSocket;
    connectWebSocket('wss://down.dev', [], handlers, (url, protocols) => (socket = new FakeWebSocket(url, protocols)) as unknown as WebSocket);
    socket.onerror!();
    socket.onclose!({ code: 1006, reason: '' } as CloseEvent);
    expect(events[0]).toContain('error The connection could not be opened');
    expect(events[1]).toContain('1006');
  });
});

describe('Socket.IO connection', () => {
  /** A Socket.IO socket stand-in: records emits and lets the test fire server events. */
  function fakeSocketIo() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let any: ((event: string, ...args: unknown[]) => void) | null = null;
    const emitted: unknown[][] = [];
    const socket = {
      id: 'abc',
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      onAny: (listener: typeof any) => (any = listener),
      emit: (...args: unknown[]) => emitted.push(args),
      timeout: () => socket,
      disconnect: vi.fn(),
    };
    const io = vi.fn(() => socket);
    return {
      io,
      socket,
      emitted,
      fire: (event: string, ...args: unknown[]) => listeners.get(event)!(...args),
      serverSends: (event: string, ...args: unknown[]) => any!(event, ...args),
      load: async () => ({ io }) as unknown as typeof import('socket.io-client'),
    };
  }

  it('connects with path and auth, emits events, receives any event and acknowledgements', async () => {
    const { events, handlers } = recorder();
    const fake = fakeSocketIo();
    const connection = await connectSocketIo('https://x.dev/chat', { path: '/ws', auth: { token: 't' } }, handlers, fake.load);
    expect(fake.io).toHaveBeenCalledWith('https://x.dev/chat', expect.objectContaining({ path: '/ws', auth: { token: 't' }, reconnection: false, transports: ['websocket'] }));
    fake.fire('connect');
    connection.send('{"text":"hi"}', 'json', { event: 'chat' });
    expect(fake.emitted[0]).toEqual(['chat', { text: 'hi' }]);
    connection.send('ping', 'text', { event: 'ping', ack: true });
    const ack = fake.emitted[1][2] as (error: Error | null, ...reply: unknown[]) => void;
    ack(null, { ok: true });
    ack(new Error('timeout'));
    fake.serverSends('news', { title: 'x' });
    fake.fire('disconnect', 'io server disconnect');
    connection.close();
    expect(fake.socket.disconnect).toHaveBeenCalled();
    expect(events).toEqual([
      'open Connected to https://x.dev/chat (id abc)',
      'in [ping (acknowledgement)] 16 {\n  "ok": true\n}',
      'error No acknowledgement for "ping" within 10 seconds.',
      'in [news] 18 {\n  "title": "x"\n}',
      'closed Disconnected: io server disconnect',
    ]);
  });

  it('explains a failed connection', async () => {
    const { events, handlers } = recorder();
    const fake = fakeSocketIo();
    await connectSocketIo('https://x.dev', { path: '', auth: undefined }, handlers, fake.load);
    fake.fire('connect_error', new Error('websocket error'));
    expect(events[0]).toBe('error Could not connect: websocket error. Check the address and path, and that the server runs Socket.IO 3 or 4.');
  });
});

describe('MQTT connection', () => {
  function fakeMqtt() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const calls: unknown[][] = [];
    const client = {
      options: { clientId: 'devtools24_test' },
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      subscribe: (topic: string, opts: unknown, cb: (e: Error | null, g?: { qos: number }[]) => void) => {
        calls.push(['subscribe', topic, opts]);
        cb(null, [{ qos: topic.includes('denied') ? 128 : 1 }]);
      },
      unsubscribe: (topic: string, cb: (e?: Error) => void) => {
        calls.push(['unsubscribe', topic]);
        cb();
      },
      publish: (topic: string, text: string, opts: unknown, cb: (e?: Error) => void) => {
        calls.push(['publish', topic, text, opts]);
        cb();
      },
      end: vi.fn(),
    };
    const connect = vi.fn(() => client);
    return {
      connect,
      client,
      calls,
      fire: (event: string, ...args: unknown[]) => listeners.get(event)!(...args),
      load: async () => ({ connect }) as unknown as typeof import('mqtt'),
    };
  }

  it('connects, subscribes, publishes and shows messages by topic', async () => {
    const { events, handlers } = recorder();
    const info: string[] = [];
    handlers.info = (note) => info.push(note);
    const fake = fakeMqtt();
    const connection = await connectMqtt(
      'wss://broker.test/mqtt',
      { clientId: '', username: 'u', password: 'p', keepalive: 30, clean: true, subscriptions: [{ topic: 'a/#', qos: 1 }, { topic: 'denied', qos: 0 }] },
      handlers,
      fake.load,
    );
    expect(fake.connect).toHaveBeenCalledWith(
      'wss://broker.test/mqtt',
      expect.objectContaining({ username: 'u', password: 'p', keepalive: 30, clean: true, reconnectPeriod: 0 }),
    );
    fake.fire('connect');
    expect(info).toEqual(['Subscribed to a/# (QoS 1)']);
    connection.send('{"on":true}', 'json', { topic: 'a/b', qos: 1, retain: true });
    expect(fake.calls).toContainEqual(['publish', 'a/b', '{"on":true}', { qos: 1, retain: true }]);
    expect(() => connection.send('x', 'text', {})).toThrow('Enter a topic');
    fake.fire('message', 'a/b', new TextEncoder().encode('hello'), { retain: false });
    fake.fire('message', 'a/c', new Uint8Array([255, 254]), { retain: true });
    connection.unsubscribe!('a/#');
    connection.close();
    expect(fake.client.end).toHaveBeenCalled();
    fake.fire('close');
    expect(events).toEqual([
      'open Connected to wss://broker.test/mqtt as devtools24_test',
      'error The broker refused the subscription to denied.',
      'in [a/b] 5 hello',
      'in [a/c (retained)] binary 2 //4=',
      'closed Disconnected',
    ]);
    expect(info.at(-1)).toBe('Unsubscribed from a/#');
  });
});
