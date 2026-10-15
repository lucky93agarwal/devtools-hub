/**
 * Lossless JSON re-printing. JSON.parse + JSON.stringify change data in quiet ways:
 * keys like "10" move before other keys, 1.0 becomes 1, integers above 2^53 lose
 * digits and "é" becomes "é". This keeps every key, number and string exactly
 * as written and only changes the whitespace around them.
 */

/** , ] } space tab newline carriage-return */
const isDelimiter = (code: number) =>
  code === 44 || code === 93 || code === 125 || code === 32 || code === 9 || code === 10 || code === 13;

export type JsonNode =
  | { kind: 'object'; members: { rawKey: string; value: JsonNode }[] }
  | { kind: 'array'; items: JsonNode[] }
  /** A string, number, true, false or null, kept as the original text. */
  | { kind: 'raw'; text: string };

/**
 * Builds a tree from text that is already known to be valid JSON
 * (the caller checks with JSON.parse first), so this does no error handling.
 */
export function parseTree(text: string): JsonNode {
  let i = 0;
  const length = text.length;

  const skipWhitespace = () => {
    while (i < length) {
      const code = text.charCodeAt(i);
      if (code === 32 || code === 9 || code === 10 || code === 13) i++;
      else break;
    }
  };

  const readString = (): string => {
    const start = i;
    // Jump from quote to quote; a quote is the end unless an odd number of backslashes precede it.
    let end = text.indexOf('"', i + 1);
    for (;;) {
      let backslashes = 0;
      while (text.charCodeAt(end - 1 - backslashes) === 92) backslashes++;
      if (backslashes % 2 === 0) break;
      end = text.indexOf('"', end + 1);
    }
    i = end + 1;
    return text.slice(start, i);
  };

  const readValue = (): JsonNode => {
    skipWhitespace();
    const ch = text[i];
    if (ch === '{') {
      i++;
      const members: { rawKey: string; value: JsonNode }[] = [];
      skipWhitespace();
      if (text[i] === '}') {
        i++;
        return { kind: 'object', members };
      }
      for (;;) {
        skipWhitespace();
        const rawKey = readString();
        skipWhitespace();
        i++; // colon
        members.push({ rawKey, value: readValue() });
        skipWhitespace();
        if (text[i++] === '}') return { kind: 'object', members };
      }
    }
    if (ch === '[') {
      i++;
      const items: JsonNode[] = [];
      skipWhitespace();
      if (text[i] === ']') {
        i++;
        return { kind: 'array', items };
      }
      for (;;) {
        items.push(readValue());
        skipWhitespace();
        if (text[i++] === ']') return { kind: 'array', items };
      }
    }
    if (ch === '"') return { kind: 'raw', text: readString() };
    // Number, true, false or null: read up to the next delimiter.
    const start = i;
    while (i < length && !isDelimiter(text.charCodeAt(i))) i++;
    return { kind: 'raw', text: text.slice(start, i) };
  };

  return readValue();
}

/** Sorts object keys alphabetically at every level. Array order is kept. */
export function sortTree(node: JsonNode): JsonNode {
  if (node.kind === 'array') return { kind: 'array', items: node.items.map(sortTree) };
  if (node.kind === 'raw') return node;
  const members = node.members
    .map((member) => ({ rawKey: member.rawKey, key: JSON.parse(member.rawKey) as string, value: sortTree(member.value) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ rawKey, value }) => ({ rawKey, value }));
  return { kind: 'object', members };
}

/** Prints a tree with the given indent, or with no whitespace at all when indent is null. */
export function printTree(root: JsonNode, indent: string | null): string {
  const parts: string[] = [];
  // Cached "\n" + indentation for each depth.
  const breaks: string[] = ['\n'];
  const lineBreak = (depth: number): string => (breaks[depth] ??= lineBreak(depth - 1) + indent);
  const colon = indent === null ? ':' : ': ';

  const print = (node: JsonNode, depth: number): void => {
    if (node.kind === 'raw') {
      parts.push(node.text);
      return;
    }
    const [open, close] = node.kind === 'object' ? ['{', '}'] : ['[', ']'];
    const count = node.kind === 'object' ? node.members.length : node.items.length;
    if (count === 0) {
      parts.push(open + close);
      return;
    }
    parts.push(open);
    for (let n = 0; n < count; n++) {
      if (n > 0) parts.push(',');
      if (indent !== null) parts.push(lineBreak(depth + 1));
      if (node.kind === 'object') {
        const member = node.members[n];
        parts.push(member.rawKey, colon);
        print(member.value, depth + 1);
      } else {
        print(node.items[n], depth + 1);
      }
    }
    if (indent !== null) parts.push(lineBreak(depth));
    parts.push(close);
  };

  print(root, 0);
  return parts.join('');
}
