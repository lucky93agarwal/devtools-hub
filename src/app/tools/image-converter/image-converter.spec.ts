import { TestBed } from '@angular/core/testing';
import { unzipSync } from 'fflate';
import { ImageConverter } from './image-converter';
import { ConvertError, ConvertOptions, ImageEncoder, ImageFormat, outputName, targetSize } from './image-encoder';

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('outputName', () => {
  it('swaps the extension for the new format', () => {
    expect(outputName('holiday.jpeg', 'webp')).toBe('holiday.webp');
    expect(outputName('logo.final.png', 'jpg')).toBe('logo.final.jpg');
    expect(outputName('scan', 'png')).toBe('scan.png');
  });

  it('adds a suffix before the extension', () => {
    expect(outputName('holiday.jpeg', 'webp', '-converted')).toBe('holiday-converted.webp');
  });
});

describe('targetSize', () => {
  it('keeps the original size', () => {
    expect(targetSize(1200, 900, { mode: 'original' })).toEqual({ width: 1200, height: 900 });
  });

  it('scales by a percentage', () => {
    expect(targetSize(1200, 900, { mode: 'scale', percent: 50 })).toEqual({ width: 600, height: 450 });
    expect(targetSize(1001, 333, { mode: 'scale', percent: 25 })).toEqual({ width: 250, height: 83 });
  });

  it('fits a maximum width and keeps the shape', () => {
    expect(targetSize(4000, 3000, { mode: 'width', width: 1920 })).toEqual({ width: 1920, height: 1440 });
  });

  it('never enlarges and never goes below 1 pixel', () => {
    expect(targetSize(800, 600, { mode: 'width', width: 1920 })).toEqual({ width: 800, height: 600 });
    expect(targetSize(3, 1, { mode: 'scale', percent: 25 })).toEqual({ width: 1, height: 1 });
  });
});

