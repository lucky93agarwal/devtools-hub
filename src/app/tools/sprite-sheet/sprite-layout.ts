/** Placing many small images on one sprite sheet, and the CSS and JSON that point to each. */

export type Layout = 'grid' | 'horizontal' | 'vertical' | 'packed';

export interface SpriteInput {
  name: string;
  width: number;
  height: number;
}

export interface Placed extends SpriteInput {
  x: number;
  y: number;
}

export interface Sheet {
  width: number;
  height: number;
  sprites: Placed[];
}

/** Lays the sprites out with `padding` pixels between and around them. */
export function layoutSprites(inputs: readonly SpriteInput[], layout: Layout, padding: number, columns = 0): Sheet {
  const sprites: Placed[] = [];
  if (!inputs.length) return { width: 0, height: 0, sprites };
  if (layout === 'horizontal' || layout === 'vertical') {
    let offset = padding;
    for (const input of inputs) {
      sprites.push(layout === 'horizontal' ? { ...input, x: offset, y: padding } : { ...input, x: padding, y: offset });
      offset += (layout === 'horizontal' ? input.width : input.height) + padding;
    }
  } else if (layout === 'grid') {
    const cols = columns > 0 ? columns : Math.ceil(Math.sqrt(inputs.length));
    const cellW = Math.max(...inputs.map((i) => i.width));
    const cellH = Math.max(...inputs.map((i) => i.height));
    inputs.forEach((input, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Centre each sprite in its cell.
      sprites.push({
        ...input,
        x: padding + col * (cellW + padding) + Math.floor((cellW - input.width) / 2),
        y: padding + row * (cellH + padding) + Math.floor((cellH - input.height) / 2),
      });
    });
  } else {
    // Shelf packing: tallest first, filling rows up to a width near the square root of the total area.
    const area = inputs.reduce((n, i) => n + (i.width + padding) * (i.height + padding), 0);
    const maxRow = Math.max(Math.ceil(Math.sqrt(area)), ...inputs.map((i) => i.width + padding * 2));
    const order = [...inputs].sort((a, b) => b.height - a.height || b.width - a.width);
    let x = padding;
    let y = padding;
    let rowHeight = 0;
    for (const input of order) {
      if (x + input.width + padding > maxRow && x > padding) {
        x = padding;
        y += rowHeight + padding;
        rowHeight = 0;
      }
      sprites.push({ ...input, x, y });
      x += input.width + padding;
      rowHeight = Math.max(rowHeight, input.height);
    }
  }
  const width = Math.max(...sprites.map((s) => s.x + s.width)) + padding;
  const height = Math.max(...sprites.map((s) => s.y + s.height)) + padding;
  return { width, height, sprites };
}

/** A CSS class name from a file name: "Arrow Left@2x.png" becomes "arrow-left-2x". */
export function className(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sprite'
  );
}

/** CSS with one class per sprite. With `retina`, the sheet is drawn at half size for sharp 2x screens. */
export function spriteCss(sheet: Sheet, prefix: string, imageUrl: string, retina = false): string {
  const scale = retina ? 0.5 : 1;
  const base = `.${prefix} {\n  display: inline-block;\n  background-image: url('${imageUrl}');\n  background-repeat: no-repeat;\n${
    retina ? `  background-size: ${sheet.width * scale}px ${sheet.height * scale}px;\n` : ''
  }}\n`;
  const rules = sheet.sprites.map(
    (s) =>
      `.${prefix}-${className(s.name)} {\n  width: ${s.width * scale}px;\n  height: ${s.height * scale}px;\n  background-position: -${s.x * scale}px -${s.y * scale}px;\n}`,
  );
  return base + '\n' + rules.join('\n\n') + '\n';
}

/** JSON in the "hash" format TexturePacker, Phaser and PixiJS read. */
export function spriteJson(sheet: Sheet, imageName: string): string {
  const frames: Record<string, unknown> = {};
  for (const s of sheet.sprites) {
    frames[s.name] = {
      frame: { x: s.x, y: s.y, w: s.width, h: s.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: s.width, h: s.height },
      sourceSize: { w: s.width, h: s.height },
    };
  }
  return (
    JSON.stringify({ frames, meta: { app: 'DevTools24', image: imageName, format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: '1' } }, null, 2) +
    '\n'
  );
}
