/**
 * Pure helpers for the response tree: the rows to draw, each value's type,
 * its path, and what a string looks like (a JWT, a link, a date…).
 */
import { JsonNode, printTree } from '../json-formatter/json-tree';
import { decodeJwt } from '../jwt/jwt-tools';

export type ValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export type StringFormat = 'jwt' | 'url' | 'date' | 'email' | 'uuid';
/** "unknown" is a link without a file extension, which may still be an image. */
export type UrlKind = 'image' | 'video' | 'audio' | 'pdf' | 'unknown' | 'other';

export interface TreeRow {
  /** Position in the tree ("0/3/1"), unique even when an object repeats a key. */
  id: string;
  kind: 'open' | 'leaf' | 'close' | 'more';
  depth: number;
  /** The object key, or the array index as text; null for the root and closing rows. */
  key: string | null;
  isIndex: boolean;
  /** JSONPath-style path, for example $.users[0].avatar. */
  path: string;
  node: JsonNode;
  valueKind: ValueKind;
  /** Containers: number of keys or items. */
  count: number;
  collapsed: boolean;
  comma: boolean;
  /** Strings: the text without quotes and escapes. */
  value?: string;
  format?: StringFormat | null;
  /** "more" rows: how many items are not drawn yet. */
  hidden?: number;
}

/** Big arrays and objects draw this many children at first, then more on request. */
export const PAGE = 100;
/** Larger responses open with only the first two levels expanded. */
const EXPAND_ALL_LIMIT = 400;

export function kindOf(node: JsonNode): ValueKind {
  if (node.kind !== 'raw') return node.kind;
  const first = node.text[0];
  if (first === '"') return 'string';
  if (first === 't' || first === 'f') return 'boolean';
  if (first === 'n') return 'null';
  return 'number';
}

const childCount = (node: JsonNode) =>
  node.kind === 'object' ? node.members.length : node.kind === 'array' ? node.items.length : 0;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function childPath(parent: string, key: string, isIndex: boolean): string {
  if (isIndex) return `${parent}[${key}]`;
  return IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

/** The rows to draw for the tree, given which containers are collapsed and how many children are shown. */
export function buildRows(
  root: JsonNode,
  collapsed: ReadonlySet<string>,
  shown: ReadonlyMap<string, number> = new Map(),
): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (node: JsonNode, id: string, key: string | null, isIndex: boolean, path: string, depth: number, comma: boolean) => {
    const valueKind = kindOf(node);
    if (node.kind === 'raw') {
      const row: TreeRow = { id, kind: 'leaf', depth, key, isIndex, path, node, valueKind, count: 0, collapsed: false, comma };
      if (valueKind === 'string') {
        row.value = JSON.parse(node.text) as string;
        row.format = stringFormat(row.value);
      }
      rows.push(row);
      return;
    }
    const count = childCount(node);
    const isCollapsed = count > 0 && collapsed.has(id);
    rows.push({ id, kind: 'open', depth, key, isIndex, path, node, valueKind, count, collapsed: isCollapsed, comma });
    if (isCollapsed || count === 0) return;

    const visible = Math.min(count, shown.get(id) ?? PAGE);
    for (let n = 0; n < visible; n++) {
      const childKey = node.kind === 'object' ? (JSON.parse(node.members[n].rawKey) as string) : String(n);
      const child = node.kind === 'object' ? node.members[n].value : node.items[n];
      const index = node.kind === 'array';
      walk(child, `${id}/${n}`, childKey, index, childPath(path, childKey, index), depth + 1, n < count - 1);
    }
    if (visible < count) {
      rows.push({
        id: `${id}/more`,
        kind: 'more',
        depth: depth + 1,
        key: null,
        isIndex: false,
        path,
        node,
        valueKind,
        count,
        collapsed: false,
        comma: false,
        hidden: count - visible,
      });
    }
    rows.push({ id: `${id}/close`, kind: 'close', depth, key: null, isIndex: false, path, node, valueKind, count, collapsed: false, comma });
  };

  walk(root, '0', null, false, '$', 0, false);
  return rows;
}

function countNodes(node: JsonNode, limit: number): number {
  let total = 0;
  const visit = (current: JsonNode) => {
    if (total > limit) return;
    total++;
    if (current.kind === 'object') current.members.forEach((member) => visit(member.value));
    else if (current.kind === 'array') current.items.forEach(visit);
  };
  visit(node);
  return total;
}

