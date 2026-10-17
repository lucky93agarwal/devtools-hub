import { TestBed } from '@angular/core/testing';
import { BeforeAfter } from './before-after';
import { composeBackground, coverRect } from './compose';

describe('coverRect', () => {
  it('crops the sides of a wide background for a tall image', () => {
    expect(coverRect(2000, 1000, 500, 500)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it('crops top and bottom of a tall background for a wide image', () => {
    expect(coverRect(1000, 2000, 800, 400)).toEqual({ sx: 0, sy: 750, sw: 1000, sh: 500 });
  });

  it('uses the whole background when the shapes match', () => {
    expect(coverRect(1600, 900, 800, 450)).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 900 });
  });
});

describe('composeBackground', () => {
  it('returns the cut-out unchanged when the background stays transparent', async () => {
    const cutout = new Blob(['png'], { type: 'image/png' });
    expect(await composeBackground(cutout, { kind: 'transparent' })).toBe(cutout);
  });
});

describe('BeforeAfter', () => {
  async function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(BeforeAfter);
    fixture.componentRef.setInput('before', 'blob:before');
    fixture.componentRef.setInput('after', 'blob:after');
    fixture.componentRef.setInput('width', 1600);
    fixture.componentRef.setInput('height', 1200);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, top: () => el.querySelectorAll('img')[1] as HTMLImageElement };
  }

  it('starts at the middle and keeps the image shape', async () => {
    const { el, top } = await setup();
    expect(top().style.clipPath).toBe('inset(0 50% 0 0)');
    expect((el.firstElementChild as HTMLElement).style.aspectRatio).toBe('1600 / 1200');
  });

  it('moves the divider with the slider', async () => {
    const { fixture, el, top } = await setup();
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '20';
    range.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(top().style.clipPath).toBe('inset(0 80% 0 0)');
    expect(range.getAttribute('aria-valuetext')).toBe('20% before');
  });

  it('shows the chosen background behind the result', async () => {
    const { el } = await setup({ backgroundColour: '#4f46e5' });
    const layer = el.querySelector<HTMLElement>('.absolute.inset-0')!;
    expect(layer.style.backgroundColor).toBe('rgb(79, 70, 229)');
    expect(layer.classList.contains('checkerboard')).toBe(false);
  });

  it('shows the checkerboard for a transparent background', async () => {
    const { el } = await setup();
    expect(el.querySelector('.checkerboard')).not.toBeNull();
  });
});
