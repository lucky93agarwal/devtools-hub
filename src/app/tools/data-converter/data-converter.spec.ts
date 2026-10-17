import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { DataConverter } from './data-converter';

describe('DataConverter', () => {
  async function setup(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Analytics, useValue: { track: vi.fn(), load: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    TestBed.overrideComponent(DataConverter, { remove: { imports: [CodeEditor] }, add: { imports: [FakeCodeEditor] } });
    const fixture = TestBed.createComponent(DataConverter);
    await fixture.whenStable();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const el = fixture.nativeElement as HTMLElement;
    const [input, output] = el.querySelectorAll('textarea');
    const inputEditor = fixture.debugElement.query(By.directive(FakeCodeEditor)).componentInstance as FakeCodeEditor;
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const settle = async (ms = 0) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await fixture.whenStable();
    };
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle(300);
    };
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label) || b.ariaLabel?.includes(label))!.click();
      await settle();
    };
    const choose = async (index: number, value: string) => {
      const select = el.querySelectorAll('select')[index];
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    return { el, input, output, inputEditor, text, type, click, choose, settle };
  }

  it('converts JSON to YAML as you type', async () => {
    const { output, text, type } = await setup();
    await type('{"a": 1, "b": [true]}');
    expect(output.value).toBe('a: 1\nb:\n  - true\n');
    expect(text()).toContain('Converted JSON to YAML.');
    expect(text()).toContain('data.yaml');
  });

  it('opens with the formats in the address and converts XML to JSON', async () => {
    const { output, type } = await setup({ from: 'xml', to: 'json' });
    await type('<book id="1"><title>A</title></book>');
    expect(JSON.parse(output.value)).toEqual({ book: { '@id': 1, title: 'A' } });
  });

  it('swaps direction and converts the result back', async () => {
    const { input, output, type, click } = await setup();
    await type('{"a": 1}');
    await click('Swap');
    expect(input.value).toBe('a: 1\n');
    expect(output.value).toBe('{\n  "a": 1\n}\n');
  });

  it('never has the same format on both sides', async () => {
    const { el, choose } = await setup();
    await choose(1, 'json');
    const [from, to] = el.querySelectorAll('select');
    expect(to.value).toBe('json');
    expect(from.value).toBe('yaml');
  });

  it('marks a mistake in the input and jumps to it', async () => {
    const { inputEditor, text, type, click } = await setup({ from: 'yaml', to: 'json' });
    await type('a: [1, 2\nb: 3\n');
    expect(text()).toContain('Line ');
    expect(inputEditor.showError).toHaveBeenCalled();
    await click('Go to error');
    expect(inputEditor.revealError).toHaveBeenCalled();
  });

  it('shows the settings for the chosen output and uses them', async () => {
    const { el, output, type, settle } = await setup({ from: 'json', to: 'csv' });
    await type('[{"a": 1, "b": 2}]');
    const delimiter = el.querySelectorAll('select')[2];
    delimiter.value = ';';
    delimiter.dispatchEvent(new Event('change'));
    await settle();
    expect(output.value).toBe('a;b\n1;2\n');
  });

  it('loads a sample for the chosen input format', async () => {
    const { output, click } = await setup({ from: 'csv', to: 'json' });
    await click('Sample CSV');
    expect(JSON.parse(output.value)[2]).toMatchObject({ name: 'Hopper, Grace', address: { city: 'New York' } });
  });
});