/** Ids of every object and array at or below the given depth. */
export function containerIds(root: JsonNode, fromDepth: number): Set<string> {
  const ids = new Set<string>();
  const visit = (node: JsonNode, id: string, depth: number) => {
    if (node.kind === 'raw') return;
    if (depth >= fromDepth) ids.add(id);
    const children = node.kind === 'object' ? node.members.map((member) => member.value) : node.items;
    children.forEach((child, n) => visit(child, `${id}/${n}`, depth + 1));
  };
  visit(root, '0', 0);
  return ids;
}

/** Small responses open fully; large ones show the first two levels. */
export function defaultCollapsed(root: JsonNode): Set<string> {
  return countNodes(root, EXPAND_ALL_LIMIT) > EXPAND_ALL_LIMIT ? containerIds(root, 2) : new Set();
}

const JWT_SHAPE = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a string holds, when it is something the tree can say more about. */
export function stringFormat(value: string): StringFormat | null {
  if (value.length > 20 && JWT_SHAPE.test(value) && decodeJwt(value).ok) return 'jwt';
  if (/^https?:\/\/\S+$/i.test(value) && URL.canParse(value)) return 'url';
  if (DATE.test(value) && !Number.isNaN(Date.parse(value))) return 'date';
  if (EMAIL.test(value)) return 'email';
  if (UUID.test(value)) return 'uuid';
  return null;
}

const EXTENSIONS: Record<Exclude<UrlKind, 'unknown' | 'other'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  pdf: ['pdf'],
};

/** Guesses what a link points at from its file extension. */
export function urlKind(url: string): UrlKind {
  const name = new URL(url).pathname.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'unknown';
  const extension = name.slice(dot + 1).toLowerCase();
  for (const [kind, list] of Object.entries(EXTENSIONS)) if (list.includes(extension)) return kind as UrlKind;
  return 'other';
}

/** A file name for saving a link: its last path part, with an extension from the file type if it has none. */
export function fileNameFromUrl(url: string, mimeType = ''): string {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    name = '';
  }
  name = name.replace(/[\\/:*?"<>|]/g, '_') || 'download';
  if (!name.includes('.')) {
    const extension = mimeType.split('/')[1]?.split(/[;+]/)[0].replace('jpeg', 'jpg');
    if (extension) name += `.${extension}`;
  }
  return name;
}

export interface TypeInfo {
  label: string;
  detail: string;
}

const FORMAT_LABELS: Record<StringFormat, string> = {
  jwt: 'JWT',
  url: 'link',
  date: 'date',
  email: 'email',
  uuid: 'UUID',
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function asUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** The type shown when hovering a key, with a line of detail. */
export function typeInfo(row: TreeRow): TypeInfo {
  const node = row.node;
  if (node.kind === 'object') return { label: 'object', detail: plural(node.members.length, 'key') };
  if (node.kind === 'array') {
    const kinds = new Set(node.items.map(kindOf));
    const of = kinds.size === 1 ? `, all ${[...kinds][0]}s`.replace('nulls', 'null') : kinds.size > 1 ? ', mixed types' : '';
    return { label: 'array', detail: plural(node.items.length, 'item') + of };
  }
  switch (row.valueKind) {
    case 'string': {
      const value = row.value ?? '';
      const label = row.format ? `string (${FORMAT_LABELS[row.format]})` : 'string';
      let detail = plural([...value].length, 'character');
      if (row.format === 'date') detail += ` · ${asUtc(new Date(value))}`;
      return { label, detail };
    }
    case 'number': {
      const text = node.text;
      if (!/^-?\d+$/.test(text)) return { label: 'number (decimal)', detail: text };
      const value = Number(text);
      if (!Number.isSafeInteger(value)) {
        return { label: 'number (integer)', detail: 'Too large for JavaScript to hold exactly. Shown as the server sent it.' };
      }
      // Seconds or milliseconds since 1970 between the years 2001 and 2286.
      if (value >= 1e9 && value < 1e10) return { label: 'number (integer)', detail: `As Unix time: ${asUtc(new Date(value * 1000))}` };
      if (value >= 1e12 && value < 1e13) return { label: 'number (integer)', detail: `As Unix time in ms: ${asUtc(new Date(value))}` };
      return { label: 'number (integer)', detail: text };
    }
    case 'boolean':
      return { label: 'boolean', detail: node.text };
    default:
      return { label: 'null', detail: 'No value' };
  }
}

/** What Copy puts on the clipboard: containers as indented JSON, strings without quotes. */
export function copyTextFor(row: TreeRow): string {
  if (row.node.kind !== 'raw') return printTree(row.node, '  ');
  return row.value ?? row.node.text;
}

/** How a collapsed container is summarised, for example "3 keys" or "10 items". */
export function summary(row: TreeRow): string {
  return row.valueKind === 'object' ? plural(row.count, 'key') : plural(row.count, 'item');
}
