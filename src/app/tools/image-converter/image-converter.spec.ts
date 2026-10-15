import { TestBed } from '@angular/core/testing';
import { unzipSync } from 'fflate';
import { ImageConverter } from './image-converter';
import { ConvertError, ImageEncoder, ImageFormat, outputName } from './image-encoder';

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('outputName', () => {
  it('swaps the extension for the new format', () => {
    expect(outputName('holiday.jpeg', 'webp')).toBe('holiday.webp');
    expect(outputName('logo.final.png', 'jpg')).toBe('logo.final.jpg');
    expect(outputName('scan', 'png')).toBe('scan.png');
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
    // Pretend encoder: output is half the size, in the requested format.
    convert = vi.fn(async (file: File, format: ImageFormat) => {
      if (file.name.startsWith('broken')) throw new ConvertError('This image could not be read. The file may be damaged.');
      return new Blob(['x'.repeat(Math.max(1, Math.floor(file.size / 2)))], { type: `image/${format}` });
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
      expect(rows()[0]).toContain('PNG · 1000 B → JPG · 500 B (50% smaller)');
      expect(rows()[1]).toContain('→ JPG · 200 B (50% smaller)');
    });

    it('uses WebP by default', async () => {
      const { fixture, choose, click } = await setup();
      await choose([sized('a.png', 10)]);
      await click('Convert 1 image to WebP');
      await settle(fixture);
      expect(convert).toHaveBeenCalledWith(expect.any(File), 'webp');
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
          new Promise<Blob>((resolve) => releases.push(() => resolve(new Blob(['y'], { type: `image/${format}` })))),
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
});
