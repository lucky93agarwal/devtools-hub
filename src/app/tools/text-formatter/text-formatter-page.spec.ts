import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { TextFormatter } from './text-formatter';

describe('TextFormatter', () => {
  async function setup(path: 'xml-formatter' | 'yaml-validator') {
    TestBed.configureTestingModule({
      providers: [
        { provide: Analytics, useValue: { track: vi.fn(), load: vi.fn(), limitHit: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { routeConfig: { path } } } },
      ],
    });
    TestBed.overrideComponent(TextFormatter, { remove: { imports: [CodeEditor] }, add: { imports: [FakeCodeEditor] } });
    const fixture = TestBed.createComponent(TextFormatter);
    await fixture.whenStable();
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
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!.click();
      await settle();
    };
    return { el, output, inputEditor, text, type, click, settle };
  }

  it('formats XML as you type and minifies on request', async () => {
    const { el, output, text, type, click } = await setup('xml-formatter');
    expect(el.querySelector('h1')?.textContent).toContain('XML Formatter');
    await type('<a><b>1</b></a>');
    expect(output.value).toBe('<a>\n  <b>1</b>\n</a>\n');
    expect(text()).toContain('Valid XML.');
    await click('Minified');
    expect(output.value).toBe('<a><b>1</b></a>');
  });

  it('marks an XML error and jumps to it', async () => {
    const { inputEditor, text, click } = await setup('xml-formatter');
    await click('XML with errors');
    expect(text()).toContain('Line 4,');
    expect(inputEditor.showError).toHaveBeenCalled();
    await click('Go to error');
    expect(inputEditor.revealError).toHaveBeenCalledWith(4, expect.any(Number));
  });

  it('validates YAML with several documents and shows warnings', async () => {
    const { output, text, type, click, inputEditor } = await setup('yaml-validator');
    await type('a: 1\n---\nb:    2\nb: 3\n');
    expect(text()).toContain('Valid YAML. 2 documents.');
    expect(text()).toContain('Warning, line 4:');
    expect(output.value).toContain('---');
    await click('Go to line');
    expect(inputEditor.revealError).toHaveBeenCalledWith(4, 1);
  });

  it('explains a tab in YAML', async () => {
    const { text, click } = await setup('yaml-validator');
    await click('YAML with errors');
    expect(text()).toMatch(/Line 4, column \d+:/);
  });
});
