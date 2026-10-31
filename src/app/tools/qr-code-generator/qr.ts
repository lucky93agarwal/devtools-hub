/** QR code matrices with qrcode-generator, drawn as SVG or onto a canvas, plus payloads for Wi-Fi, email and phone. */
import qrcode from 'qrcode-generator';

// The library's default only keeps the low byte of each character; UTF-8 lets any language and emoji through.
qrcode.stringToBytes = (text: string) => [...new TextEncoder().encode(text)];

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export type QrResult = { ok: true; modules: boolean[][] } | { ok: false; error: string };

export function makeQr(text: string, ecc: Ecc): QrResult {
  if (!text) return { ok: false, error: '' };
  try {
    const qr = qrcode(0, ecc);
    qr.addData(text, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const modules = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
    return { ok: true, modules };
  } catch {
    return {
      ok: false,
      error: 'This is too much data for a QR code at this error correction level. Shorten it or choose a lower level.',
    };
  }
}

export interface QrStyle {
  /** Quiet zone around the code, in modules. 4 is the standard. */
  margin: number;
  foreground: string;
  background: string;
}

/** One path with a short run per row of dark modules keeps the SVG small. */
export function toSvg(modules: boolean[][], style: QrStyle): string {
  const size = modules.length + style.margin * 2;
  let path = '';
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let run = 1;
      while (row[x + run]) run++;
      path += `M${x + style.margin} ${y + style.margin}h${run}v1h-${run}z`;
      x += run - 1;
    }
  });
  const background = style.background === 'transparent' ? '' : `<rect width="${size}" height="${size}" fill="${style.background}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `${background}<path fill="${style.foreground}" d="${path}"/></svg>`
  );
}

/** Draws the code at `pixels` square, with whole-pixel modules where possible so it stays sharp. */
export function drawToCanvas(canvas: HTMLCanvasElement, modules: boolean[][], style: QrStyle, pixels: number): void {
  const count = modules.length + style.margin * 2;
  const cell = Math.max(1, Math.floor(pixels / count));
  const size = cell * count;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, size, size);
  if (style.background !== 'transparent') {
    context.fillStyle = style.background;
    context.fillRect(0, 0, size, size);
  }
  context.fillStyle = style.foreground;
  modules.forEach((row, y) =>
    row.forEach((dark, x) => dark && context.fillRect((x + style.margin) * cell, (y + style.margin) * cell, cell, cell)),
  );
}

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

/** Characters with a meaning in the Wi-Fi QR format are escaped with a backslash. */
const wifiEscape = (text: string) => text.replace(/([\;,:"])/g, '\\$1');

export function wifiPayload(ssid: string, password: string, security: WifiSecurity, hidden: boolean): string {
  const pass = security === 'nopass' ? '' : `P:${wifiEscape(password)};`;
  return `WIFI:T:${security};S:${wifiEscape(ssid)};${pass}${hidden ? 'H:true;' : ''};`;
}

export function emailPayload(to: string, subject: string, body: string): string {
  const query = new URLSearchParams();
  if (subject) query.set('subject', subject);
  if (body) query.set('body', body);
  const search = query.toString().replace(/\+/g, '%20');
  return `mailto:${to.trim()}${search ? `?${search}` : ''}`;
}

export const phonePayload = (phone: string) => `tel:${phone.replace(/[^\d+*#]/g, '')}`;
