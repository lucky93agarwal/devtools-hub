import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { downloadText } from '../../shared/file-utils';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { drawToCanvas, makeQr } from '../qr-code-generator/qr';
import { Issue, appleAssociation, assetLinks, checkAppleAssociation, checkAssetLinks, intentFilter, testCommands } from './links';

type Tab = 'android' | 'ios' | 'test';

const CONTENT: ToolContent = {
  aboutHeading: 'About this App Links and Universal Links helper',
  about:
    'For https links to open your app instead of the browser, the website must host a file that proves it trusts the ' +
    'app: assetlinks.json for Android App Links and apple-app-site-association for iOS Universal Links. Small mistakes ' +
    'in these files, such as a lowercase fingerprint or a wrong team ID, make links silently open in the browser. ' +
    'Generate both files and the Android intent filter, check files you already have, and get adb and simctl commands ' +
    'plus a QR code to test a link on a device.',
  steps: [
    'Android: enter the package name and SHA-256 fingerprints, then host the file at /.well-known/assetlinks.json.',
    'iOS: enter the team ID, bundle ID and paths, then host the file at /.well-known/apple-app-site-association.',
    'Or paste an existing file in the checker to find mistakes.',
    'Test: enter a link to get the commands and a QR code to scan on a phone.',
  ],
  faq: [
    { question: 'Where do I find the SHA-256 fingerprint?', answer: 'In Play Console under Setup, App signing (use the app signing key, not only the upload key), or run keytool -list -v -keystore your.keystore for a local key.' },
    { question: 'Why does my link still open the browser?', answer: 'The files must be served over HTTPS with no redirects, as JSON. On Android 12 and later, run adb shell pm get-app-links to see if the domain was verified. Apple caches the file through its CDN, so changes can take a while.' },
    { question: 'Does this fetch my website?', answer: 'No. Browsers cannot read other sites’ files directly, so paste the file contents into the checker. Nothing is uploaded.' },
  ],
};

const lines = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

