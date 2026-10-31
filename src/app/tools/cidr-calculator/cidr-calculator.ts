import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { TOOLS } from '../../core/tools';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolGroupNav } from '../../shared/tool-group-nav/tool-group-nav';
import { ToolInfoSection } from '../../shared/tool-info/tool-info';
import { addressType, blockSize, contains, formatAddress, formatIpv6, hostRange, maskOf, parseBlock, subnets, toCidr } from './cidr';
import { CIDR_CONTENT } from './content';

const SHOWN_SUBNETS = 256;

/** 1,024 for small numbers; 2^80 (1.2 × 10^24) for huge IPv6 counts. */
function count(n: bigint): string {
  if (n < 10n ** 15n) return n.toLocaleString('en-US');
  const power = n.toString(2).length - 1;
  return n === 1n << BigInt(power) ? `2^${power}` : n.toString();
}

@Component({
  selector: 'app-cidr-calculator',
  imports: [Icon, CopyButton, ShareButton, ToolGroupNav, ToolInfoSection],
  template: `
    <div class="container-tool pt-10 sm:pt-16">
      <app-tool-group-nav [tool]="tool" />
      <h1 class="mt-6 text-[28px] leading-9 sm:text-[40px] sm:leading-12">{{ tool.name }}</h1>
      <p class="mt-3 text-muted">{{ tool.description }}</p>

      <div class="mt-8 flex items-center justify-between gap-2">
        <label for="cidr-input" class="text-sm leading-5 font-semibold">CIDR block or address</label>
        <app-share-button [path]="tool.path" [data]="input().trim() ? { input: input() } : null" />
      </div>
      <input
        id="cidr-input"
        class="field mt-2 w-full font-mono text-lg"
        spellcheck="false"
        autocomplete="off"
        placeholder="10.0.0.0/16, 192.168.1.10 255.255.255.0 or 2001:db8::/32"
        [value]="input()"
        (input)="input.set($any($event.target).value)"
      />
      <div class="mt-3 flex flex-wrap gap-2">
        @for (example of examples; track example) {
          <button type="button" class="btn-small font-mono" (click)="input.set(example)">{{ example }}</button>
        }
      </div>

      @if (error(); as message) {
        <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm leading-5" role="alert">{{ message }}</p>
      }

      @if (block(); as b) {
        <dl class="mt-6 flex flex-col divide-y divide-line rounded-xl border border-line" aria-live="polite">
          @for (row of rows(); track row.label) {
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <dt class="w-full shrink-0 sm:w-40 text-sm font-semibold">{{ row.label }}</dt>
              <dd class="min-w-0 flex-1 font-mono text-sm break-all">{{ row.value }}</dd>
              @if (row.copy) {
                <app-copy-button [text]="row.value" [ariaLabel]="'Copy ' + row.label" />
              }
            </div>
          }
        </dl>

        <section class="mt-10" aria-labelledby="check-heading">
          <h2 id="check-heading" class="text-xl leading-7">Is an address in this block?</h2>
          <input
            class="field mt-3 w-full font-mono sm:w-96"
            spellcheck="false"
            [attr.aria-label]="'IP address to check against ' + cidr()"
            [placeholder]="b.family === 4 ? '10.0.12.34' : '2001:db8::42'"
            [value]="probe()"
            (input)="probe.set($any($event.target).value)"
          />
          <p class="mt-2 min-h-6 text-sm" aria-live="polite">
            @switch (probeResult()) {
              @case (true) {
                <span class="font-semibold text-success">Yes, {{ probe().trim() }} is in {{ cidr() }}.</span>
              }
              @case (false) {
                <span class="font-semibold text-danger">No, {{ probe().trim() }} is outside {{ cidr() }}.</span>
              }
              @case (null) {
                @if (probe().trim()) {
                  <span class="text-danger">Enter an IPv{{ b.family }} address.</span>
                }
              }
            }
          </p>
        </section>

        @if (splitOptions().length) {
          <section class="mt-8" aria-labelledby="split-heading">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="split-heading" class="text-xl leading-7">Split into subnets</h2>
              <label class="flex items-center gap-2 text-sm leading-5">
                <span class="font-semibold">Subnet size</span>
                <select class="field" [value]="splitPrefix()" (change)="chooseSplit(+$any($event.target).value)">
                  @for (p of splitOptions(); track p) {
                    <option [value]="p" [selected]="p === splitPrefix()">/{{ p }}</option>
                  }
                </select>
              </label>
            </div>
            @if (split(); as s) {
              <p class="mt-2 text-sm text-muted">
                {{ countText(s.total) }} subnets of /{{ splitPrefix() }}, each with {{ countText(subnetSize()) }} addresses.
                @if (s.total > s.list.length) {
                  The first {{ s.list.length }} are listed.
                }
              </p>
              <div class="mt-3 max-h-96 overflow-auto rounded-xl border border-line">
                <table class="w-full text-left text-sm">
                  <thead class="sticky top-0 bg-surface">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">Subnet</th>
                      <th scope="col" class="px-4 py-2 font-semibold">First address</th>
                      <th scope="col" class="px-4 py-2 font-semibold">Last address</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line font-mono">
                    @for (sub of s.list; track sub.network) {
                      <tr>
                        <td class="px-4 py-1.5">{{ toCidr(sub) }}</td>
                        <td class="px-4 py-1.5">{{ formatAddress(sub.network, sub.family) }}</td>
                        <td class="px-4 py-1.5">{{ formatAddress(sub.last, sub.family) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
      }

      <p class="mt-8 flex items-center gap-2 text-sm text-muted">
        <app-icon [path]="icons.lock" [size]="16" />
        Worked out in your browser. No address is looked up or sent anywhere.
      </p>

      <app-tool-info [tool]="tool" [content]="content" />
    </div>
  `,
})
export class CidrCalculator {
  protected readonly tool = TOOLS.find((t) => t.path === 'cidr-calculator')!;
  protected readonly content = CIDR_CONTENT;
  protected readonly icons = ICONS;
  protected readonly examples = ['10.0.0.0/16', '192.168.1.0/24', '172.16.5.10/20', '2001:db8::/48'];
  protected readonly toCidr = toCidr;
  protected readonly formatAddress = formatAddress;
  protected readonly countText = count;

