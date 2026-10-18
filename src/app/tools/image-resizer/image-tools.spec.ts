import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Analytics } from '../../core/analytics';
import { ImageCropper } from '../image-cropper/image-cropper';
import { CropCanvas } from '../image-cropper/crop-canvas';
import { ImageResizer } from './image-resizer';
import { Resizer } from './resizer';

const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
};

const chooseFiles = async (el: HTMLElement, fixture: { whenStable(): Promise<unknown> }, files: File[]) => {
  const input = el.querySelector<HTMLInputElement>('app-upload-box input[type=file]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
  await settle(fixture);
};

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').includes(label))!;

describe('ImageResizer', () => {
  async function setup() {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const resize = vi.fn(async () => ({
      blob: new Blob(['x'.repeat(2048)]),
      width: 1080,
      height: 810,
      sourceWidth: 4000,
      sourceHeight: 3000,
      reachedLimit: true,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Resizer, useValue: { resize } },
        { provide: Analytics, useValue: { track: vi.fn(), load: vi.fn(), limitHit: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ImageResizer);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, resize, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  const photo = (name = 'holiday.jpg') => new File(['x'], name, { type: 'image/jpeg' });

  it('resizes to a width, keeping the shape, and names the file with the new size', async () => {
    const { fixture, el, resize, text } = await setup();
    await chooseFiles(el, fixture, [photo()]);
    button(el, 'Resize 1 image').click();
    await settle(fixture);
    expect(resize).toHaveBeenCalledWith(
      expect.any(File),
      { mode: 'size', width: 1080, height: null, fit: 'fit' },
      expect.objectContaining({ format: 'jpg', maxBytes: null }),
    );
    expect(text()).toContain('4000×3000 to 1080×810 · JPG · 2 KB');
    expect(el.querySelector('[aria-label="Download holiday-1080x810.jpg"]')).not.toBeNull();
  });

  it('uses a social media preset, a format and a KB limit', async () => {
    const { fixture, el, resize } = await setup();
    await chooseFiles(el, fixture, [photo('a.png')]);
    button(el, 'Social media size').click();
    await settle(fixture);
    const [preset, format] = el.querySelectorAll('select');
    preset.value = 'youtube-thumbnail';
    preset.dispatchEvent(new Event('change'));
    format.value = 'webp';
    format.dispatchEvent(new Event('change'));
    const kb = el.querySelector<HTMLInputElement>('input[placeholder="No limit"]')!;
    kb.value = '100';
    kb.dispatchEvent(new Event('input'));
    await settle(fixture);
    button(el, 'Resize 1 image').click();
    await settle(fixture);
    expect(resize).toHaveBeenCalledWith(
      expect.any(File),
      { mode: 'size', width: 1280, height: 720, fit: 'fill' },
      expect.objectContaining({ format: 'webp', maxBytes: 100 * 1024 }),
    );
  });

  it('shows the fit choice only when both sides are set', async () => {
    const { fixture, el } = await setup();
    expect(el.textContent).not.toContain('Fit inside (keep shape)');
    const height = el.querySelectorAll<HTMLInputElement>('input[placeholder="Auto"]')[1];
    height.value = '1080';
    height.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(el.textContent).toContain('Fill and crop edges');
  });
});

describe('ImageCropper', () => {
  async function setup() {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const canvas = { width: 1000, height: 800 } as HTMLCanvasElement;
    const crop = vi.fn(async () => new Blob(['png']));
    const fake = {
      open: vi.fn(async () => canvas),
      rotate: vi.fn(() => ({ width: 800, height: 1000 }) as HTMLCanvasElement),
      flip: vi.fn(() => canvas),
      crop,
      preview: vi.fn(async () => new Blob(['png'])),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CropCanvas, useValue: fake },
        { provide: Analytics, useValue: { track: vi.fn(), load: vi.fn(), limitHit: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ImageCropper);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    await chooseFiles(el, fixture, [new File(['x'], 'me.heic', { type: 'image/heic' })]);
    const fields = () => [...el.querySelectorAll<HTMLInputElement>('input[type=number]')].map((i) => Number(i.value));
    return { fixture, el, fake, crop, fields };
  }

  it('opens the image with a centred box and shows its size', async () => {
    const { el, fields } = await setup();
    expect(el.querySelector('img[alt="Image to crop"]')).not.toBeNull();
    expect(fields()).toEqual([100, 80, 800, 640]);
    expect(el.textContent).toContain('Image: 1000×800 px');
  });

  it('keeps a chosen shape, and saves a circle as PNG', async () => {
    const { fixture, el, crop, fields } = await setup();
    button(el, '1:1 square').click();
    await settle(fixture);
    const [, , width, height] = fields();
    expect(width).toBe(height);
    button(el, 'Circle').click();
    await settle(fixture);
    button(el, 'Download').click();
    await settle(fixture);
    expect(crop).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width }), true, 'png', 0.92);
  });

  it('moves the box with the arrow keys', async () => {
    const { fixture, el, fields } = await setup();
    const box = el.querySelector<HTMLElement>('[role=group]')!;
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    await settle(fixture);
    expect(fields()[0]).toBe(110);
  });

  it('rotates and starts a new box for the turned image', async () => {
    const { fixture, el, fake } = await setup();
    button(el, 'Rotate').click();
    await settle(fixture);
    expect(fake.rotate).toHaveBeenCalled();
    expect(el.textContent).toContain('Image: 800×1000 px');
  });

  it('takes typed sizes, kept inside the image', async () => {
    const { fixture, el, fields } = await setup();
    const width = el.querySelectorAll<HTMLInputElement>('input[type=number]')[2];
    width.value = '5000';
    width.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(fields()[2]).toBe(900);
  });
});
