import { Component, input, signal } from '@angular/core';

/**
 * Before/after comparison: the result fills the frame and the original is shown
 * on top up to the divider. A real range input drives it, so it works with a
 * mouse, touch and the arrow keys.
 */
@Component({
  selector: 'app-before-after',
  host: { class: 'block' },
  template: `
    <div
      class="relative overflow-hidden rounded-xl border border-line select-none"
      [style.aspect-ratio]="width() + ' / ' + height()"
    >
      <div
        class="absolute inset-0"
        [class.checkerboard]="!backgroundColour() && !backgroundImage()"
        [style.background-color]="backgroundColour()"
        [style.background-image]="backgroundImage() ? 'url(' + backgroundImage() + ')' : null"
        style="background-size: cover; background-position: center"
      ></div>
      <img [src]="after()" alt="" class="absolute inset-0 size-full object-contain" draggable="false" />
      <img
        [src]="before()"
        alt=""
        class="absolute inset-0 size-full object-contain"
        draggable="false"
        [style.clip-path]="'inset(0 ' + (100 - position()) + '% 0 0)'"
      />
      <div class="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" [style.left.%]="position()">
        <span
          class="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-sm font-bold text-ink shadow"
          aria-hidden="true"
          >&#8596;</span
        >
      </div>
      <span class="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
        Before
      </span>
      <span class="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
        After
      </span>
      <input
        type="range"
        min="0"
        max="100"
        class="absolute inset-0 size-full cursor-ew-resize opacity-0"
        aria-label="Compare before and after"
        [attr.aria-valuetext]="position() + '% before'"
        [value]="position()"
        (input)="position.set($any($event.target).valueAsNumber)"
      />
    </div>
  `,
})
export class BeforeAfter {
  readonly before = input.required<string>();
  readonly after = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** CSS colour behind the result, or null for the transparency checkerboard. */
  readonly backgroundColour = input<string | null>(null);
  /** Object URL of an image behind the result. */
  readonly backgroundImage = input<string | null>(null);

  /** How much of the frame, from the left, shows the original (0 to 100). */
  protected readonly position = signal(50);
}
