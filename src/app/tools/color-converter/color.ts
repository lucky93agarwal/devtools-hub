/** CSS colour parsing and conversion (HEX, RGB, HSL, OKLCH), code for apps, and WCAG contrast. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 to 1 */
  a: number;
}

export type ColorResult = { ok: true; color: Rgba } | { ok: false; error: string };

// CSS named colours, as name:hex pairs.
const NAMED = Object.fromEntries(
  ('aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 ' +
    'black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 ' +
    'chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff ' +
    'darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 ' +
    'darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
    'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f ' +
    'darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 ' +
    'dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
    'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 ' +
    'honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa ' +
    'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff ' +
    'lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 ' +
    'lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
    'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 ' +
    'mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 ' +
    'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 ' +
    'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 ' +
    'oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa ' +
    'palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f ' +
    'pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f ' +
    'royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee ' +
    'sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa ' +
    'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 ' +
    'violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32')
    .split(' ')
    .map((pair) => pair.split(':')),
);

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 0) => Number(n.toFixed(digits));

/** A number, a percentage of `full`, or an angle in deg/turn/rad/grad converted to degrees. */
function num(text: string, full = 1): number {
  const value = parseFloat(text);
  if (Number.isNaN(value)) throw new Error();
  if (text.endsWith('%')) return (value / 100) * full;
  if (text.endsWith('turn')) return value * 360;
  if (text.endsWith('grad')) return value * 0.9;
  if (text.endsWith('rad')) return (value * 180) / Math.PI;
  return value;
}

export function parseColor(input: string): ColorResult {
  const text = input.trim().toLowerCase();
  if (!text) return { ok: false, error: '' };
  try {
    if (NAMED[text]) return parseColor('#' + NAMED[text]);
    if (text === 'transparent') return { ok: true, color: { r: 0, g: 0, b: 0, a: 0 } };
    // Android and Flutter write colours as 0xAARRGGBB.
    const android = /^0x([0-9a-f]{8})$/.exec(text);
    if (android) {
      const h = android[1];
      return parseColor(`#${h.slice(2)}${h.slice(0, 2)}`);
    }
    const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
    if (hex) {
      let h = hex[1];
      if (h.length <= 4) h = [...h].map((c) => c + c).join('');
      const byte = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return { ok: true, color: { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? round(byte(6) / 255, 3) : 1 } };
    }
    const fn = /^(rgba?|hsla?|oklch)\(\s*(.+?)\s*\)$/.exec(text);
    if (fn) {
      const parts = fn[2].replace(/\s*\/\s*/, ' / ').split(/\s*,\s*|\s+/).filter((p) => p && p !== '/');
      if (parts.length < 3 || parts.length > 4) throw new Error();
      const alpha = parts[3] === undefined ? 1 : clamp(num(parts[3]));
      if (fn[1].startsWith('rgb')) {
        const [r, g, b] = parts.slice(0, 3).map((p) => clamp(Math.round(num(p, 255)), 0, 255));
        return { ok: true, color: { r, g, b, a: alpha } };
      }
      if (fn[1].startsWith('hsl')) {
        // Saturation and lightness: "75%", or a bare 75 as the legacy comma syntax allows.
        const fraction = (p: string) => clamp(p.endsWith('%') ? num(p, 1) : num(p) / 100);
        return { ok: true, color: { ...hslToRgb(num(parts[0]), fraction(parts[1]), fraction(parts[2])), a: alpha } };
      }
      const l = parts[0].endsWith('%') ? num(parts[0], 1) : num(parts[0]);
      const c = parts[1].endsWith('%') ? num(parts[1], 0.4) : num(parts[1]);
      return { ok: true, color: { ...oklchToRgb(l, c, num(parts[2])), a: alpha } };
    }
  } catch {
    // Falls through to the message below.
  }
  return { ok: false, error: 'Enter a colour such as #4f46e5, rgb(79 70 229), hsl(243 75% 59%), oklch(…), 0xFF4F46E5 or a name like teal.' };
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, 'a'> {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, round(l * 100, 1)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [round((h * 60 + 360) % 360, 1), round(s * 100, 1), round(l * 100, 1)];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** OKLCH by Björn Ottosson's OKLab matrices. */
export function rgbToOklch({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map((c) => toLinear(c / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = C < 0.0001 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [round(L * 100, 2), round(C, 4), round(H, 2)];
}

function oklchToRgb(L: number, C: number, H: number): Omit<Rgba, 'a'> {
  const h = (H * Math.PI) / 180;
  const [A, B] = [C * Math.cos(h), C * Math.sin(h)];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(Math.round(fromLinear(c) * 255), 0, 255));
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
const alphaByte = (a: number) => Math.round(a * 255);

export function toHex(c: Rgba, upper = false): string {
  const hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(alphaByte(c.a)) : ''}`;
  return upper ? hex.toUpperCase() : hex;
}

export interface ColorFormat {
  label: string;
  value: string;
}

export function formats(c: Rgba): ColorFormat[] {
  const [h, s, l] = rgbToHsl(c);
  const [L, C, H] = rgbToOklch(c);
  const alpha = c.a < 1 ? ` / ${round(c.a, 3)}` : '';
  const argb = `${hex2(alphaByte(c.a))}${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  const unit = (n: number) => round(n / 255, 3);
  return [
    { label: 'HEX', value: toHex(c) },
    { label: 'RGB', value: `rgb(${c.r} ${c.g} ${c.b}${alpha})` },
    { label: 'HSL', value: `hsl(${h} ${s}% ${l}%${alpha})` },
    { label: 'OKLCH', value: `oklch(${L}% ${C} ${H}${alpha})` },
    { label: 'Android XML', value: `#${argb}` },
    { label: 'Jetpack Compose', value: `Color(0x${argb})` },
    { label: 'Flutter', value: `Color(0x${argb})` },
    { label: 'SwiftUI', value: `Color(red: ${unit(c.r)}, green: ${unit(c.g)}, blue: ${unit(c.b)}, opacity: ${round(c.a, 3)})` },
    { label: 'UIKit', value: `UIColor(red: ${unit(c.r)}, green: ${unit(c.g)}, blue: ${unit(c.b)}, alpha: ${round(c.a, 3)})` },
  ];
}

/** Draws a translucent colour over an opaque one. */
const over = (top: Rgba, bottom: Rgba): Rgba => ({
  r: Math.round(top.r * top.a + bottom.r * (1 - top.a)),
  g: Math.round(top.g * top.a + bottom.g * (1 - top.a)),
  b: Math.round(top.b * top.a + bottom.b * (1 - top.a)),
  a: 1,
});

const luminance = (c: Rgba) => {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2 contrast ratio of text on a background, from 1 to 21. A translucent background is put on white first. */
export function contrast(text: Rgba, background: Rgba): number {
  const bg = background.a < 1 ? over(background, { r: 255, g: 255, b: 255, a: 1 }) : background;
  const fg = text.a < 1 ? over(text, bg) : text;
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return round((a + 0.05) / (b + 0.05), 2);
}
