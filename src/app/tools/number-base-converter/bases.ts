/** Whole numbers of any size in bases 2 to 36, with two's complement for fixed bit widths. */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const PREFIXES: Record<number, RegExp> = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };

export type NumberResult = { ok: true; value: bigint } | { ok: false; error: string };

/** Reads a number in a base. Spaces, underscores and the usual 0b, 0o and 0x prefixes are allowed. */
export function parseInBase(input: string, base: number): NumberResult {
  let text = input.trim().replace(/[\s_']/g, '').toLowerCase();
  if (!text) return { ok: false, error: '' };
  const negative = text.startsWith('-');
  if (negative || text.startsWith('+')) text = text.slice(1);
  text = text.replace(PREFIXES[base] ?? /^$/, '');
  if (!text) return { ok: false, error: 'Enter some digits.' };
  let value = 0n;
  const big = BigInt(base);
  for (const char of text) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0 || digit >= base) {
      return { ok: false, error: `“${char}” is not a digit in base ${base}${base <= 10 ? ` (use 0 to ${base - 1})` : ''}.` };
    }
    value = value * big + BigInt(digit);
  }
  return { ok: true, value: negative ? -value : value };
}

export const toBase = (value: bigint, base: number) => value.toString(base);

/** Groups digits from the right for reading, e.g. 1010 1111 or 1,048,576. */
export function group(digits: string, size: number, separator = ' '): string {
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  const parts: string[] = [];
  for (let end = body.length; end > 0; end -= size) parts.unshift(body.slice(Math.max(0, end - size), end));
  return (negative ? '-' : '') + parts.join(separator);
}

export interface Fixed {
  bits: number;
  /** The bit pattern as an unsigned number, or null when the value does not fit. */
  pattern: bigint | null;
  signed: bigint | null;
  unsigned: bigint | null;
}

/**
 * The value as a `bits`-wide integer. Negative numbers become their two's complement pattern;
 * a pattern with the top bit set is also shown as the negative number it means when signed.
 */
export function fixedWidth(value: bigint, bits: number): Fixed {
  const size = 1n << BigInt(bits);
  const fits = value >= -(size >> 1n) && value < size;
  if (!fits) return { bits, pattern: null, signed: null, unsigned: null };
  const pattern = value < 0n ? size + value : value;
  return { bits, pattern, unsigned: pattern, signed: pattern >= size >> 1n ? pattern - size : pattern };
}

export const bitLength = (value: bigint) => (value < 0n ? -value : value).toString(2).replace(/^0$/, '').length;
