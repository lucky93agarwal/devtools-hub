import { TestBed } from '@angular/core/testing';
import { UploadBox } from './upload-box';

function fileList(files: File[]): FileList {
  return Object.assign([...files], { item: (i: number) => files[i] }) as unknown as FileList;
}

function drop(target: HTMLElement, files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: fileList(files) } });
  target.dispatchEvent(event);
}

describe('UploadBox', () => {
  const png = new File(['a'], 'a.png', { type: 'image/png' });
  const jpg = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
  const txt = new File(['c'], 'c.txt', { type: 'text/plain' });

  async function setup(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(UploadBox);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    const emitted: File[][] = [];
    fixture.componentInstance.filesSelected.subscribe((files) => emitted.push(files));
    await fixture.whenStable();
    const zone = (fixture.nativeElement as HTMLElement).querySelector('div')!;
    return { fixture, emitted, zone };
  }

  it('emits only accepted files on drop', async () => {
    const { emitted, zone } = await setup({ accept: 'image/*', multiple: true });
    drop(zone, [png, txt, jpg]);
    expect(emitted).toEqual([[png, jpg]]);
  });

  it('keeps one file when multiple is off', async () => {
    const { emitted, zone } = await setup({ accept: 'image/*' });
    drop(zone, [png, jpg]);
    expect(emitted).toEqual([[png]]);
  });

  it('accepts files by extension', async () => {
    const { emitted, zone } = await setup({ accept: '.txt', multiple: true });
    drop(zone, [png, txt]);
    expect(emitted).toEqual([[txt]]);
  });

  it('ignores drops when disabled or when nothing matches', async () => {
    const { fixture, emitted, zone } = await setup({ accept: 'image/*', disabled: true });
    drop(zone, [png]);
    fixture.componentRef.setInput('disabled', false);
    drop(zone, [txt]);
    expect(emitted).toEqual([]);
  });
});
