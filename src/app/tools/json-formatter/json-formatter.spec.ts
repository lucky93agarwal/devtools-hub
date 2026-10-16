import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { JsonFormatter } from './json-formatter';
import { JsonRunner } from './json-runner';
import { JsonResult } from './json-tools';
import { FAQ } from './content';
import { Analytics } from '../../core/analytics';

describe('JsonFormatter', () => {
  async function setup() {
    TestBed.overrideComponent(JsonFormatter, {
      remove: { imports: [CodeEditor] },
      add: { imports: [FakeCodeEditor] },
    });
    const fixture = TestBed.createComponent(JsonFormatter);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [input, output] = el.querySelectorAll('textarea');
    const inputEditor = fixture.debugElement.query(By.directive(FakeCodeEditor)).componentInstance as FakeCodeEditor;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').includes(label))!;
    const status = () => el.querySelector('#json-status')!.textContent!.replace(/\s+/g, ' ').trim();

    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const click = async (label: string) => {
      button(label).click();
      await fixture.whenStable();
    };
    const upload = async (file: File) => {
      const fileInput = el.querySelector<HTMLInputElement>('input[type=file]')!;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    return { el, input, output, inputEditor, status, type, click, button, upload, settle };
  }

  describe('indent', () => {
    it('formats with the chosen indent', async () => {
      const { output, type, click } = await setup();
      await type('{"a":1}');
      await click('4 spaces');
      await click('Format');
      expect(output.value).toBe('{\n    "a": 1\n}');
    });

    it('re-formats right away when the indent changes', async () => {
      const { output, type, click, button } = await setup();
      await type('{"a":1}');
      await click('Format');
      await click('Tab');
      expect(output.value).toBe('{\n\t"a": 1\n}');
      expect(button('Tab').getAttribute('aria-checked')).toBe('true');
    });

    it('does not turn minified output back into formatted output', async () => {
      const { output, type, click } = await setup();
      await type('{"a":1}');
      await click('Minify');
      await click('4 spaces');
      expect(output.value).toBe('{"a":1}');
    });
  });

  describe('samples', () => {
    it('loads and formats the valid sample', async () => {
      const { input, output, status, click } = await setup();
      await click('Valid JSON');
      expect(input.value).toContain('DevTools Hub');
      expect(output.value.split('\n').length).toBeGreaterThan(5);
      expect(status()).toContain('Valid JSON. Formatted');
    });

    it('loads the broken sample and points at the first error', async () => {
      const { inputEditor, status, click } = await setup();
      await click('JSON with errors');
      expect(status()).toContain(`Line 4, column 3: Missing comma.`);
      expect(inputEditor.showError).toHaveBeenLastCalledWith(4, 3, `Missing comma. Add ',' before '"'.`);
    });
  });

  describe('file upload', () => {
    it('reads the file and formats it', async () => {
      const { input, output, status, upload } = await setup();
      await upload(new File(['{"id":7}'], 'order.json', { type: 'application/json' }));
      expect(input.value).toBe('{"id":7}');
      expect(output.value).toBe('{\n  "id": 7\n}');
      expect(status()).toContain('Valid JSON');
    });

    it('rejects files over the size limit', async () => {
      const { input, status, upload } = await setup();
      const file = new File(['{}'], 'huge.json');
      Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });
      await upload(file);
      expect(input.value).toBe('');
      expect(status()).toBe('huge.json is 21 MB. The limit is 20 MB.');
    });
  });

  describe('copy and download', () => {
    afterEach(() => vi.restoreAllMocks());

    it('disables both until there is output', async () => {
      const { button } = await setup();
      expect(button('Copy').disabled).toBe(true);
      expect(button('Download').disabled).toBe(true);
    });

    it('copies the output and confirms', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { type, click, button } = await setup();
      await type('[1,2]');
      await click('Minify');
      await click('Copy');
      expect(writeText).toHaveBeenCalledWith('[1,2]');
      expect(button('Copied')).toBeTruthy();
    });

    it('says so when the clipboard is blocked', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
        configurable: true,
      });
      const { type, click, button } = await setup();
      await type('[1]');
      await click('Format');
      await click('Copy');
      expect(button('Copy failed')).toBeTruthy();
    });

    it('downloads with a name based on the uploaded file', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      const { click, upload } = await setup();
      await upload(new File(['{"id":7}'], 'order.json'));
      await click('Download');
      await click('Minify');
      await click('Download');
      expect(names).toEqual(['order.formatted.json', 'order.min.json']);
    });
  });

  it('starts in the empty state', async () => {
    const { status } = await setup();
    expect(status()).toContain('Try a sample');
  });

  it('formats valid JSON', async () => {
    const { output, status, type, click } = await setup();
    await type('{"a":[1,2]}');
    await click('Format');
    expect(output.value).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(status()).toBe('Valid JSON. Formatted, 6 lines.');
  });

  it('minifies valid JSON', async () => {
    const { output, status, type, click } = await setup();
    await type('{\n  "a": 1\n}');
    await click('Minify');
    expect(output.value).toBe('{"a":1}');
    expect(status()).toBe('Valid JSON. Minified, 1 line.');
  });

  it('marks broken JSON in the editor and clears the output', async () => {
    const { output, inputEditor, status, type, click } = await setup();
    await type('{"a":1}');
    await click('Format');
    await type('{\n  "a": 1,\n}');
    await click('Format');
    expect(output.value).toBe('');
    expect(status()).toContain('Line 3, column 1: Trailing comma is not allowed before }.');
    expect(inputEditor.showError).toHaveBeenLastCalledWith(3, 1, 'Trailing comma is not allowed before }.');
  });

  it('jumps to the error line when the error is clicked', async () => {
    const { inputEditor, type, click } = await setup();
    await type('[\n  1,\n  2,\n]');
    await click('Format');
    await click('Go to error');
    expect(inputEditor.revealError).toHaveBeenCalledWith(4, 1);
  });

  it('removes the error mark when the input changes', async () => {
    const { inputEditor, status, type, click } = await setup();
    await type('[1,]');
    await click('Format');
    inputEditor.clearError.mockClear();
    await type('[1]');
    expect(inputEditor.clearError).toHaveBeenCalled();
    expect(status()).toContain('Ready');
  });

  it('clears everything', async () => {
    const { input, output, status, type, click } = await setup();
    await type('[1]');
    await click('Format');
    await click('Clear');
    expect(input.value).toBe('');
    expect(output.value).toBe('');
    expect(status()).toContain('Try a sample');
  });

  describe('working state', () => {
    let resolveJob: (result: JsonResult) => void;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: JsonRunner,
            useValue: { run: () => new Promise<JsonResult>((resolve) => (resolveJob = resolve)) },
          },
        ],
      });
    });

    it('shows progress and disables the actions while a job runs', async () => {
      const { output, status, type, click, button, settle } = await setup();
      await type('[1]');
      await click('Format');
      expect(status()).toContain('Formatting');
      expect(button('Format').disabled).toBe(true);
      expect(button('Minify').disabled).toBe(true);

      resolveJob({ ok: true, output: '[\n  1\n]' });
      await settle();
      expect(output.value).toBe('[\n  1\n]');
      expect(status()).toContain('Valid JSON. Formatted');
      expect(button('Format').disabled).toBe(false);
    });

    it('ignores a result for text that changed while the job ran', async () => {
      const { output, status, type, click, settle } = await setup();
      await type('[1]');
      await click('Format');
      await type('[1, 2]');

      resolveJob({ ok: true, output: 'stale' });
      await settle();
      expect(output.value).toBe('');
      expect(status()).toContain('Ready');
    });
  });

  it('explains the tool and answers common questions below it', async () => {
    const { el } = await setup();
    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual([
      'About this JSON formatter',
      'How to use it',
      'Common JSON errors',
      'Frequently asked questions',
    ]);
    expect(el.querySelectorAll('details')).toHaveLength(FAQ.length);
  });

  it('reports what was done without any of the JSON', async () => {
    const track = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: Analytics, useValue: { track, load: vi.fn() } }] });
    const { type, click } = await setup();
    await type('{"secret":"do-not-send"}');
    await click('Format');
    await type('{"secret":');
    await click('Minify');
    expect(track.mock.calls).toEqual([
      ['json-format', { result: 'valid', size: 'under 10 KB' }],
      ['json-minify', { result: 'invalid', size: 'under 10 KB' }],
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain('do-not-send');
  });
});
