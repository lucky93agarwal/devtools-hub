/** Minified JavaScript stack traces mapped back to original files and lines with source maps (source-map-js). */
import { SourceMapConsumer } from 'source-map-js';

export interface Frame {
  /** The line of the trace as written. */
  raw: string;
  fn: string | null;
  file: string;
  line: number;
  column: number;
}

/** Chrome, Node and Edge write "at fn (file:line:col)"; Firefox and Safari write "fn@file:line:col". */
const V8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseFrames(trace: string): (Frame | string)[] {
  return trace.split(/\r?\n/).map((raw) => {
    const m = V8.exec(raw) ?? GECKO.exec(raw);
    if (!m) return raw;
    return { raw, fn: m[1] || null, file: m[2], line: Number(m[3]), column: Number(m[4]) };
  });
}

/** "https://x.dev/main-ABC.js?v=1" and "main-ABC.js" both give "main-ABC.js". */
export const baseName = (path: string) => path.split(/[?#]/)[0].split('/').pop() ?? path;

export interface MapFile {
  /** The .map file's own name, used to match "main.js" to "main.js.map". */
  name: string;
  text: string;
}

export interface Mapped {
  frame: Frame;
  source?: string;
  line?: number;
  column?: number;
  name?: string | null;
  /** A few lines of the original code around the position, when the map includes the sources. */
  snippet?: { number: number; text: string; current: boolean }[];
  problem?: string;
}

export type MapLoad = { ok: true; consumers: Map<string, SourceMapConsumer> } | { ok: false; error: string };

/** Reads source maps and keys each by the file it describes. */
export function loadMaps(files: MapFile[]): MapLoad {
  const consumers = new Map<string, SourceMapConsumer>();
  for (const f of files) {
    let raw: { file?: string; version?: number; sections?: unknown };
    try {
      raw = JSON.parse(f.text);
    } catch {
      return { ok: false, error: `${f.name || 'The source map'} is not valid JSON.` };
    }
    if (raw.version !== 3) return { ok: false, error: `${f.name || 'The source map'} is not a version 3 source map.` };
    const consumer = new SourceMapConsumer(raw as never);
    for (const key of [raw.file && baseName(raw.file), f.name && baseName(f.name).replace(/\.map$/, '')].filter(Boolean) as string[]) consumers.set(key, consumer);
    if (!consumers.size || files.length === 1) consumers.set('*', consumer);
  }
  return { ok: true, consumers };
}

export function mapFrame(frame: Frame, consumers: Map<string, SourceMapConsumer>): Mapped {
  const consumer = consumers.get(baseName(frame.file)) ?? consumers.get('*');
  if (!consumer) return { frame, problem: `No source map for ${baseName(frame.file)}.` };
  const pos = consumer.originalPositionFor({ line: frame.line, column: frame.column - 1 });
  if (!pos.source) return { frame, problem: 'This position is not in the source map (code added by the bundler, or the wrong map).' };
  const content = consumer.sourceContentFor(pos.source, true);
  const lines = content?.split('\n');
  const snippet = lines
    ? Array.from({ length: 5 }, (_, i) => pos.line! - 2 + i)
        .filter((n) => n >= 1 && n <= lines.length)
        .map((n) => ({ number: n, text: lines[n - 1], current: n === pos.line }))
    : undefined;
  return { frame, source: pos.source.replace(/^webpack:\/\/\/?|^\.\//, ''), line: pos.line!, column: (pos.column ?? 0) + 1, name: pos.name, snippet };
}

/** The whole trace with mapped frames rewritten, ready to paste into an issue. */
export function rewriteTrace(items: (Frame | string)[], mapped: Map<Frame, Mapped>): string {
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      const m = mapped.get(item);
      if (!m?.source) return item.raw;
      return `    at ${m.name ?? item.fn ?? '<anonymous>'} (${m.source}:${m.line}:${m.column})`;
    })
    .join('\n');
}
