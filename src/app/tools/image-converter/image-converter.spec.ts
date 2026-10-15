import { TestBed } from '@angular/core/testing';
import { ImageConverter } from './image-converter';

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('ImageConverter', () => {
  let revoked: string[];

  beforeEach(() => {
    let n = 0;
    revoked = [];
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  });

  async function setup() {
    const fixture = TestBed.createComponent(ImageConverter);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const choose = async (files: File[]) => {
      const input = el.querySelector<HTMLInputElement>('app-upload-box input[type=file]')!;
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const rows = () => [...el.querySelectorAll('li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    const counter = () => el.querySelector('[aria-label$="images"]')?.textContent?.trim();
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent)?.includes(label))!.click();
      await fixture.whenStable();
    };
    return { fixture, el, choose, rows, counter, text, click };
  }

  it('shows the drop zone and no list at first', async () => {
    const { text, counter } = await setup();
    expect(text()).toContain('Drop up to 15 images here');
    expect(counter()).toBeUndefined();
  });

  it('lists chosen images with a counter', async () => {
    const { choose, rows, counter } = await setup();
    await choose([png('one.png'), new File(['xx'], 'two.jpg', { type: 'image/jpeg' })]);
    expect(rows()).toEqual(['one.png PNG · 1 B', 'two.jpg JPG · 2 B']);
    expect(counter()).toBe('2 / 15');
  });

  it('keeps 15 of 20 chosen images, says so and disables the drop zone', async () => {
    const { el, choose, rows, counter, text } = await setup();
    await choose(Array.from({ length: 20 }, (_, i) => png(`photo-${i + 1}.png`)));
    expect(rows()).toHaveLength(15);
    expect(rows()[14]).toContain('photo-15.png');
    expect(counter()).toBe('15 / 15');
    expect(text()).toContain('5 images left out because a batch holds up to 15. The first 15 were kept.');
    expect(text()).toContain('The batch is full');
    expect(el.querySelector<HTMLButtonElement>('app-upload-box button')!.disabled).toBe(true);
  });

  it('explains skipped files', async () => {
    const { choose, rows, text } = await setup();
    await choose([png('ok.png'), new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(rows()).toHaveLength(1);
    expect(text()).toContain('Skipped because they are not PNG, JPG or WebP images: notes.txt.');
  });

  it('removes one image and frees its preview', async () => {
    const { choose, rows, counter, click } = await setup();
    await choose([png('a.png'), png('b.png')]);
    await click('Remove a.png');
    expect(rows()).toEqual(['b.png PNG · 1 B']);
    expect(counter()).toBe('1 / 15');
    expect(revoked).toEqual(['blob:1']);
  });

  it('clears all images', async () => {
    const { choose, rows, click, text } = await setup();
    await choose([png('a.png'), png('b.png')]);
    await click('Clear all');
    expect(rows()).toEqual([]);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(text()).toContain('Drop up to 15 images here');
  });

  it('frees previews when the page is left', async () => {
    const { fixture, choose } = await setup();
    await choose([png('a.png')]);
    fixture.destroy();
    expect(revoked).toEqual(['blob:1']);
  });
});
