/** Beautify (js-beautify) and minify (terser, csso and a careful HTML minifier) HTML, CSS and JavaScript. */

export type CodeLanguage = 'html' | 'css' | 'js';

export type CodeResult = { ok: true; output: string } | { ok: false; error: string; line?: number; column?: number };

/** Spaces, or 0 for tabs. */
export type Indent = number;

type Beautifier = typeof import('js-beautify');
let beautifier: Promise<Beautifier> | undefined;

async function loadBeautifier(): Promise<Beautifier> {
  // js-beautify is CommonJS, so the functions sit on the default export.
  const mod = (await import('js-beautify')) as Beautifier & { default?: Beautifier };
  return mod.default ?? mod;
}

export async function beautify(code: string, language: CodeLanguage, indent: Indent): Promise<CodeResult> {
  const lib = await (beautifier ??= loadBeautifier());
  const options = {
    indent_size: indent || 1,
    indent_char: indent ? ' ' : '\t',
    end_with_newline: true,
    preserve_newlines: true,
    max_preserve_newlines: 2,
  };
  const fn = language === 'html' ? lib.html : language === 'css' ? lib.css : lib.js;
  return { ok: true, output: fn(code, { ...options, indent_inner_html: true, wrap_line_length: 0 }) };
}

export async function minify(code: string, language: CodeLanguage): Promise<CodeResult> {
  if (language === 'html') return { ok: true, output: minifyHtml(code) };
  if (language === 'css') {
    const { minify: minifyCss } = await import('csso');
    try {
      return { ok: true, output: minifyCss(code, { restructure: false }).css };
    } catch (error) {
      const e = error as { message?: string; line?: number; column?: number };
      return { ok: false, error: e.message ?? 'This CSS could not be read.', line: e.line, column: e.column };
    }
  }
  const { minify: minifyJs } = await import('terser');
  try {
    const result = await minifyJs(code, { compress: true, mangle: true, format: { comments: false }, module: /\b(import|export)\b/.test(code) });
    return { ok: true, output: result.code ?? '' };
  } catch (error) {
    const e = error as { message?: string; line?: number; col?: number };
    return { ok: false, error: e.message ?? 'This JavaScript could not be read.', line: e.line, column: e.col === undefined ? undefined : e.col + 1 };
  }
}

/** Elements whose content must stay exactly as written. */
const RAW = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1\s*>/gi;
/** Elements around which line breaks and indentation never show on the page. */
const BLOCK =
  'html|head|body|title|meta|link|script|style|base|div|p|ul|ol|li|dl|dt|dd|section|article|aside|nav|header|' +
  'footer|main|h[1-6]|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|form|fieldset|legend|figure|figcaption|' +
  'blockquote|hr|br|option|optgroup|select|noscript|template|picture|source|svg|path|g|details|summary|dialog';
const BETWEEN_TAGS = new RegExp(`(<\\/?(?:${BLOCK})\\b[^>]*>)\\s+|\\s+(<\\/?(?:${BLOCK})\\b)`, 'gi');

/**
 * Removes comments and the whitespace that does not affect the page. Text keeps one space where it had any,
 * so words and inline elements are not glued together. Conditional comments and <!--! notes --> stay.
 */
export function minifyHtml(html: string): string {
  const kept: string[] = [];
  // Raw elements are swapped for an empty element of the same name, so the block rules below still apply to them.
  const hold = (text: string, tag: string) => `<${tag} \u0000${kept.push(text) - 1}\u0000></${tag}>`;
  let out = html.replace(RAW, hold).replace(/<!--(?!\[if|!)[\s\S]*?-->/g, '');
  out = out.replace(/\s+/g, ' ').replace(BETWEEN_TAGS, (_, before, after) => before ?? after);
  return out.replace(/<(\w+) \u0000(\d+)\u0000><\/\1>/g, (_, __, i) => kept[Number(i)]).trim();
}

/** Size of the text in UTF-8 bytes. */
export const byteSize = (text: string) => new TextEncoder().encode(text).length;

/** Guesses the language of pasted code. */
export function detectLanguage(code: string): CodeLanguage | null {
  const text = code.trim();
  if (!text) return null;
  if (/^<(!doctype|html|[a-z][\w-]*[\s>/])/i.test(text)) return 'html';
  if (/^[@.#:\w\s,*[\]="'>~+-]+\{[^}]*:[^}]*\}/.test(text) && !/\b(function|const|let|var|=>)\b/.test(text)) return 'css';
  return 'js';
}
