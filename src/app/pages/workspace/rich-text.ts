/**
 * Formatted notes: the only markup allowed is <b>, <i>, <u>, <br>, <span class="tc-…"> (text colour)
 * and <mark class="hl-…"> (highlight). Everything else is shown as text. Used by the browser and the
 * Worker, so a note can never carry scripts, styles or links of its own.
 */

export const TEXT_COLORS = [
  { id: 'red', label: 'Red', hex: '#dc2626' },
  { id: 'orange', label: 'Orange', hex: '#ea580c' },
  { id: 'green', label: 'Green', hex: '#16a34a' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'purple', label: 'Purple', hex: '#9333ea' },
] as const;

export const HIGHLIGHTS = [
  { id: 'yellow', label: 'Yellow', hex: '#fde047' },
  { id: 'green', label: 'Green', hex: '#86efac' },
  { id: 'pink', label: 'Pink', hex: '#f9a8d4' },
  { id: 'blue', label: 'Blue', hex: '#93c5fd' },
  { id: 'orange', label: 'Orange', hex: '#fdba74' },
] as const;

const COLOR_IDS = TEXT_COLORS.map((c) => c.id).join('|');
const HIGHLIGHT_IDS = HIGHLIGHTS.map((c) => c.id).join('|');

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escapes everything, then brings back only the exact allowed tags. */
export function sanitizeNoteHtml(html: string): string {
  return escapeHtml(html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '\u0001').replace(/&gt;/g, '\u0002'))
    .replace(/&lt;(\/?)(b|i|u)&gt;/g, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(new RegExp(`&lt;span class=&quot;tc-(${COLOR_IDS})&quot;&gt;`, 'g'), '<span class="tc-$1">')
    .replace(/&lt;\/span&gt;/g, '</span>')
    .replace(new RegExp(`&lt;mark class=&quot;hl-(${HIGHLIGHT_IDS})&quot;&gt;`, 'g'), '<mark class="hl-$1">')
    .replace(/&lt;\/mark&gt;/g, '</mark>')
    .replace(/\u0001/g, '&lt;')
    .replace(/\u0002/g, '&gt;');
}

/** The plain text of a formatted note (for copying and search). */
export function noteHtmlToText(html: string): string {
  return html
    .replace(/<br>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Links in the text parts become real links (opened in a new tab). */
export function linkifyHtml(html: string): string {
  return html
    .split(/(<[^>]+>)/)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part.replace(/\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`),
    )
    .join('');
}

// ---------- lists ----------

/** The marker that should start the next line after `line`, or null when the line is not a list item. */
export function nextListMarker(line: string): { next: string; empty: boolean } | null {
  const m = /^(\s*)(\d+)\.\s(.*)$/.exec(line) ?? /^(\s*)([a-zA-Z])\.\s(.*)$/.exec(line) ?? /^(\s*)([•*\-])\s(.*)$/.exec(line);
  if (!m) return null;
  const [, indent, marker, rest] = m;
  const empty = !rest.trim();
  if (/^\d+$/.test(marker)) return { next: `${indent}${Number(marker) + 1}. `, empty };
  if (/^[a-zA-Z]$/.test(marker)) {
    const z = marker === 'z' || marker === 'Z';
    return { next: `${indent}${z ? marker : String.fromCharCode(marker.charCodeAt(0) + 1)}. `, empty };
  }
  return { next: `${indent}• `, empty };
}
