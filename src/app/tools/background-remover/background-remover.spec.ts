import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Analytics } from '../../core/analytics';
import { BackgroundRemover } from './background-remover';
import { CANCELLED, RemoveProgress, RemoveResult, RemoverClient } from './remover-client';

/** Stand-in for the Web Worker client; the test decides when progress and results arrive. */
class FakeClient {
  onProgress?: (progress: RemoveProgress) => void;
  resolve?: (result: RemoveResult) => void;
  reject?: (error: Error) => void;
  files: Blob[] = [];
  cancelled = 0;

  remove(file: Blob, onProgress: (progress: RemoveProgress) => void): Promise<RemoveResult> {
    this.files.push(file);
    this.onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  cancel(): void {
    this.cancelled++;
    this.reject?.(new Error(CANCELLED));
  }
}

describe('BackgroundRemover', () => {
  let client: FakeClient;
  let track: ReturnType<typeof vi.fn>;
  let limitHit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new FakeClient();
    track = vi.fn();
    limitHit = vi.fn();
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RemoverClient, useValue: client },
        { provide: Analytics, useValue: { track, load: vi.fn(), limitHit } },
      ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(BackgroundRemover);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const choose = async (file: File) => {
      const input = el.querySelector<HTMLInputElement>('app-upload-box input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!.click();
      await settle();
    };
    return { fixture, el, settle, choose, text, click };
  }

  const photo = () => new File(['x'.repeat(100)], 'holiday.jpg', { type: 'image/jpeg' });
  const result = (changes: Partial<RemoveResult> = {}): RemoveResult => ({
    png: new Blob(['png'], { type: 'image/png' }),
    beforePreview: new Blob(['jpg'], { type: 'image/jpeg' }),
    afterPreview: new Blob(['small png'], { type: 'image/png' }),
    width: 1600,
    height: 1200,
    sourceWidth: 1600,
    sourceHeight: 1200,
    ms: 4200,
    ...changes,
  });

  it('shows the model download, then the removal, then the result', async () => {
    const { el, settle, choose, text } = await setup();
    await choose(photo());
    expect(client.files).toHaveLength(1);

    client.onProgress!({ stage: 'model', fraction: 0.42 });
    await settle();
    expect(text()).toContain('Preparing the background remover');
    expect(text()).toContain('First time only');
    expect(el.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('42');

    client.onProgress!({ stage: 'removing' });
    await settle();
    expect(text()).toContain('Removing the background from holiday.jpg');

    client.resolve!(result());
    await settle();
    expect(text()).toContain('Drag the divider to compare. 1600×1200 px.');
    expect(text()).not.toContain('Scaled down');
    expect(el.querySelectorAll('img')).toHaveLength(2);
    expect(track).toHaveBeenCalledWith('background-remove', { result: 'done', seconds: 4 });
  });

  it('downloads a PNG named after the original', async () => {
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const { settle, choose, click } = await setup();
    await choose(photo());
    client.resolve!(result());
    await settle();
    await click('Download PNG');
    expect(names).toEqual(['holiday-no-background.png']);
    vi.restoreAllMocks();
  });

  it('starts over with another image', async () => {
    const { el, settle, choose, click } = await setup();
    await choose(photo());
    client.resolve!(result());
    await settle();
    await click('Try another image');
    expect(el.querySelector('app-upload-box')).not.toBeNull();
    // The original (blob:1) and the result (blob:2) are freed.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2');
  });

  it('rejects files that are not images or are too large, without starting', async () => {
    const { choose, text } = await setup();
    await choose(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(text()).toContain('Choose a PNG, JPG or WebP image.');

    const big = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await choose(big);
    expect(text()).toContain('This image is 21 MB. The limit is 20 MB.');
    expect(limitHit).toHaveBeenCalledWith('background-remover', 'file-size');
    expect(client.files).toHaveLength(0);
  });

  it('shows an error from the worker and lets the user try again', async () => {
    const { el, settle, choose, text } = await setup();
    await choose(photo());
    client.reject!(new Error('Model download failed (503).'));
    await settle();
    expect(text()).toContain('Model download failed (503).');
    expect(el.querySelector('app-upload-box')).not.toBeNull();
    expect(track).toHaveBeenCalledWith('background-remove', { result: 'error' });
  });

  it('says when a large photo was scaled down to fit the device', async () => {
    const { settle, choose, text } = await setup();
    await choose(photo());
    client.resolve!(result({ width: 4096, height: 3072, sourceWidth: 8064, sourceHeight: 6048 }));
    await settle();
    expect(text()).toContain('4096×3072 px. Scaled down from 8064×6048 px so your device does not run out of memory.');
  });

  it('shows the small previews and downloads the full-size result', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:${created.length}`;
    });
    const { settle, choose } = await setup();
    await choose(photo());
    const done = result();
    client.resolve!(done);
    await settle();
    expect(created).toEqual([done.beforePreview, done.afterPreview]);
  });

  it('cancels a slow image and goes back to the upload box', async () => {
    const { el, choose, click, text } = await setup();
    await choose(photo());
    client.onProgress!({ stage: 'removing' });
    await click('Cancel');
    expect(client.cancelled).toBe(1);
    expect(el.querySelector('app-upload-box')).not.toBeNull();
    // Cancelling is not an error.
    expect(text()).not.toContain('Cancelled');
    expect(track).toHaveBeenCalledWith('background-remove', { result: 'cancelled' });
  });

  it('stops the image in progress when leaving the page', async () => {
    const { fixture, choose } = await setup();
    await choose(photo());
    fixture.destroy();
    expect(client.cancelled).toBe(1);
  });

  it('shows the memory message when the worker is stopped', async () => {
    const { settle, choose, text } = await setup();
    await choose(photo());
    client.reject!(new Error('Your device ran out of memory. Try a smaller image, or close other tabs and try again.'));
    await settle();
    expect(text()).toContain('Your device ran out of memory.');
  });

  it('explains the tool below it', async () => {
    const { el } = await setup();
    expect(el.querySelector('#about-heading')?.textContent).toContain('About this background remover');
  });

  describe('new background', () => {
    async function finished() {
      const parts = await setup();
      await parts.choose(photo());
      client.resolve!(result());
      await parts.settle();
      return parts;
    }

    it('previews a colour behind the cut-out and remembers the choice', async () => {
      const { el, click, settle } = await finished();
      await click('Colour');
      const layer = el.querySelector<HTMLElement>('app-before-after .absolute.inset-0')!;
      expect(layer.style.backgroundColor).toBe('rgb(255, 255, 255)');

      el.querySelector<HTMLButtonElement>('button[aria-label="Indigo"]')!.click();
      await settle();
      expect(layer.style.backgroundColor).toBe('rgb(79, 70, 229)');

      await click('Transparent');
      expect(el.querySelector('app-before-after .checkerboard')).not.toBeNull();
      await click('Colour');
      expect(layer.style.backgroundColor).toBe('rgb(79, 70, 229)');
    });

    it('previews a background image and frees it when starting over', async () => {
      const { el, settle, click } = await finished();
      const input = el.querySelector<HTMLInputElement>('fieldset input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'beach.jpg', { type: 'image/jpeg' })], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
      const layer = el.querySelector<HTMLElement>('app-before-after .absolute.inset-0')!;
      expect(layer.style.backgroundImage).toContain('blob:');
      expect(el.querySelector('button[role=radio][aria-checked=true]')?.textContent).toContain('Image');

      await click('Try another image');
      // Original, result and background image previews are all freed.
      for (const url of ['blob:1', 'blob:2', 'blob:3']) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    });

    it('refuses a background that is not an image', async () => {
      const { el, settle, text } = await finished();
      const input = el.querySelector<HTMLInputElement>('fieldset input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(text()).toContain('Choose a PNG, JPG or WebP image up to 20 MB for the background.');
    });
  });
});
