import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Analytics } from '../../core/analytics';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { FakeCodeEditor } from '../../../testing/fake-editors';
import { JsonToCode } from './json-to-code';

describe('JsonToCode', () => {
  let track: ReturnType<typeof vi.fn>;

  async function setup(query: Record<string, string> = {}) {
    track = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Analytics, useValue: { track, load: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    TestBed.overrideComponent(JsonToCode, { remove: { imports: [CodeEditor] }, add: { imports: [FakeCodeEditor] } });
    const fixture = TestBed.createComponent(JsonToCode);
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
      // Past the typing pause.
      await settle(300);
    };
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!.click();
      await settle();
    };
    const select = async (selector: string, value: string) => {
      const element = el.querySelector<HTMLSelectElement>(selector)!;
      element.value = value;
      element.dispatchEvent(new Event('change'));
      await settle();
    };
    return { fixture, el, input, output, inputEditor, text, type, click, select, settle };
  }

  it('writes Kotlin Serialization classes as you type', async () => {
    const { output, text, type } = await setup();
    await type('{"user_name": "Ada", "address": {"city": "Pune"}}');
    expect(output.value).toContain('@Serializable\ndata class Root(');
    expect(output.value).toContain('@SerialName("user_name") val userName: String,');
    expect(text()).toContain('Kotlin Serialization: 2 classes.');
  });

  it('switches the output and its settings, and keeps the choice in the address', async () => {
    const { fixture, el, output, type, select } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await type('{"id": 1}');
    await select('select', 'typescript-interface');
    expect(output.value).toBe('export interface Root {\n  id: number;\n}\n');
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { to: 'typescript-interface' }, replaceUrl: true });

    // The TypeScript settings are shown; switching to type changes the code.
    const declaration = el.querySelectorAll('select')[1];
    declaration.value = 'type';
    declaration.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(output.value).toBe('export type Root = {\n  id: number;\n};\n');
  });

  it('opens with the output named in the address', async () => {
    const { output, type } = await setup({ to: 'jackson' });
    await type('{"id": 1}');
    expect(output.value).toContain('@JsonProperty("id")');
  });

  it('uses the root class name, made valid', async () => {
    const { el, output, type, settle, click } = await setup();
    await type('{"id": 1}');
    const name = el.querySelector<HTMLInputElement>('input[type=text]')!;
    name.value = 'user profile';
    name.dispatchEvent(new Event('input'));
    await settle();
    expect(output.value).toContain('data class UserProfile(');
    expect(el.textContent).toContain('UserProfile.kt');
    await click('Clear');
    expect(output.value).toBe('');
  });

  it('marks a JSON error in the input and jumps to it', async () => {
    const { inputEditor, output, text, type, click } = await setup();
    await type('{"a": 1,}');
    expect(output.value).toBe('');
    expect(text()).toContain('Line 1, column 9:');
    expect(inputEditor.showError).toHaveBeenCalledWith(1, 9, expect.any(String));
    await click('Go to error');
    expect(inputEditor.revealError).toHaveBeenCalledWith(1, 9);
  });

  it('explains JSON with no objects in it', async () => {
    const { text, type } = await setup();
    await type('[1, 2, 3]');
    expect(text()).toContain('Classes are made from objects.');
  });

  it('loads the sample right away', async () => {
    const { output, click } = await setup();
    await click('Sample JSON');
    expect(output.value).toContain('data class Order(');
    expect(track).toHaveBeenCalledWith('json-to-code-sample', { target: 'kotlin-serialization' });
  });
});
