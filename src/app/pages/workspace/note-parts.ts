/** Splits a note into plain text, links and ```code blocks``` for display. */
export type NotePart = { kind: 'text'; text: string } | { kind: 'link'; href: string } | { kind: 'code'; lang: string; code: string };

const LINK = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g;

function textAndLinks(text: string): NotePart[] {
  const parts: NotePart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index! > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'link', href: match[0] });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export function noteParts(text: string): NotePart[] {
  const parts: NotePart[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const match of text.matchAll(fence)) {
    if (match.index! > last) parts.push(...textAndLinks(text.slice(last, match.index)));
    parts.push({ kind: 'code', lang: match[1], code: match[2].replace(/\n$/, '') });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(...textAndLinks(text.slice(last)));
  return parts.filter((p) => p.kind !== 'text' || p.text.length);
}

/** "Today", "Yesterday" or "26 November 2026", for the separators between days. */
export function dayLabel(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString();
  if (day(ms) === day(now)) return 'Today';
  if (day(ms) === day(now - 86_400_000)) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
}