@Component({
  selector: 'app-deep-link-checker',
  imports: [CopyButton, ToolPage],
  template: `
    <app-tool-page path="deep-link-checker" [content]="content" privacy="Files are made and checked in your browser. Nothing is uploaded or fetched.">
      <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Platform">
        @for (t of tabs; track t.value) {
          <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
            [class]="tab() === t.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="tab() === t.value" (click)="tab.set(t.value)">{{ t.label }}</button>
        }
      </div>

      @switch (tab()) {
        @case ('android') {
          <div class="mt-5 grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-3">
              <label class="text-sm font-semibold">Package name
                <input class="field mt-1 w-full font-mono" [value]="pkg()" (input)="pkg.set($any($event.target).value)" placeholder="com.example.shop" />
              </label>
              <label class="text-sm font-semibold">SHA-256 fingerprints, one per line
                <textarea class="field mt-1 h-24 w-full font-mono text-xs" [value]="prints()" (input)="prints.set($any($event.target).value)" placeholder="14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"></textarea>
              </label>
              <label class="text-sm font-semibold">Website host
                <input class="field mt-1 w-full font-mono" [value]="host()" (input)="host.set($any($event.target).value)" placeholder="shop.example.com" />
              </label>
              <label class="text-sm font-semibold">Path prefixes, optional, one per line
                <textarea class="field mt-1 h-16 w-full font-mono text-xs" [value]="paths()" (input)="paths.set($any($event.target).value)" placeholder="/product"></textarea>
              </label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="login()" (change)="login.set($any($event.target).checked)" /> Also share saved logins with the app</label>
            </div>
            <div class="flex flex-col gap-4">
              <div>
                <div class="flex items-center justify-between gap-2"><h2 class="text-lg">assetlinks.json</h2>
                  <span class="flex gap-2"><app-copy-button [text]="androidFile()" ariaLabel="Copy assetlinks.json" /><button type="button" class="btn-small" (click)="save(androidFile(), 'assetlinks.json')">Download</button></span></div>
                <pre class="mt-1 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs" aria-label="assetlinks.json file">{{ androidFile() }}</pre>
                <p class="mt-1 text-xs text-muted">Host at https://{{ host() || 'your-site' }}/.well-known/assetlinks.json</p>
              </div>
              <div>
                <div class="flex items-center justify-between gap-2"><h2 class="text-lg">AndroidManifest.xml intent filter</h2><app-copy-button [text]="filter()" ariaLabel="Copy intent filter" /></div>
                <pre class="mt-1 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">{{ filter() }}</pre>
              </div>
            </div>
          </div>
          <h2 class="mt-8 text-lg">Check an existing assetlinks.json</h2>
          <textarea class="field mt-2 h-32 w-full font-mono text-xs" aria-label="assetlinks.json to check" placeholder="Paste the contents of your assetlinks.json" [value]="androidCheck()" (input)="androidCheck.set($any($event.target).value)"></textarea>
          @if (androidCheck().trim()) { <div class="mt-2" aria-live="polite">@for (i of androidIssues(); track i.message) { <p class="mt-1 rounded-lg border px-3 py-1.5 text-sm" [class]="tone(i)">{{ i.message }}</p> } @empty { <p class="rounded-lg border border-success bg-success/10 px-3 py-1.5 text-sm">Looks good: the file is valid for Android App Links.</p> }</div> }
        }
        @case ('ios') {
          <div class="mt-5 grid gap-6 lg:grid-cols-2">
            <div class="flex flex-col gap-3">
              <label class="text-sm font-semibold">Team ID
                <input class="field mt-1 w-full font-mono uppercase" maxlength="10" [value]="team()" (input)="team.set($any($event.target).value)" placeholder="ABCDE12345" />
              </label>
              <label class="text-sm font-semibold">Bundle ID
                <input class="field mt-1 w-full font-mono" [value]="bundle()" (input)="bundle.set($any($event.target).value)" placeholder="com.example.shop" />
              </label>
              <label class="text-sm font-semibold">Paths that open the app, one per line (empty means all)
                <textarea class="field mt-1 h-20 w-full font-mono text-xs" [value]="iosPaths()" (input)="iosPaths.set($any($event.target).value)" placeholder="/product/*"></textarea>
              </label>
              <label class="text-sm font-semibold">Paths that stay in the browser, one per line
                <textarea class="field mt-1 h-16 w-full font-mono text-xs" [value]="excluded()" (input)="excluded.set($any($event.target).value)" placeholder="/admin/*"></textarea>
              </label>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="webCreds()" (change)="webCreds.set($any($event.target).checked)" /> Add webcredentials (password autofill)</label>
            </div>
            <div>
              <div class="flex items-center justify-between gap-2"><h2 class="text-lg">apple-app-site-association</h2>
                <span class="flex gap-2"><app-copy-button [text]="appleFile()" ariaLabel="Copy apple-app-site-association" /><button type="button" class="btn-small" (click)="save(appleFile(), 'apple-app-site-association')">Download</button></span></div>
              <pre class="mt-1 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs" aria-label="apple-app-site-association file">{{ appleFile() }}</pre>
              <p class="mt-1 text-xs text-muted">Host at /.well-known/apple-app-site-association with no file extension, served as application/json. Add applinks:your-site to Associated Domains in Xcode.</p>
            </div>
          </div>
          <h2 class="mt-8 text-lg">Check an existing apple-app-site-association</h2>
          <textarea class="field mt-2 h-32 w-full font-mono text-xs" aria-label="apple-app-site-association to check" placeholder="Paste the contents of your apple-app-site-association" [value]="appleCheck()" (input)="appleCheck.set($any($event.target).value)"></textarea>
          @if (appleCheck().trim()) { <div class="mt-2" aria-live="polite">@for (i of appleIssues(); track i.message) { <p class="mt-1 rounded-lg border px-3 py-1.5 text-sm" [class]="tone(i)">{{ i.message }}</p> } @empty { <p class="rounded-lg border border-success bg-success/10 px-3 py-1.5 text-sm">Looks good: the file is valid for Universal Links.</p> }</div> }
        }
        @case ('test') {
          <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div class="flex flex-col gap-3">
              <label class="text-sm font-semibold">Link to test
                <input class="field mt-1 w-full font-mono" [value]="link()" (input)="link.set($any($event.target).value)" placeholder="https://shop.example.com/product/42" />
              </label>
              <label class="text-sm font-semibold">Android package, optional
                <input class="field mt-1 w-full font-mono" [value]="pkg()" (input)="pkg.set($any($event.target).value)" placeholder="com.example.shop" />
              </label>
              @if (commands(); as c) {
                @for (row of [['Open on Android (adb)', c.android], ['Check Android verification', c.androidVerify], ['Open on iOS Simulator', c.ios], ['Android file URL', c.assetLinksUrl], ['iOS file URL', c.appleUrl]]; track row[0]) {
                  <div>
                    <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">{{ row[0] }}</span><app-copy-button [text]="row[1]" [ariaLabel]="'Copy: ' + row[0]" /></div>
                    <pre class="mt-1 overflow-x-auto rounded-lg bg-surface p-2 font-mono text-xs">{{ row[1] }}</pre>
                  </div>
                }
              } @else if (link().trim()) {
                <p class="rounded-lg border border-danger bg-danger/10 px-3 py-1.5 text-sm">Enter a full link, such as https://shop.example.com/product/42 or myapp://open.</p>
              }
            </div>
            <figure [class.hidden]="!commands()" class="text-center">
              <canvas #qr class="mx-auto rounded-lg" role="img" aria-label="QR code of the link" width="200" height="200"></canvas>
              <figcaption class="mt-1 text-xs text-muted">Scan with a phone camera</figcaption>
            </figure>
          </div>
        }
      }
    </app-tool-page>
  `,
})
export class DeepLinkChecker {
  protected readonly content = CONTENT;
  protected readonly tabs: { value: Tab; label: string }[] = [
    { value: 'android', label: 'Android' },
    { value: 'ios', label: 'iOS' },
    { value: 'test', label: 'Test a link' },
  ];
  protected readonly tab = signal<Tab>('android');

