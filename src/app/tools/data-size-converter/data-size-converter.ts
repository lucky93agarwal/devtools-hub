import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { allUnits, formatDuration, parseSize, toBytes, transferSeconds } from './data-size';

const CONTENT: ToolContent = {
  aboutHeading: 'About this data size converter',
  about:
    'Is a 500 MB upload limit 500 MiB? How long does a 2 GB build take to download on a 50 Mbps line? Convert any size ' +
    'between bits, bytes and the decimal (kB, MB, GB, TB) and binary (KiB, MiB, GiB, TiB) units, and see how long a ' +
    'transfer takes at common connection speeds or your own.',
  steps: ['Type a size such as 1.5 GB, 700 MiB or 100 Mb.', 'Read it in every unit.', 'Check the transfer times, or enter your own connection speed in Mbps.'],
  faq: [
    { question: 'What is the difference between MB and MiB?', answer: 'MB (megabyte) is 1,000,000 bytes. MiB (mebibyte) is 1,048,576 bytes. Disk makers use MB; Windows and many tools show MiB but call it MB.' },
    { question: 'Why is my download slower than my plan?', answer: 'Plans are sold in megabits per second (Mbps). Divide by 8 for megabytes per second: 100 Mbps is at most 12.5 MB/s, before overheads.' },
    { question: 'Is a small b different from a big B?', answer: 'Yes: b is a bit and B is a byte (8 bits). 100 Mb is 12.5 MB.' },
  ],
};

@Component({
  selector: 'app-data-size-converter',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="data-size-converter" [content]="content">
      <label for="size-input" class="text-sm leading-5 font-semibold">Size</label>
      <input id="size-input" class="field mt-2 w-full max-w-sm font-mono text-lg" spellcheck="false" placeholder="1.5 GB" [value]="text()" (input)="text.set($any($event.target).value)" />
      @if (!bytes() && text().trim()) {
        <p class="mt-2 text-sm text-danger">Write a size such as 1.5 GB, 700 MiB or 100 Mb.</p>
      }
      @if (bytes()) {
        <dl class="mt-6 grid gap-2 sm:grid-cols-2" aria-live="polite">
          @for (u of units(); track u.id) {
            <div class="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-2">
              <div><dt class="text-xs text-muted">{{ u.label }}</dt><dd class="font-mono">{{ u.value }}</dd></div>
              <app-copy-button [text]="u.value" [ariaLabel]="'Copy ' + u.label" label="" />
            </div>
          }
        </dl>
        <h2 class="mt-8 text-xl leading-7">Transfer time</h2>
        <table class="mt-3 w-full max-w-md text-left text-sm">
          <tbody>
            @for (s of speeds; track s) {
              <tr class="border-b border-line"><td class="py-2">{{ s }} Mbps</td><td class="py-2 font-mono">{{ time(s) }}</td></tr>
            }
            <tr>
              <td class="py-2"><label class="flex items-center gap-2">Your speed <input type="number" min="0" class="field w-24 py-1" aria-label="Your speed in Mbps" [value]="speed()" (input)="speed.set($any($event.target).valueAsNumber || 0)" /> Mbps</label></td>
              <td class="py-2 font-mono">{{ time(speed()) }}</td>
            </tr>
          </tbody>
        </table>
      }
    </app-tool-page>
  `,
})
export class DataSizeConverter {
  protected readonly content = CONTENT;
  protected readonly speeds = [10, 50, 100, 1000];
  protected readonly text = signal('1.5 GB');
  protected readonly speed = signal(40);
  protected readonly bytes = computed(() => {
    const parsed = parseSize(this.text());
    return parsed ? toBytes(parsed.value, parsed.unit) : 0;
  });
  protected readonly units = computed(() => allUnits(this.bytes()));

  protected time(mbps: number): string {
    return formatDuration(transferSeconds(this.bytes(), mbps));
  }
}
