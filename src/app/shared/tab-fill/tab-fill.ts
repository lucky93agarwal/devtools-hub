import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Pressing Tab in an empty field accepts its placeholder (the example shown in grey) as the value,
 * then moves on as usual. The value is set with an "input" event, so (input) handlers see it.
 */
@Directive({
  selector: 'input[appTabFill], textarea[appTabFill]',
  host: { '(keydown)': 'onKey($event)' },
})
export class TabFill {
  /** Set to false to switch it off for a field. */
  readonly appTabFill = input<boolean | ''>(true);
  private readonly element = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef).nativeElement;

  protected onKey(e: Event): void {
    const event = e as KeyboardEvent;
    if (event.key !== 'Tab' || event.shiftKey || this.appTabFill() === false) return;
    const field = this.element;
    if (field.value || !field.placeholder) return;
    field.value = field.placeholder;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
