/**
 * SVG to Android VectorDrawable XML and Jetpack Compose ImageVector code. Shapes (rect, circle, ellipse, line,
 * polyline, polygon) become paths; groups keep translate, scale and rotate. Gradients, masks, text and filters
 * have no VectorDrawable equivalent and are reported.
 */

export interface VectorPath {
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  fillAlpha: number;
  strokeAlpha: number;
  evenOdd: boolean;
  lineCap: string | null;
  lineJoin: string | null;
}

export interface VectorGroup {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  children: VectorNode[];
}

export type VectorNode = { kind: 'path'; path: VectorPath } | { kind: 'group'; group: VectorGroup };

export interface VectorImage {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  children: VectorNode[];
  warnings: string[];
}

export type VectorResult = { ok: true; image: VectorImage } | { ok: false; error: string };

const NAMED: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', gray: '808080', grey: '808080', orange: 'FFA500', yellow: 'FFFF00', purple: '800080', transparent: '00000000' };

/** A colour as #AARRGGBB, or null for none. */
export function androidColor(value: string | null | undefined, warnings: string[]): string | null {
  if (!value || value === 'none') return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith('url(')) {
    warnings.push('Gradients and patterns are not supported; a black fill is used instead. Add the gradient by hand with <aapt:attr>.');
    return '#FF000000';
  }
  if (v === 'currentcolor') {
    warnings.push('currentColor became black. Set android:tint on the drawable to colour it.');
    return '#FF000000';
  }
  let hex = NAMED[v] ?? '';
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) hex = short.slice(1).map((c) => c + c).join('');
  else if (/^#[0-9a-f]{6}$/.test(v)) hex = v.slice(1);
  else if (/^#[0-9a-f]{8}$/.test(v)) return `#${v.slice(7, 9)}${v.slice(1, 7)}`.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (rgb) hex = rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  if (!hex) {
    warnings.push(`The colour “${value}” could not be read; black is used.`);
    return '#FF000000';
  }
  return `#${hex.length === 8 ? hex : `FF${hex}`}`.toUpperCase();
}

const num = (v: string | null | undefined, fallback = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isNaN(n) ? fallback : n;
};

function shapeToPath(el: Element): string | null {
  const a = (name: string) => num(el.getAttribute(name));
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const [x, y, w, h] = [a('x'), a('y'), a('width'), a('height')];
      let rx = a('rx');
      let ry = el.hasAttribute('ry') ? a('ry') : rx;
      rx = Math.min(rx || ry, w / 2);
      ry = Math.min(ry || rx, h / 2);
      if (!rx) return `M${x},${y}h${w}v${h}h${-w}z`;
      return `M${x + rx},${y}h${w - 2 * rx}a${rx},${ry} 0 0 1 ${rx},${ry}v${h - 2 * ry}a${rx},${ry} 0 0 1 ${-rx},${ry}h${-(w - 2 * rx)}a${rx},${ry} 0 0 1 ${-rx},${-ry}v${-(h - 2 * ry)}a${rx},${ry} 0 0 1 ${rx},${-ry}z`;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [a('cx'), a('cy')];
      const rx = el.tagName.toLowerCase() === 'circle' ? a('r') : a('rx');
      const ry = el.tagName.toLowerCase() === 'circle' ? a('r') : a('ry');
      return `M${cx - rx},${cy}a${rx},${ry} 0 1 0 ${2 * rx},0a${rx},${ry} 0 1 0 ${-2 * rx},0z`;
    }
    case 'line':
      return `M${a('x1')},${a('y1')}L${a('x2')},${a('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]},${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]},${pts[i + 1]}`;
      return el.tagName.toLowerCase() === 'polygon' ? `${d}z` : d;
    }
  }
  return null;
}

/** Inherited presentation values: SVG attributes and inline style, the style winning. */
function styleOf(el: Element, inherited: Record<string, string>): Record<string, string> {
  const own: Record<string, string> = { ...inherited };
  for (const name of ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin']) {
    const v = el.getAttribute(name);
    if (v !== null) own[name] = v;
  }
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const [k, v] = decl.split(':').map((s) => s?.trim());
    if (k && v) own[k] = v;
  }
  return own;
}