  protected readonly pkg = signal('com.example.shop');
  protected readonly prints = signal('');
  protected readonly host = signal('shop.example.com');
  protected readonly paths = signal('');
  protected readonly login = signal(false);
  protected readonly androidFile = computed(() => assetLinks(this.pkg(), lines(this.prints()), this.login()));
  protected readonly filter = computed(() => intentFilter('https', this.host(), lines(this.paths())));
  protected readonly androidCheck = signal('');
  protected readonly androidIssues = computed(() => checkAssetLinks(this.androidCheck()));

  protected readonly team = signal('');
  protected readonly bundle = signal('com.example.shop');
  protected readonly iosPaths = signal('');
  protected readonly excluded = signal('');
  protected readonly webCreds = signal(false);
  protected readonly appleFile = computed(() => appleAssociation(this.team() || 'TEAMID1234', this.bundle(), lines(this.iosPaths()), lines(this.excluded()), this.webCreds()));
  protected readonly appleCheck = signal('');
  protected readonly appleIssues = computed(() => checkAppleAssociation(this.appleCheck()));

  protected readonly link = signal('');
  protected readonly commands = computed(() => testCommands(this.link(), this.pkg().trim()));
  private readonly qr = viewChild<ElementRef<HTMLCanvasElement>>('qr');

  constructor() {
    effect(() => {
      const canvas = this.qr()?.nativeElement;
      const c = this.commands();
      if (!canvas || !c) return;
      const result = makeQr(this.link().trim(), 'M');
      if (result.ok) drawToCanvas(canvas, result.modules, { margin: 4, foreground: '#000000', background: '#ffffff' }, 200);
    });
  }

  protected tone(i: Issue): string {
    return i.level === 'error' ? 'border-danger bg-danger/10' : 'border-warning bg-warning/10';
  }

  protected save(text: string, name: string): void {
    downloadText(text, name);
  }
}
