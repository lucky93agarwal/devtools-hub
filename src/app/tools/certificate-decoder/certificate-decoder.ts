import { Component, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { Analytics } from '../../core/analytics';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { CERT_CONTENT } from './content';
import { EC_CERT } from './samples';
import { Decoded, chainLinks, decodeInput, fingerprint, nameText, validityStatus } from './x509';

const MAX_FILE_BYTES = 1024 * 1024;

@Component({
  selector: 'app-certificate-decoder',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-2">
        <label for="pem-input" class="text-sm leading-5 font-semibold">Certificate, chain or CSR (PEM)</label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-small" (click)="fileInput.click()">
            <app-icon [path]="icons.upload" [size]="16" />
            Open file
          </button>
          <button type="button" class="btn-small" (click)="setInput(sample)">Try a sample</button>
          <button type="button" class="btn-small" [disabled]="!input() && !fileName()" (click)="setInput('')">Clear</button>
          <app-share-button [path]="tool.path" [data]="input().trim() ? { input: input() } : null" />
        </div>
        <input #fileInput type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept=".pem,.crt,.cer,.der,.csr,.p7b,.txt" (change)="onFile(fileInput)" />
      </div>
      <textarea
        id="pem-input"
        rows="8"
        class="field-code mt-2"
        spellcheck="false"
        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIC…&#10;-----END CERTIFICATE-----"
        [value]="input()"
        (input)="setInput($any($event.target).value)"
      ></textarea>
      @if (fileName(); as name) {
        <p class="mt-2 text-sm font-semibold">Showing {{ name }} (binary DER file).</p>
      }
      <p class="mt-2 text-sm text-muted">To get a site’s chain: <code class="font-mono">openssl s_client -connect example.com:443 -showcerts</code></p>

      <div class="mt-4 min-h-6 text-sm leading-5" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (items().length > 1) {
          <p class="font-semibold">{{ items().length }} items found.</p>
        }
      </div>

      @for (item of items(); track $index; let i = $index) {
        <section class="card mt-4 p-4 sm:p-6" [attr.aria-label]="'Item ' + (i + 1)">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl leading-7 break-all">{{ commonName(item) }}</h2>
            <span class="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">{{ item.kind === 'request' ? 'Certificate request' : 'Certificate' }}</span>
            @if (status(item); as s) {
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                [class]="s.state === 'valid' ? 'bg-success/15 text-success' : s.state === 'expired' ? 'bg-danger/10 text-danger' : 'bg-warning/15 text-warning'"
                >{{ s.text }}</span
              >
            }
          </div>
          @if (links()[i]) {
            <p class="mt-1 text-sm text-muted">{{ links()[i] }}</p>
          }
          <dl class="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line bg-page">
            @for (row of rows(item, i); track row.label) {
              <div class="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5">
                <dt class="w-full shrink-0 text-sm font-semibold sm:w-44">{{ row.label }}</dt>
                <dd class="min-w-0 flex-1 font-mono text-sm break-all">
                  @for (line of row.values; track $index) {
                    <span class="block">{{ line }}</span>
                  }
                </dd>
                @if (row.copy) {
                  <app-copy-button [text]="row.values.join('\\n')" [ariaLabel]="'Copy ' + row.label" />
                }
              </div>
            }
          </dl>
        </section>
      }

      <p class="mt-6 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Decoded in your browser. Certificates are public, but never paste a private key into any website.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CertificateDecoder {
  protected readonly tool = TOOLS.find((t) => t.path === 'certificate-decoder')!;
  protected readonly content = CERT_CONTENT;
  protected readonly icons = ICONS;
  protected readonly sample = EC_CERT;

  protected readonly input = signal('');
  private readonly fileBytes = signal<Uint8Array | null>(null);
  protected readonly fileName = signal<string | null>(null);
  /** Fingerprints by item index, worked out with the browser's crypto (asynchronous). */
  private readonly fingerprints = signal<{ sha256: string; sha1: string }[]>([]);
  private readonly now = signal(0);

  private readonly decoded = computed(() => {
    const bytes = this.fileBytes();
    return bytes ? decodeInput(bytes) : decodeInput(this.input());
  });
  protected readonly items = computed<Decoded[]>(() => {
    const d = this.decoded();
    return d.ok ? d.items : [];
  });
  protected readonly error = computed(() => {
    const d = this.decoded();
    return d.ok ? null : d.error || null;
  });
  protected readonly links = computed(() => chainLinks(this.items()));

  private readonly analytics = inject(Analytics);

  constructor() {
    afterNextRender(() => this.now.set(Date.now()));
    effect((onCleanup) => {
      const items = this.items();
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      void Promise.all(items.map(async (c) => ({ sha256: await fingerprint(c.der, 'SHA-256'), sha1: await fingerprint(c.der, 'SHA-1') })))
        .then((list) => !cancelled && this.fingerprints.set(list))
        .catch(() => undefined);
    });
    onSharedInput((data) => this.setInput(data['input'] ?? ''));
  }

  protected commonName(item: Decoded): string {
    return item.subject.find((p) => p.key === 'CN')?.value ?? (nameText(item.subject) || 'No subject');
  }

  protected status(item: Decoded) {
    return item.kind === 'certificate' && this.now() ? validityStatus(item, this.now()) : null;
  }

  protected rows(item: Decoded, index: number): { label: string; values: string[]; copy: boolean }[] {
    const prints = this.fingerprints()[index];
    const date = (d: Date) => d.toUTCString().replace('GMT', 'UTC');
    const rows = [{ label: 'Subject', values: [nameText(item.subject) || '—'], copy: true }];
    if (item.kind === 'certificate') {
      rows.push(
        { label: 'Issuer', values: [nameText(item.issuer)], copy: true },
        { label: 'Valid from', values: [date(item.notBefore)], copy: false },
        { label: 'Valid until', values: [date(item.notAfter)], copy: false },
        { label: 'Serial number', values: [item.serial], copy: true },
        { label: 'Version', values: [String(item.version)], copy: false },
      );
    }
    rows.push(
      { label: 'Public key', values: [`${item.publicKey.algorithm}${item.publicKey.size ? `, ${item.publicKey.size}` : ''}`], copy: false },
      { label: 'Signature algorithm', values: [item.signatureAlgorithm], copy: false },
      ...item.extensions.map((e) => ({ label: e.name + (e.critical ? ' (critical)' : ''), values: e.values, copy: e.name === 'Subject alternative names' })),
    );
    if (prints) {
      rows.push({ label: 'SHA-256 fingerprint', values: [prints.sha256], copy: true }, { label: 'SHA-1 fingerprint', values: [prints.sha1], copy: true });
    }
    return rows;
  }

  protected async onFile(element: HTMLInputElement): Promise<void> {
    const file = element.files?.[0];
    element.value = '';
    if (!file || file.size > MAX_FILE_BYTES) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    // PEM files are text; DER files start with a SEQUENCE byte (0x30).
    if (bytes[0] === 0x30) {
      this.input.set('');
      this.fileBytes.set(bytes);
      this.fileName.set(file.name);
    } else {
      this.setInput(new TextDecoder().decode(bytes));
    }
    this.analytics.track('certificate-file', {});
  }

  /** Typing or pasting replaces a DER file that was opened. */
  protected setInput(value: string): void {
    this.fileBytes.set(null);
    this.fileName.set(null);
    this.input.set(value);
  }
}
