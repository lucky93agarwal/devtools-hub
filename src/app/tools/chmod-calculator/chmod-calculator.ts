import { Component, computed, signal } from '@angular/core';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { SPECIAL, SPECIAL_BITS, WHAT, WHO, describe, hasBit, parseMode, toOctal, toSymbolic, toSymbolicCommand, toggleBit } from './chmod';
import { CHMOD_CONTENT } from './content';

const PRESETS = [
  { mode: '644', use: 'Files' },
  { mode: '755', use: 'Folders and scripts' },
  { mode: '600', use: 'Private keys, .env' },
  { mode: '700', use: 'Private folders' },
  { mode: '664', use: 'Shared files' },
  { mode: '775', use: 'Shared folders' },
  { mode: '400', use: 'Read-only keys' },
];

@Component({
  selector: 'app-chmod-calculator',
  imports: [Icon, CopyButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Permissions</span>
          <input
            class="field w-48 font-mono text-lg"
            spellcheck="false"
            autocomplete="off"
            placeholder="755 or rwxr-xr-x"
            [value]="text()"
            (input)="onText($any($event.target).value)"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          @for (preset of presets; track preset.mode) {
            <button type="button" class="btn-small" [title]="preset.use" (click)="onText(preset.mode)">{{ preset.mode }}</button>
          }
        </div>
      </div>
      @if (error(); as message) {
        <p class="mt-3 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ message }}</p>
      }

      <div class="mt-6 overflow-x-auto">
        <table class="w-full min-w-96 text-left text-sm">
          <caption class="sr-only">Permissions by user class</caption>
          <thead>
            <tr class="border-b border-line">
              <th scope="col" class="py-2 pr-4 font-semibold"></th>
              @for (what of whatList; track what) {
                <th scope="col" class="px-2 py-2 text-center font-semibold capitalize">{{ what }}</th>
              }
              <th scope="col" class="px-2 py-2 text-center font-semibold">Digit</th>
            </tr>
          </thead>
          <tbody>
            @for (who of whoList; track who; let w = $index) {
              <tr class="border-b border-line">
                <th scope="row" class="py-3 pr-4 font-semibold capitalize">{{ who }}</th>
                @for (what of whatList; track what; let i = $index) {
                  <td class="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      class="size-5 accent-brand"
                      [attr.aria-label]="who + ' ' + what"
                      [checked]="has(w, i)"
                      (change)="toggle(w, i)"
                    />
                  </td>
                }
                <td class="px-2 py-3 text-center font-mono text-lg font-semibold">{{ digit(w) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <fieldset class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <legend class="sr-only">Special bits</legend>
        @for (name of specialList; track name; let i = $index) {
          <label class="flex items-center gap-2">
            <input type="checkbox" class="size-4 accent-brand" [checked]="hasSpecial(i)" (change)="toggleSpecial(i)" />
            {{ name }}
          </label>
        }
      </fieldset>

      <dl class="mt-6 flex flex-col divide-y divide-line rounded-xl border border-line">
        @for (row of outputs(); track row.label) {
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <dt class="w-full shrink-0 sm:w-36 text-sm font-semibold">{{ row.label }}</dt>
            <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
            <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
          </div>
        }
      </dl>

      <ul class="mt-4 flex flex-col gap-1 text-sm" aria-live="polite">
        @for (line of explanation(); track line) {
          <li [class.text-danger]="line.startsWith('Warning')">{{ line }}</li>
        }
      </ul>

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Worked out in your browser.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class ChmodCalculator {
  protected readonly tool = TOOLS.find((t) => t.path === 'chmod-calculator')!;
  protected readonly content = CHMOD_CONTENT;
  protected readonly icons = ICONS;
  protected readonly presets = PRESETS;
  protected readonly whoList = WHO;
  protected readonly whatList = WHAT;
  protected readonly specialList = SPECIAL;

  protected readonly mode = signal(0o755);
  protected readonly text = signal('755');
  protected readonly error = signal<string | null>(null);

  protected readonly outputs = computed(() => {
    const mode = this.mode();
    return [
      { label: 'Number', value: toOctal(mode) },
      { label: 'Symbols', value: toSymbolic(mode) },
      { label: 'Command', value: `chmod ${toOctal(mode)} file` },
      { label: 'Symbolic command', value: `chmod ${toSymbolicCommand(mode)} file` },
    ];
  });
  protected readonly explanation = computed(() => describe(this.mode()));

  protected has(who: number, what: number): boolean {
    return hasBit(this.mode(), who, what);
  }

  protected hasSpecial(index: number): boolean {
    return (this.mode() & SPECIAL_BITS[index]) !== 0;
  }

  protected digit(who: number): number {
    return (this.mode() >> (3 * (2 - who))) & 7;
  }

  protected onText(value: string): void {
    this.text.set(value);
    const result = parseMode(value);
    if (result.ok) this.mode.set(result.mode);
    this.error.set(result.ok ? null : result.error || null);
  }

  protected toggle(who: number, what: number): void {
    this.setMode(toggleBit(this.mode(), who, what));
  }

  protected toggleSpecial(index: number): void {
    this.setMode(this.mode() ^ SPECIAL_BITS[index]);
  }

  private setMode(mode: number): void {
    this.mode.set(mode);
    this.text.set(toOctal(mode));
    this.error.set(null);
  }
}
