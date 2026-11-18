import { className, layoutSprites, spriteCss, spriteJson } from './sprite-layout';

const icons = [
  { name: 'a.png', width: 16, height: 16 },
  { name: 'b.png', width: 32, height: 16 },
  { name: 'c.png', width: 16, height: 32 },
];

describe('sprite layout', () => {
  it('lays sprites in a row and a column with padding', () => {
    expect(layoutSprites(icons, 'horizontal', 2)).toMatchObject({ width: 2 + 16 + 2 + 32 + 2 + 16 + 2, height: 36 });
    expect(layoutSprites(icons, 'vertical', 0).sprites.map((s) => s.y)).toEqual([0, 16, 32]);
  });

  it('centres sprites in grid cells', () => {
    const sheet = layoutSprites(icons, 'grid', 0, 2);
    expect(sheet.width).toBe(64);
    expect(sheet.sprites[0]).toMatchObject({ x: 8, y: 8 });
  });

  it('packs without overlaps', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `${i}.png`, width: 10 + (i % 5) * 4, height: 8 + (i % 3) * 6 }));
    const { sprites } = layoutSprites(many, 'packed', 1);
    for (const a of sprites) {
      for (const b of sprites) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it('writes CSS and JSON', () => {
    const sheet = layoutSprites(icons, 'horizontal', 0);
    expect(className('Arrow Left@2x.png')).toBe('arrow-left-2x');
    expect(spriteCss(sheet, 'icon', 'sprites.png')).toContain('.icon-b {\n  width: 32px;\n  height: 16px;\n  background-position: -16px -0px;\n}');
    expect(spriteCss(sheet, 'icon', 'sprites.png', true)).toContain('background-size: 32px 16px;');
    expect(JSON.parse(spriteJson(sheet, 'sprites.png')).frames['c.png'].frame).toEqual({ x: 48, y: 0, w: 16, h: 32 });
  });
});
