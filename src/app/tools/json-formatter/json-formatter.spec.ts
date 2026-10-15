import { Component, input, model } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { JsonFormatter } from './json-formatter';

/** Monaco cannot run in jsdom, so tests use a textarea with the same API. */
@Component({
  selector: 'app-code-editor',
  template: `<textarea [value]="value()" [readOnly]="readOnly()" (input)="onInput($event)"></textarea>`,
})
class FakeCodeEditor {
  readonly value = model('');
  readonly language = input('');
  readonly readOnly = input(false);
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly invalid = input(false);
  readonly showError = vi.fn();
  readonly revealError = vi.fn();
  readonly clearError = vi.fn();

  onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}

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
    return { input, output, inputEditor, status, type, click };
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
    expect(status()).toContain('Paste JSON');
  });
});
