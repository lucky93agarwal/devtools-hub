import { Component, computed, signal } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { DENSITIES, DEFAULT_SETTINGS, Unit, UnitSettings, convertUnits } from './units';

const CONTENT: ToolContent = {
  aboutHeading: 'About this dp, px and sp converter',
  about:
    'Designs come in pixels, Android layouts use dp and sp, iOS uses points and the web uses CSS pixels and rem. ' +
    'Enter a size in any unit and see it in all the others for a chosen screen density, plus the pixel size at every ' +
    'Android density bucket (mdpi to xxxhdpi) for exporting icons and images. sp follows the user’s font size ' +
    'setting, which you can try with the font scale.',
  steps: [
    'Type a number and choose its unit.',
    'Pick the screen density of the design or device, for example xxhdpi (3x) for most modern Android phones.',
    'Change the font scale to see how sp text grows when a user picks larger text.',
    'Copy the values you need. The table lists pixel sizes for every density.',
  ],
  faq: [
    { question: 'What is the difference between dp and sp?', answer: 'Both are 1/160 of an inch at mdpi. sp also grows with the user’s font size setting, so use sp for text and dp for everything else.' },
    { question: 'Is an iOS point the same as a dp?', answer: 'Practically yes: both are device-independent units, and 1 pt equals 1 dp equals 1 CSS pixel at the same scale.' },
    { question: 'Which density should I export images for?', answer: 'Export at least xxhdpi (3x) and xxxhdpi (4x) for Android, and @2x and @3x for iOS. Prefer vector drawables where you can.' },
  ],
};

@Component({
  selector: 'app-screen-units',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="screen-units" [content]="content">
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Value</span>
          <input type="number" class="field w-32 font-mono text-base" [value]="value()" (input)="value.set($any($event.target).valueAsNumber || 0)" />
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Unit</span>
          <select class="field" [value]="unit()" (change)="unit.set($any($event.target).value)">
            <option value="dp">dp (Android)</option>
            <option value="sp">sp (Android text)</option>
            <option value="px">device px</option>
            <option value="pt">pt (iOS)</option>
            <option value="rem">rem (web)</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Screen density</span>
          <select class="field" [value]="settings().scale" (change)="set('scale', +$any($event.target).value)">
            @for (d of densities; track d.id) {
              <option [value]="d.scale" [selected]="d.scale === settings().scale">{{ d.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Font scale: {{ settings().fontScale }}×</span>
          <input type="range" min="0.85" max="2" step="0.05" class="accent-brand" aria-label="Font scale" [value]="settings().fontScale" (input)="set('fontScale', $any($event.target).valueAsNumber)" />
        </label>
        <label class="flex flex-col gap-1 text-sm leading-5">
          <span class="font-semibold">Root font (px)</span>
          <input type="number" min="1" class="field w-24" [value]="settings().rootFontSize" (input)="set('rootFontSize', $any($event.target).valueAsNumber || 16)" />
        </label>
      </div>

      <dl class="mt-6 grid gap-3 sm:grid-cols-3" aria-live="polite">
        @for (row of rows(); track row.label) {
          <div class="card flex items-center justify-between gap-2 p-4">
            <div>
              <dt class="text-xs text-muted">{{ row.label }}</dt>
              <dd class="font-mono text-xl font-semibold">{{ row.value }}</dd>
            </div>
            <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" label="" />
          </div>
        }
      </dl>

      <h2 class="mt-8 text-xl leading-7">Pixels at every Android density</h2>
      <table class="mt-3 w-full max-w-md text-left text-sm">
        <thead><tr class="border-b border-line"><th scope="col" class="py-2 font-semibold">Density</th><th scope="col" class="py-2 font-semibold">Pixels</th></tr></thead>
        <tbody>
          @for (d of result().perDensity; track d.label) {
            <tr class="border-b border-line"><td class="py-2">{{ d.label }}</td><td class="py-2 font-mono">{{ d.px }} px</td></tr>
          }
        </tbody>
      </table>
    </app-tool-page>
  `,
})
export class ScreenUnits {
  protected readonly content = CONTENT;
  protected readonly densities = DENSITIES;
  protected readonly value = signal(48);
  protected readonly unit = signal<Unit>('dp');
  protected readonly settings = signal<UnitSettings>(DEFAULT_SETTINGS);
  protected readonly result = computed(() => convertUnits(this.value(), this.unit(), this.settings()));
  protected readonly rows = computed(() => {
    const r = this.result();
    return [
      { label: 'Device pixels', value: `${r.devicePx}px` },
      { label: 'Android dp', value: `${r.dp}dp` },
      { label: 'Android sp', value: `${r.sp}sp` },
      { label: 'iOS points', value: `${r.pt}pt` },
      { label: 'CSS pixels', value: `${r.cssPx}px` },
      { label: 'CSS rem', value: `${r.rem}rem` },
    ];
  });

  protected set<K extends keyof UnitSettings>(key: K, value: UnitSettings[K]): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
  }
}