describe('ImageConverter', () => {
  let revoked: string[];
  let convert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    let n = 0;
    revoked = [];
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
    // Pretend encoder: a 200x100 image, output half the bytes, scaled like the real resize.
    convert = vi.fn(async (file: File, format: ImageFormat, options?: ConvertOptions) => {
      if (file.name.startsWith('broken')) throw new ConvertError('This image could not be read. The file may be damaged.');
      const size = targetSize(200, 100, options?.resize ?? { mode: 'original' });
      const blob = new Blob(['x'.repeat(Math.max(1, Math.floor(file.size / 2)))], { type: `image/${format}` });
      return { blob, ...size, sourceWidth: 200, sourceHeight: 100 };
    });
    TestBed.configureTestingModule({ providers: [{ provide: ImageEncoder, useValue: { convert } }] });
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
    const rows = () => [...el.querySelectorAll('section[aria-labelledby="images-heading"] li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
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

  describe('converting', () => {
    const sized = (name: string, size: number) => new File(['x'.repeat(size)], name, { type: 'image/png' });
    const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };

    it('converts every image to the chosen format and shows the new size', async () => {
      const { fixture, choose, rows, click } = await setup();
      await choose([sized('a.png', 1000), sized('b.png', 400)]);
      await click('JPG');
      await click('Convert 2 images to JPG');
      await settle(fixture);
      expect(convert.mock.calls.map(([file, format]) => `${file.name}:${format}`)).toEqual(['a.png:jpg', 'b.png:jpg']);
      expect(rows()[0]).toContain('PNG · 1000 B → JPG · 200×100 · 500 B (50% smaller)');
      expect(rows()[1]).toContain('→ JPG · 200×100 · 200 B (50% smaller)');
    });

    it('uses WebP by default', async () => {
      const { fixture, choose, click } = await setup();
      await choose([sized('a.png', 10)]);
      await click('Convert 1 image to WebP');
      await settle(fixture);
      expect(convert).toHaveBeenCalledWith(expect.any(File), 'webp', { quality: 0.9, resize: { mode: 'original' } });
    });

    it('downloads a converted image with the new extension', async () => {
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      const { fixture, choose, click } = await setup();
      await choose([sized('holiday.png', 10)]);
      await click('Convert 1 image');
      await settle(fixture);
      await click('Download holiday.webp');
      expect(names).toEqual(['holiday.webp']);
      vi.restoreAllMocks();
    });

    it('shows an error for one image and still converts the rest', async () => {
      const { fixture, choose, rows, click, text } = await setup();
      await choose([sized('broken.png', 10), sized('good.png', 10)]);
      await click('Convert 2 images');
      await settle(fixture);
      expect(rows()[0]).toContain('This image could not be read. The file may be damaged.');
      expect(rows()[1]).toContain('→ WebP');
      // Only the failed image is left to convert.
      expect(text()).toContain('Try the failed image again');
    });

    it('marks results out of date when the format changes', async () => {
      const { fixture, choose, rows, click, text } = await setup();
      await choose([sized('a.png', 10)]);
      await click('Convert 1 image');
      await settle(fixture);
      expect(text()).toContain('All images converted');
      await click('PNG');
      expect(rows()[0]).not.toContain('→');
      expect(text()).toContain('Convert 1 image to PNG');
    });
  });

  describe('batch progress and ZIP', () => {
    const sized = (name: string, size: number) => new File(['x'.repeat(size)], name, { type: 'image/png' });
    const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };

    it('shows overall and per-image progress while converting', async () => {
      // Hold each conversion until the test releases it.
      const releases: (() => void)[] = [];
      convert.mockImplementation(
        (file: File, format: ImageFormat) =>
          new Promise((resolve) =>
            releases.push(() =>
              resolve({ blob: new Blob(['y'], { type: `image/${format}` }), width: 1, height: 1, sourceWidth: 1, sourceHeight: 1 }),
            ),
          ),
      );
      const { fixture, el, choose, rows, click } = await setup();
      await choose([sized('a.png', 4), sized('b.png', 4), sized('c.png', 4)]);
      await click('Convert 3 images');

      const bar = () => el.querySelector('[role=progressbar]');
      expect(el.textContent).toContain('Converting 1 of 3');
      expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
      expect(rows()[0]).toContain('converting…');
      expect(rows()[1]).toContain('waiting');
      expect(el.querySelectorAll('.progress-indeterminate')).toHaveLength(1);

      releases.shift()!();
      await settle(fixture);
      expect(el.textContent).toContain('Converting 2 of 3');
      expect(bar()?.getAttribute('aria-valuenow')).toBe('33');
      expect(rows()[0]).toContain('→ WebP');

      releases.shift()!();
      await settle(fixture);
      releases.shift()!();
      await settle(fixture);
      expect(bar()).toBeNull();
      expect(el.textContent).toContain('3 of 3 converted.');
    });

    it('offers to retry only the failed images', async () => {
      const { fixture, choose, click, text } = await setup();
      await choose([sized('broken-1.png', 4), sized('ok.png', 4), sized('broken-2.png', 4)]);
      await click('Convert 3 images');
      await settle(fixture);
      expect(text()).toContain('1 of 3 converted. 2 failed; see the list below.');
      expect(text()).toContain('Try the 2 failed images again');

      convert.mockClear();
      await click('Try the 2 failed images again');
      await settle(fixture);
      expect(convert.mock.calls.map(([file]) => file.name)).toEqual(['broken-1.png', 'broken-2.png']);
    });

    it('downloads every converted image in one ZIP', async () => {
      const zips: Blob[] = [];
      const names: string[] = [];
      URL.createObjectURL = vi.fn((blob: Blob) => {
        zips.push(blob);
        return 'blob:zip';
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      const { fixture, choose, click } = await setup();
      await choose([sized('photo.png', 4), sized('photo.jpg', 4), sized('broken.png', 4)]);
      await click('JPG');
      await click('Convert 3 images');
      await settle(fixture);
      await click('Download all as ZIP');
      await settle(fixture);

      expect(names).toEqual(['converted-images-jpg.zip']);
      const zip = zips.at(-1)!;
      const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
      // The failed image is left out; the two photo.jpg names are made unique.
      expect(Object.keys(entries)).toEqual(['photo.jpg', 'photo (2).jpg']);
      vi.restoreAllMocks();
    });

    it('keeps the ZIP button off until something is converted', async () => {
      const { el, choose } = await setup();
      await choose([sized('a.png', 4)]);
      const zipButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('ZIP'))!;
      expect(zipButton.disabled).toBe(true);
    });
  });

  describe('settings', () => {
    const sized = (name: string, size: number) => new File(['x'.repeat(size)], name, { type: 'image/png' });
    const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const setRange = (el: HTMLElement, value: number) => {
      const range = el.querySelector<HTMLInputElement>('#quality')!;
      range.value = String(value);
      range.dispatchEvent(new Event('input'));
    };
    const setSelect = (el: HTMLElement, value: string) => {
      const select = el.querySelector<HTMLSelectElement>('#resize')!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };

    it('passes the chosen quality and resize to the encoder', async () => {
      const { fixture, el, choose, click, rows } = await setup();
      await choose([sized('a.png', 10)]);
      setRange(el, 60);
      setSelect(el, '50');
      await fixture.whenStable();
      await click('Convert 1 image');
      await settle(fixture);
      expect(convert).toHaveBeenLastCalledWith(expect.any(File), 'webp', {
        quality: 0.6,
        resize: { mode: 'scale', percent: 50 },
      });
      expect(rows()[0]).toContain('200×100 to 100×50');
    });

    it('uses the max width when chosen', async () => {
      const { fixture, el, choose, click } = await setup();
      await choose([sized('a.png', 10)]);
      setSelect(el, 'width');
      await fixture.whenStable();
      const width = el.querySelector<HTMLInputElement>('input[aria-label="Maximum width in pixels"]')!;
      width.value = '150';
      width.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      await click('Convert 1 image');
      await settle(fixture);
      expect(convert).toHaveBeenLastCalledWith(expect.any(File), 'webp', expect.objectContaining({ resize: { mode: 'width', width: 150 } }));
    });

    it('turns the quality slider off for PNG', async () => {
      const { el, choose, click } = await setup();
      await choose([sized('a.png', 10)]);
      expect(el.querySelector<HTMLInputElement>('#quality')!.disabled).toBe(false);
      await click('PNG');
      expect(el.querySelector<HTMLInputElement>('#quality')!.disabled).toBe(true);
      expect(el.textContent).toContain('Not used for PNG');
    });

    it('marks results out of date when quality or size changes', async () => {
      const { fixture, el, choose, click, text } = await setup();
      await choose([sized('a.png', 10)]);
      await click('Convert 1 image');
      await settle(fixture);
      expect(text()).toContain('All images converted');

      setRange(el, 50);
      await fixture.whenStable();
      expect(text()).toContain('Convert 1 image to WebP');

      await click('Convert 1 image');
      await settle(fixture);
      setSelect(el, '25');
      await fixture.whenStable();
      expect(text()).toContain('Convert 1 image to WebP');
    });

    it('renames finished results when the suffix option changes, without converting again', async () => {
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      const { fixture, el, choose, click, text } = await setup();
      await choose([sized('photo.png', 10)]);
      await click('Convert 1 image');
      await settle(fixture);
      convert.mockClear();

      el.querySelector<HTMLInputElement>('fieldset input[type=checkbox]')!.click();
      await fixture.whenStable();
      expect(text()).toContain('All images converted');
      expect(convert).not.toHaveBeenCalled();

      await click('Download photo-converted.webp');
      expect(names).toEqual(['photo-converted.webp']);
      vi.restoreAllMocks();
    });
  });
});
