import { androidColor, optimizeSvg, svgToVector, toComposeImageVector, toVectorDrawable } from './vector';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <title>cart</title>
  <path d="M7 4h10l2 5H5z" fill="#4f46e5"/>
  <circle cx="9" cy="19" r="2" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>
  <g transform="translate(2 3)" opacity="0.5"><rect x="0" y="0" width="4" height="2" rx="1"/></g>
</svg>`;

describe('vector', () => {
  it('turns SVG shapes into VectorDrawable paths', () => {
    const r = svgToVector(ICON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const xml = toVectorDrawable(r.image);
    expect(xml).toContain('android:viewportWidth="24"');
    expect(xml).toContain('android:pathData="M7 4h10l2 5H5z"');
    expect(xml).toContain('android:fillColor="#FF4F46E5"');
    expect(xml).toContain('android:pathData="M7,19a2,2 0 1 0 4,0a2,2 0 1 0 -4,0z"');
    expect(xml).toContain('android:strokeColor="#FF000000"');
    expect(xml).toContain('android:strokeLineCap="round"');
    expect(xml).toContain('<group android:translateX="2" android:translateY="3">');
    expect(xml).toContain('android:fillAlpha="0.5"');
    expect(r.image.warnings).toEqual([]);
  });

  it('applies fill and stroke set on the root <svg> to every shape', () => {
    const r = svgToVector('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#123456" stroke-width="2"><path d="M4 4h16"/><path d="M4 8h16" fill="#fff"/></svg>');
    if (!r.ok) throw new Error('expected ok');
    const xml = toVectorDrawable(r.image);
    expect(xml.split('<path').length - 1).toBe(2);
    expect(xml.match(/android:fillColor="[^"]+"/g)).toEqual(['android:fillColor="#FFFFFFFF"']);
    expect(xml.match(/android:strokeColor="#FF123456"/g)?.length).toBe(2);
  });

  it('writes Compose ImageVector code', () => {
    const r = svgToVector(ICON);
    if (!r.ok) throw new Error();
    const kt = toComposeImageVector(r.image, 'CartIcon');
    expect(kt).toContain('val CartIcon: ImageVector = ImageVector.Builder(');
    expect(kt).toContain('pathData = addPathNodes("M7 4h10l2 5H5z")');
    expect(kt).toContain('fill = SolidColor(Color(0xFF4F46E5))');
    expect(kt).toContain('strokeLineCap = StrokeCap.Round');
    expect(kt).toContain('group(translationX = 2f, translationY = 3f) {');
  });

  it('reports what VectorDrawable cannot do', () => {
    const r = svgToVector('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>hi</text><path d="M0 0h10" fill="url(#g)"/></svg>');
    expect(r.ok && r.image.warnings).toEqual([
      '<text> has no VectorDrawable equivalent and was left out.',
      'Gradients and patterns are not supported; a black fill is used instead. Add the gradient by hand with <aapt:attr>.',
    ]);
    expect(svgToVector('<html/>')).toMatchObject({ ok: false });
    // CSS writes alpha last (#RRGGBBAA); Android first (#AARRGGBB).
    expect(androidColor('#ff000080', [])).toBe('#80FF0000');
    expect(androidColor('rgb(255, 0, 0)', [])).toBe('#FFFF0000');
  });

  it('optimizes SVG with SVGO', async () => {
    const r = await optimizeSvg(ICON);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg.length).toBeLessThan(ICON.length);
      // SVGO 4 keeps <title> on purpose, for screen readers.
      expect(r.svg).toContain('<title>cart</title>');
    }
  });
});
