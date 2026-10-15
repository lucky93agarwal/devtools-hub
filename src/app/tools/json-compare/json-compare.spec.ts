import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { DiffViewer, countLineChanges } from '../../shared/code-editor/diff-viewer';
import { FakeCodeEditor, FakeDiffViewer } from '../../../testing/fake-editors';
import { COMPARE_SAMPLES, describeStats } from './compare-tools';
import { JsonCompare } from './json-compare';

describe('countLineChanges', () => {
  it('sorts Monaco line changes into added, removed and changed lines', () => {
    const change = (os: number, oe: number, ms: number, me: number) => ({
      originalStartLineNumber: os,
      originalEndLineNumber: oe,
      modifiedStartLineNumber: ms,
      modifiedEndLineNumber: me,
      charChanges: undefined,
    });
    expect(
      countLineChanges([
        change(3, 3, 3, 3), // one line changed
        change(7, 7, 7, 8), // one line changed, one added: counted as two changed
        change(9, 0, 10, 11), // two lines added
        change(13, 14, 15, 0), // two lines removed
      ]),
    ).toEqual({ places: 4, changed: 3, added: 2, removed: 2 });
  });
});

describe('describeStats', () => {
  it('summarises in plain words', () => {
    expect(describeStats({ places: 1, changed: 1, added: 0, removed: 0 })).toBe('1 place (1 line changed)');
    expect(describeStats({ places: 3, changed: 2, added: 1, removed: 4 })).toBe(
      '3 places (2 lines changed, 1 line added, 4 lines removed)',
    );
  });
});

describe('JsonCompare', () => {
  async function setup() {
    TestBed.overrideComponent(JsonCompare, {
      remove: { imports: [CodeEditor, DiffViewer] },
      add: { imports: [FakeCodeEditor, FakeDiffViewer] },
    });
    const fixture = TestBed.createComponent(JsonCompare);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [originalBox, changedBox] = el.querySelectorAll('textarea');
    const editors = fixture.debugElement
      .queryAll(By.directive(FakeCodeEditor))
      .map((d) => d.componentInstance as FakeCodeEditor);
    const diff = () => fixture.debugElement.query(By.directive(FakeDiffViewer))?.componentInstance as
      | FakeDiffViewer
      | undefined;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').includes(label))!;
    const status = () => el.querySelector('#compare-status')!.textContent!.replace(/\s+/g, ' ').trim();
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const type = async (box: HTMLTextAreaElement, text: string) => {
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const click = async (label: string) => {
      button(label).click();
      await settle();
    };
    return { el, originalBox, changedBox, editors, diff, status, type, click, settle, button };
  }

  it('starts empty with a sample offer', async () => {
    const { status, diff } = await setup();
    expect(status()).toContain('try a sample');
    expect(diff()).toBeUndefined();
  });

  it('formats both sides the same way and shows the diff', async () => {
    const { originalBox, changedBox, diff, type, click } = await setup();
    await type(originalBox, '{"a":1,"b":[1,2]}');
    await type(changedBox, '{\n"a": 2, "b": [1, 2]}');
    await click('Compare');
    expect(diff()?.original()).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(diff()?.modified()).toBe('{\n  "a": 2,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it('summarises the differences the diff viewer reports', async () => {
    const { diff, status, click, settle } = await setup();
    await click('Two sample files');
    expect(status()).toBe('Differences found.');
    diff()!.diffUpdated.emit({ places: 4, changed: 4, added: 1, removed: 0 });
    await settle();
    expect(status()).toBe('Differences found in 4 places (4 lines changed, 1 line added).');
  });

  it('says when the documents have the same content despite different spacing', async () => {
    const { originalBox, changedBox, status, type, click } = await setup();
    await type(originalBox, '{"a": [1, 2]}');
    await type(changedBox, '{\n  "a": [1,2]\n}');
    await click('Compare');
    expect(status()).toBe('No differences. Both JSON documents have the same content.');
  });

  it('reports errors on each side and jumps to them', async () => {
    const { originalBox, changedBox, editors, diff, status, type, click } = await setup();
    await type(originalBox, '[1,]');
    await type(changedBox, '{"a" 1}');
    await click('Compare');
    expect(status()).toContain('Original JSON, line 1, column 4: Trailing comma');
    expect(status()).toContain(`Changed JSON, line 1, column 6: Expected ':'`);
    expect(editors[0].showError).toHaveBeenCalledWith(1, 4, 'Trailing comma is not allowed before ].');
    expect(editors[1].showError).toHaveBeenCalledWith(1, 6, `Expected ':' after the property name, found '1'.`);
    expect(diff()).toBeUndefined();

    await click('Changed JSON');
    expect(editors[1].revealError).toHaveBeenCalledWith(1, 6);
  });

  it('asks for both documents', async () => {
    const { originalBox, status, type, click } = await setup();
    await type(originalBox, '{}');
    await click('Compare');
    expect(status()).toContain('Changed JSON, line 1, column 1: Paste some JSON first.');
  });

  it('hides an outdated diff when an input changes', async () => {
    const { originalBox, diff, status, type, click } = await setup();
    await click('Two sample files');
    expect(diff()).toBeDefined();
    await type(originalBox, '{"x":1}');
    expect(diff()).toBeUndefined();
    expect(status()).toContain('Ready');
  });

  it('swaps the sides and compares again', async () => {
    const { originalBox, changedBox, diff, click } = await setup();
    await click('Two sample files');
    await click('Swap sides');
    expect(originalBox.value).toBe(COMPARE_SAMPLES.changed);
    expect(changedBox.value).toBe(COMPARE_SAMPLES.original);
    expect(diff()?.original()).toContain('"version": 2');
  });

  it('clears both sides', async () => {
    const { originalBox, changedBox, status, click } = await setup();
    await click('Two sample files');
    await click('Clear');
    expect(originalBox.value).toBe('');
    expect(changedBox.value).toBe('');
    expect(status()).toContain('try a sample');
  });
});
