import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { EXTRA_ADS, SITE_NAME } from '../../core/app-config';
import { ICONS, Icon } from '../icon/icon';

/** Side ads show from this screen width, where the page leaves room beside it. */
const WIDE_SCREEN_PX = 1600;

/** Where the popup remembers when it last opened. */
const LAST_POPUP_KEY = 'popup-ad-last';

export interface PopupConfig {
  enabled: boolean;
  afterClicks: number;
  everyMinutes: number;
}

/** True when the popup may open now, given the clicks so far and when it last opened. */
export function popupDue(clicks: number, lastShown: number, now: number, config: PopupConfig = EXTRA_ADS.popup): boolean {
  return config.enabled && clicks >= config.afterClicks && now - lastShown >= config.everyMinutes * 60_000;
}

/** The page for one Adsterra banner, run in its own frame so several banners never clash. */
export function bannerDocument(key: string, width: number, height: number): string {
  const options = JSON.stringify({ key, format: 'iframe', height, width, params: {} });
  return (
    `<!doctype html><html><body style="margin:0">` +
    `<script>atOptions = ${options};</script>` +
    `<script src="https://www.highperformanceformat.com/${encodeURIComponent(key)}/invoke.js"></script>` +
    `</body></html>`
  );
}

/** One banner ad: the network's ad when a key is set, otherwise our own "Advertise here" card. */
@Component({
  selector: 'app-extra-ad',
  template: `
    @if (key()) {
      <iframe
        title="Advertisement"
        class="block border-0"
        [width]="width()"
        [height]="height()"
        [attr.srcdoc]="srcdoc()"
        scrolling="no"
        loading="lazy"
      ></iframe>
    } @else {
      <a
        href="/contact"
        class="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-4 text-center no-underline hover:border-brand"
        [style.width.px]="width()"
        [style.height.px]="height()"
      >
        <span class="font-heading text-lg leading-6 font-semibold text-ink">Your ad here</span>
        <span class="text-sm text-muted">Reach thousands of developers on {{ siteName }}.</span>
        <span class="btn-small">Advertise with us</span>
      </a>
    }
  `,
})
export class ExtraAd {
  readonly key = input('');
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  protected readonly siteName = SITE_NAME;
  protected readonly srcdoc = computed(() => bannerDocument(this.key(), this.width(), this.height()));
}

/**
 * Tall ads in the empty space left and right of the page, only on screens wide
 * enough to have that space, and a popup ad that opens now and then after clicks.
 * Nothing is rendered on the server, so prerendered pages stay ad-free.
 */
@Component({
  selector: 'app-extra-ads',
  imports: [ExtraAd, Icon],
  template: `
    @if (ready()) {
      @for (side of wide() ? sides : []; track side) {
        <aside
          class="fixed top-24 z-10 flex flex-col gap-1"
          [class]="side === 'left' ? 'left-4' : 'right-4'"
          aria-label="Advertisement"
        >
          <span class="text-xs leading-4 text-muted">Advertisement</span>
          <app-extra-ad [key]="railKey" [width]="160" [height]="600" />
        </aside>
      }

      <dialog
        #popup
        class="m-auto rounded-2xl border border-line bg-page p-4 text-ink shadow-xl backdrop:bg-black/50"
        aria-label="Advertisement"
        (close)="open.set(false)"
        (click)="closeOnBackdrop($event)"
      >
        @if (open()) {
          <div class="flex items-center justify-between gap-4 pb-2">
            <span class="text-xs leading-4 text-muted">Advertisement</span>
            <button type="button" class="btn-small" data-tip="Close" aria-label="Close ad" (click)="close()">
              <app-icon [path]="icons.close" [size]="16" />
            </button>
          </div>
          <app-extra-ad [key]="popupKey" [width]="300" [height]="250" />
        }
      </dialog>
    }
  `,
})
export class ExtraAds {
  protected readonly sides = ['left', 'right'] as const;
  protected railKey: string = EXTRA_ADS.railKey;
  protected popupKey: string = EXTRA_ADS.popupKey;
  protected readonly icons = ICONS;
  protected readonly ready = signal(false);
  protected readonly open = signal(false);
  /** True while the screen is wide enough for the side ads, so narrow screens never load them. */
  protected readonly wide = signal(false);
  private readonly popup = viewChild<ElementRef<HTMLDialogElement>>('popup');
  private readonly document = inject(DOCUMENT);
  private clicks = 0;

  constructor() {
    const onClick = (event: MouseEvent) => this.onPageClick(event);
    let query: MediaQueryList | undefined;
    const onResize = () => this.wide.set(!!query?.matches);
    afterNextRender(() => {
      const view = this.document.defaultView;
      // Automated browsers (tests, crawlers) get our own cards instead of network ads.
      if (view?.navigator.webdriver) this.railKey = this.popupKey = '';
      query = view?.matchMedia?.(`(min-width: ${WIDE_SCREEN_PX}px)`);
      query?.addEventListener('change', onResize);
      onResize();
      this.ready.set(true);
      this.document.addEventListener('click', onClick);
    });
    inject(DestroyRef).onDestroy(() => {
      query?.removeEventListener('change', onResize);
      this.document.removeEventListener('click', onClick);
    });
  }

  protected close(): void {
    this.popup()?.nativeElement.close();
  }

  /** A click on the dark area around the popup closes it. */
  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.popup()?.nativeElement) this.close();
  }

  private onPageClick(event: MouseEvent): void {
    const dialog = this.popup()?.nativeElement;
    if (!dialog || this.open() || dialog.contains(event.target as Node)) return;
    // Automated browsers (tests, crawlers) never get the popup.
    if (this.document.defaultView?.navigator.webdriver) return;
    this.clicks++;
    const now = Date.now();
    if (!popupDue(this.clicks, this.lastShown(), now)) return;
    this.clicks = 0;
    this.remember(now);
    // Open after the click has done its own job, so the popup never blocks it.
    setTimeout(() => {
      if (typeof dialog.showModal !== 'function') return;
      this.open.set(true);
      dialog.showModal();
    }, 300);
  }

  private lastShown(): number {
    try {
      return Number(this.document.defaultView?.localStorage.getItem(LAST_POPUP_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private remember(time: number): void {
    try {
      this.document.defaultView?.localStorage.setItem(LAST_POPUP_KEY, String(time));
    } catch {
      // Storage blocked: the popup can then open again after the next few clicks.
    }
  }
}