function transformOf(el: Element, warnings: string[]): Omit<VectorGroup, 'children'> | null {
  const t = el.getAttribute('transform');
  if (!t) return null;
  const g = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  for (const m of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (m[1] === 'translate') [g.translateX, g.translateY] = [v[0] ?? 0, v[1] ?? 0];
    else if (m[1] === 'scale') [g.scaleX, g.scaleY] = [v[0] ?? 1, v[1] ?? v[0] ?? 1];
    else if (m[1] === 'rotate') g.rotation = v[0] ?? 0;
    else warnings.push(`The transform “${m[0]}” is not supported by VectorDrawable and was left out.`);
  }
  return g;
}

export function svgToVector(svgText: string): VectorResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.tagName.toLowerCase() !== 'svg') return { ok: false, error: 'This is not a valid SVG file.' };
  const warnings: string[] = [];
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const vw = vb.length === 4 && vb[2] > 0 ? vb[2] : num(svg.getAttribute('width'), 24);
  const vh = vb.length === 4 && vb[3] > 0 ? vb[3] : num(svg.getAttribute('height'), 24);
  if (vb.length === 4 && (vb[0] || vb[1])) warnings.push('The viewBox does not start at 0,0; a group moves the drawing into place.');

  const walk = (parent: Element, inherited: Record<string, string>): VectorNode[] => {
    const nodes: VectorNode[] = [];
    for (const el of Array.from(parent.children)) {
      const tag = el.tagName.toLowerCase();
      if (['defs', 'title', 'desc', 'metadata', 'style'].includes(tag)) continue;
      const style = styleOf(el, inherited);
      const transform = transformOf(el, warnings);
      let children: VectorNode[];
      if (tag === 'g' || tag === 'a') children = walk(el, style);
      else if (['text', 'image', 'use', 'mask', 'clippath', 'filter', 'pattern', 'lineargradient', 'radialgradient', 'foreignobject'].includes(tag)) {
        if (!['lineargradient', 'radialgradient', 'clippath'].includes(tag)) warnings.push(`<${tag}> has no VectorDrawable equivalent and was left out.`);
        continue;
      } else {
        const d = shapeToPath(el);
        if (!d) continue;
        const opacity = num(style['opacity'], 1);
        const fill = style['fill'] === undefined ? '#FF000000' : androidColor(style['fill'], warnings);
        children = [
          {
            kind: 'path',
            path: {
              d: d.replace(/\s+/g, ' ').trim(),
              fill,
              stroke: androidColor(style['stroke'], warnings),
              strokeWidth: style['stroke'] && style['stroke'] !== 'none' ? num(style['stroke-width'], 1) : null,
              fillAlpha: num(style['fill-opacity'], 1) * opacity,
              strokeAlpha: num(style['stroke-opacity'], 1) * opacity,
              evenOdd: style['fill-rule'] === 'evenodd',
              lineCap: style['stroke-linecap'] ?? null,
              lineJoin: style['stroke-linejoin'] ?? null,
            },
          },
        ];
      }
      if (transform) nodes.push({ kind: 'group', group: { ...transform, children } });
      else nodes.push(...children);
    }
    return nodes;
  };
  // Attributes on the root <svg>, such as fill="none" from Figma and Lucide icons, apply to every shape.
  let children = walk(svg, styleOf(svg, {}));
  if (vb.length === 4 && (vb[0] || vb[1])) children = [{ kind: 'group', group: { translateX: -vb[0], translateY: -vb[1], scaleX: 1, scaleY: 1, rotation: 0, children } }];
  if (!children.length) return { ok: false, error: 'No shapes were found to convert.' };
  return {
    ok: true,
    image: { width: num(svg.getAttribute('width'), vw), height: num(svg.getAttribute('height'), vh), viewportWidth: vw, viewportHeight: vh, children, warnings: [...new Set(warnings)] },
  };
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function toVectorDrawable(img: VectorImage): string {
  const node = (v: VectorNode, pad: string): string => {
    if (v.kind === 'group') {
      const g = v.group;
      const attrs = [
        g.translateX && `android:translateX="${n(g.translateX)}"`,
        g.translateY && `android:translateY="${n(g.translateY)}"`,
        g.scaleX !== 1 && `android:scaleX="${n(g.scaleX)}"`,
        g.scaleY !== 1 && `android:scaleY="${n(g.scaleY)}"`,
        g.rotation && `android:rotation="${n(g.rotation)}"`,
      ].filter(Boolean);
      return `${pad}<group${attrs.length ? ' ' + attrs.join(' ') : ''}>\n${g.children.map((c) => node(c, pad + '    ')).join('\n')}\n${pad}</group>`;
    }
    const p = v.path;
    const attrs = [
      `android:pathData="${esc(p.d)}"`,
      p.fill && `android:fillColor="${p.fill}"`,
      p.fillAlpha !== 1 && `android:fillAlpha="${n(p.fillAlpha)}"`,
      p.stroke && `android:strokeColor="${p.stroke}"`,
      p.strokeWidth !== null && `android:strokeWidth="${n(p.strokeWidth)}"`,
      p.stroke && p.strokeAlpha !== 1 && `android:strokeAlpha="${n(p.strokeAlpha)}"`,
      p.lineCap && `android:strokeLineCap="${p.lineCap}"`,
      p.lineJoin && `android:strokeLineJoin="${p.lineJoin}"`,
      p.evenOdd && 'android:fillType="evenOdd"',
    ].filter(Boolean);
    return `${pad}<path\n${attrs.map((a) => `${pad}    ${a}`).join('\n')} />`;
  };
  return (
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n` +
    `    android:width="${n(img.width)}dp"\n    android:height="${n(img.height)}dp"\n` +
    `    android:viewportWidth="${n(img.viewportWidth)}"\n    android:viewportHeight="${n(img.viewportHeight)}">\n` +
    img.children.map((c) => node(c, '    ')).join('\n') +
    '\n</vector>\n'
  );
}

const composeColor = (c: string) => `Color(0x${c.slice(1)})`;
const capName: Record<string, string> = { round: 'Round', square: 'Square', butt: 'Butt', miter: 'Miter', bevel: 'Bevel' };

export function toComposeImageVector(img: VectorImage, name = 'MyIcon'): string {
  const node = (v: VectorNode, pad: string): string => {
    if (v.kind === 'group') {
      const g = v.group;
      const args = [
        g.translateX && `translationX = ${n(g.translateX)}f`,
        g.translateY && `translationY = ${n(g.translateY)}f`,
        g.scaleX !== 1 && `scaleX = ${n(g.scaleX)}f`,
        g.scaleY !== 1 && `scaleY = ${n(g.scaleY)}f`,
        g.rotation && `rotate = ${n(g.rotation)}f`,
      ].filter(Boolean);
      return `${pad}group(${args.join(', ')}) {\n${g.children.map((c) => node(c, pad + '    ')).join('\n')}\n${pad}}`;
    }
    const p = v.path;
    const args = [
      `pathData = addPathNodes(${JSON.stringify(p.d)})`,
      p.fill && `fill = SolidColor(${composeColor(p.fill)})`,
      p.fillAlpha !== 1 && `fillAlpha = ${n(p.fillAlpha)}f`,
      p.stroke && `stroke = SolidColor(${composeColor(p.stroke)})`,
      p.strokeWidth !== null && `strokeLineWidth = ${n(p.strokeWidth)}f`,
      p.stroke && p.strokeAlpha !== 1 && `strokeAlpha = ${n(p.strokeAlpha)}f`,
      p.lineCap && capName[p.lineCap] && `strokeLineCap = StrokeCap.${capName[p.lineCap]}`,
      p.lineJoin && capName[p.lineJoin] && `strokeLineJoin = StrokeJoin.${capName[p.lineJoin]}`,
      p.evenOdd && 'pathFillType = PathFillType.EvenOdd',
    ].filter(Boolean);
    return `${pad}addPath(\n${args.map((a) => `${pad}    ${a},`).join('\n')}\n${pad})`;
  };
  return (
    `import androidx.compose.ui.graphics.*\nimport androidx.compose.ui.graphics.vector.*\nimport androidx.compose.ui.unit.dp\n\n` +
    `val ${name}: ImageVector = ImageVector.Builder(\n    name = "${name}",\n    defaultWidth = ${n(img.width)}.dp,\n    defaultHeight = ${n(img.height)}.dp,\n` +
    `    viewportWidth = ${n(img.viewportWidth)}f,\n    viewportHeight = ${n(img.viewportHeight)}f,\n).apply {\n` +
    img.children.map((c) => node(c, '    ')).join('\n') +
    '\n}.build()\n'
  );
}

/** SVG made smaller with SVGO (loaded only when used). */
export async function optimizeSvg(svg: string): Promise<{ ok: true; svg: string } | { ok: false; error: string }> {
  const { optimize } = await import('svgo/browser');
  try {
    return { ok: true, svg: optimize(svg, { multipass: true }).data };
  } catch (error) {
    return { ok: false, error: `SVGO could not read this SVG: ${(error as Error).message.split('\n')[0]}` };
  }
}
