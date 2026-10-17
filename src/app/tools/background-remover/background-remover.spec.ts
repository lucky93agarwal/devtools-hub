import { TestBed } from '@angular/core/testing';
import { Analytics } from '../../core/analytics';
import { BackgroundRemover } from './background-remover';
import { RemoveProgress, RemoveResult, RemoverClient } from './remover-client';

/** Stand-in for the Web Worker client; the test decides when progress and results arrive. */
class FakeClient {
  onProgress?: (progress: RemoveProgress) => void;
  resolve?: (result: RemoveResult) => void;
  reject?: (error: Error) => void;
  files: Blob[] = [];

  remove(file: Blob, onProgress: (progress: RemoveProgress) => void): Promise<RemoveResult> {
    this.files.push(file);
    this.onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

describe('BackgroundRemover', () => {
  let client: FakeClient;
  let track: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new FakeClient();
    track = vi.fn();
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: RemoverClient, useValue: client },
        { provide: Analytics, useValue: { track, load: vi.fn() } },
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
  const result = (): RemoveResult => ({ png: new Blob(['png'], { type: 'image/png' }), width: 1600, height: 1200, ms: 4200 });

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
    expect(text()).toContain('After · 1600×1200');
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
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('rejects files that are not images or are too large, without starting', async () => {
    const { choose, text } = await setup();
    await choose(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(text()).toContain('Choose a PNG, JPG or WebP image.');

    const big = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await choose(big);
    expect(text()).toContain('This image is 21 MB. The limit is 20 MB.');
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

  it('explains the tool below it', async () => {
    const { el } = await setup();
    expect(el.querySelector('#about-heading')?.textContent).toContain('About this background remover');
  });
});
