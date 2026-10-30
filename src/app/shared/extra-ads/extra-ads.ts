import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { EXTRA_ADS, SITE_NAME } from '../../core/app-config';
import { ICONS, Icon } from '../icon/icon';

/**
 * Side ads show from these screen widths, where the page leaves room beside it:
 * most pages are 960px wide, the home page and API Client 1200px.
 */
const RAIL_MIN_WIDTH = { narrowPage: 1360, widePage: 1600 };
const WIDE_PAGES = ['/', '/api-client'];

/** True when the side ads fit beside this page at this screen width. */
export function railsFit(path: string, screenWidth: number): boolean {
  const page = path.split(/[?#]/)[0] || '/';
  return screenWidth >= (WIDE_PAGES.includes(page) ? RAIL_MIN_WIDTH.widePage : RAIL_MIN_WIDTH.narrowPage);
}

/** Where the popup remembers that it already opened on arrival in this browser session. */
const ARRIVAL_POPUP_KEY = 'popup-ad-arrival';
/** How long after arrival the first popup opens, in ms, so the page shows first. */
const ARRIVAL_DELAY_MS = 2500;
/** How long a banner has to show an ad before our own card takes its place, in ms. */
const FILL_WAIT_MS = 7000;
/** The popup ad is shown up to this many times its real size. */
const POPUP_MAX_SCALE = 2;

export interface PopupConfig {
  enabled: boolean;
  onFirstLoad: boolean;
  everyClicks: number;
}

/** True when the popup should open after this many clicks since it last opened. */
export function popupDue(clicks: number, config: PopupConfig = EXTRA_ADS.popup): boolean {
  return config.enabled && config.everyClicks > 0 && clicks >= config.everyClicks;
}

/** How much to enlarge the 300 x 250 popup ad so it fills more of the screen but still fits. */
export function popupScale(screenWidth: number, screenHeight: number): number {
  const fit = Math.min((screenWidth - 64) / 300, (screenHeight - 140) / 250);
  return Math.max(1, Math.min(POPUP_MAX_SCALE, Math.floor(fit * 20) / 20));
}

/** Address of public/ad-frame.html showing one Adsterra banner, so each banner has its own page. */
export function bannerUrl(key: string, width: number, height: number): string {
  return `/ad-frame?key=${encodeURIComponent(key)}&w=${width}&h=${height}`;
}

/** One banner ad: the network's ad when a key is set, otherwise our own "Advertise here" card. */
@Component({
  selector: 'app-extra-ad',
  template: `
    @if (key() && !empty()) {
      <div class="overflow-hidden" [style.width.px]="width() * scale()" [style.height.px]="height() * scale()">
        <iframe
          #frame
          title="Advertisement"
          class="block origin-top-left border-0"
          [style.transform]="scale() === 1 ? null : 'scale(' + scale() + ')'"
          [width]="width()"
          [height]="height()"
          scrolling="no"
          (load)="checkFill()"
        ></iframe>
      </div>
    } @else {
      <a
        href="/contact"
        class="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-4 text-center no-underline hover:border-brand"
        [style.width.px]="width() * scale()"
        [style.height.px]="height() * scale()"
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
  /** Shows the ad this many times larger than its real size. */
  readonly scale = input(1);
  protected readonly siteName = SITE_NAME;
  /** True when the network sent no ad, so our own card shows instead of an empty box. */
  protected readonly empty = signal(false);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private fillTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Set on the element directly: Angular treats a bound iframe src as unsafe, and this
    // address is our own page built from the network's key, not from user input.
    effect(() => {
      const frame = this.frame()?.nativeElement;
      if (frame) frame.src = bannerUrl(this.key(), this.width(), this.height());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.fillTimer));
  }

  /** The ad page is on this site, so we can see whether the network put an ad in it. */
  protected checkFill(): void {
    clearTimeout(this.fillTimer);
    this.fillTimer = setTimeout(() => {
      try {
        const page = this.frame()?.nativeElement.contentDocument;
        if (page && !page.querySelector('iframe, img, a')) this.empty.set(true);
      } catch {
        // Not readable: leave the frame as it is.
      }
    }, FILL_WAIT_MS);
  }
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
          class="fixed top-28 z-10 flex flex-col gap-1"
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
        (cancel)="$event.preventDefault()"
      >
        @if (open()) {
          <div class="flex items-center justify-between gap-4 pb-2">
            <span class="text-xs leading-4 text-muted">Advertisement</span>
            <button type="button" class="btn-small" data-tip="Close" data-tip-side="left" aria-label="Close ad" (click)="close()">
              <app-icon [path]="icons.close" [size]="16" />
            </button>
          </div>
          <app-extra-ad [key]="popupKey" [width]="300" [height]="250" [scale]="popupSize()" />
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
  protected readonly popupSize = signal(1);
  private readonly screenWidth = signal(0);
  private readonly path = signal('/');
  /** True while the side ads fit, so narrow screens never load them. */
  protected readonly wide = computed(() => railsFit(this.path(), this.screenWidth()));
  private readonly popup = viewChild<ElementRef<HTMLDialogElement>>('popup');
  private readonly document = inject(DOCUMENT);
  private clicks = 0;

  constructor() {
    const onClick = (event: MouseEvent) => this.onPageClick(event);
    const view = this.document.defaultView;
    const onResize = () => this.screenWidth.set(view?.innerWidth ?? 0);
    const router = inject(Router);
    const navigation = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.path.set(event.urlAfterRedirects);
    });
    afterNextRender(() => {
      // Automated browsers (tests, crawlers) get our own cards instead of network ads.
      if (view?.navigator.webdriver) this.railKey = this.popupKey = '';
      this.path.set(router.url);
      onResize();
      view?.addEventListener('resize', onResize);
      this.ready.set(true);
      this.document.addEventListener('click', onClick);
      this.openOnArrival();
    });
    inject(DestroyRef).onDestroy(() => {
      navigation.unsubscribe();
      view?.removeEventListener('resize', onResize);
      this.document.removeEventListener('click', onClick);
    });
  }

  protected close(): void {
    this.popup()?.nativeElement.close();
  }

  private onPageClick(event: MouseEvent): void {
    const dialog = this.popup()?.nativeElement;
    if (!dialog || this.open() || dialog.contains(event.target as Node)) return;
    if (this.automated()) return;
    this.clicks++;
    if (!popupDue(this.clicks)) return;
    // Open after the click has done its own job, so the popup never blocks it.
    setTimeout(() => this.showPopup(), 300);
  }

  /** Opens the popup once, shortly after a visitor first arrives in this browser session. */
  private openOnArrival(): void {
    const config: PopupConfig = EXTRA_ADS.popup;
    if (!config.enabled || !config.onFirstLoad || this.automated()) return;
    const storage = this.sessionStorage();
    if (storage?.getItem(ARRIVAL_POPUP_KEY)) return;
    try {
      storage?.setItem(ARRIVAL_POPUP_KEY, '1');
    } catch {
      // Storage full or blocked: the popup may then open again on the next page load.
    }
    setTimeout(() => this.showPopup(), ARRIVAL_DELAY_MS);
  }

  private showPopup(): void {
    const dialog = this.popup()?.nativeElement;
    if (!dialog || this.open() || typeof dialog.showModal !== 'function') return;
    // Another dialog (a tool's own) is open: do not cover it.
    if (this.document.querySelector('dialog[open]')) return;
    const view = this.document.defaultView;
    this.popupSize.set(popupScale(view?.innerWidth ?? 0, view?.innerHeight ?? 0));
    this.clicks = 0;
    this.open.set(true);
    dialog.showModal();
  }

  /** Automated browsers (tests, crawlers) never get the popup. */
  private automated(): boolean {
    return !!this.document.defaultView?.navigator.webdriver;
  }

  private sessionStorage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}