  protected readonly input = signal('10.0.0.0/16');
  protected readonly probe = signal('');
  private readonly chosenSplit = signal<number | null>(null);

  private readonly parsed = computed(() => parseBlock(this.input()));
  protected readonly block = computed(() => {
    const result = this.parsed();
    return result.ok ? result.block : null;
  });
  protected readonly error = computed(() => {
    const result = this.parsed();
    return result.ok ? null : result.error || null;
  });
  protected readonly cidr = computed(() => (this.block() ? toCidr(this.block()!) : ''));

  protected readonly rows = computed(() => {
    const b = this.block();
    if (!b) return [];
    const hosts = hostRange(b);
    const v4 = b.family === 4;
    const mask = maskOf(b.prefix, b.family);
    const all = (1n << BigInt(v4 ? 32 : 128)) - 1n;
    const rows = [
      { label: 'CIDR', value: toCidr(b), copy: true },
      { label: 'Type', value: addressType(b), copy: false },
      { label: 'Network address', value: formatAddress(b.network, b.family), copy: true },
      { label: v4 ? 'Broadcast address' : 'Last address', value: formatAddress(b.last, b.family), copy: true },
      { label: v4 ? 'Usable hosts' : 'First – last', value: `${formatAddress(hosts.first, b.family)} – ${formatAddress(hosts.last, b.family)}`, copy: false },
      { label: 'Addresses', value: count(blockSize(b)), copy: false },
    ];
    if (v4) {
      rows.push(
        { label: 'Usable host count', value: count(hosts.count), copy: false },
        { label: 'Subnet mask', value: formatAddress(mask, 4), copy: true },
        { label: 'Wildcard mask', value: formatAddress(all ^ mask, 4), copy: true },
        { label: 'Mask in binary', value: mask.toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1.'), copy: false },
      );
    } else {
      rows.push({ label: 'Network, expanded', value: formatIpv6(b.network, true), copy: true });
    }
    return rows;
  });
  protected readonly probeResult = computed(() => {
    const b = this.block();
    return b && this.probe().trim() ? contains(b, this.probe()) : null;
  });

  /** Up to 16 bits smaller than the block, and never smaller than a single address. */
  protected readonly splitOptions = computed(() => {
    const b = this.block();
    if (!b) return [];
    const max = Math.min(b.family === 4 ? 32 : 128, b.prefix + 16);
    return Array.from({ length: max - b.prefix }, (_, i) => b.prefix + i + 1);
  });
  protected readonly splitPrefix = computed(() => {
    const options = this.splitOptions();
    const chosen = this.chosenSplit();
    return chosen !== null && options.includes(chosen) ? chosen : (options[Math.min(1, options.length - 1)] ?? 0);
  });
  protected readonly split = computed(() => {
    const b = this.block();
    return b && this.splitOptions().length ? subnets(b, this.splitPrefix(), SHOWN_SUBNETS) : null;
  });
  protected readonly subnetSize = computed(() => {
    const b = this.block();
    return b ? 1n << BigInt((b.family === 4 ? 32 : 128) - this.splitPrefix()) : 0n;
  });

  constructor() {
    onSharedInput((data) => this.input.set(data['input'] ?? ''));
  }

  protected chooseSplit(prefix: number): void {
    this.chosenSplit.set(prefix);
  }
}
