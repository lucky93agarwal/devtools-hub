import { TestBed } from '@angular/core/testing';
import { JsonFormatter } from './json-formatter';

describe('JsonFormatter', () => {
  async function setup() {
    const fixture = TestBed.createComponent(JsonFormatter);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLTextAreaElement>('#json-input')!;
    const output = el.querySelector<HTMLTextAreaElement>('#json-output')!;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
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
    return { input, output, status, type, click, button };
  }

  it('starts in the empty state', async () => {
    const { status } = await setup();
    expect(status()).toContain('Paste JSON');
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

  it('shows line and column for broken JSON and clears the output', async () => {
    const { input, output, status, type, click } = await setup();
    await type('{"a":1}');
    await click('Format');
    await type('{\n  "a": 1,\n}');
    await click('Format');
    expect(output.value).toBe('');
    expect(status()).toContain('Line 3, column 1: Trailing comma is not allowed before }.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('selects the error position on Go to error', async () => {
    const { input, type, click } = await setup();
    await type('[1, 2, ]');
    await click('Format');
    await click('Go to error');
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(8);
  });

  it('clears everything', async () => {
    const { input, output, status, type, click } = await setup();
    await type('[1]');
    await click('Format');
    await click('Clear');
    expect(input.value).toBe('');
    expect(output.value).toBe('');
    expect(status()).toContain('Paste JSON');
  });
});
