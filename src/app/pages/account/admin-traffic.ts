import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AccountError, Auth } from '../../core/accounts/auth';
import { eventLabel } from '../../core/accounts/login-methods';


/** One visit or one login attempt, as the admin API sends it. */
export interface TrafficRow {
  id: number;
  created_at: number;
  visitor_id: string | null;
  user_id: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  gps_status?: string;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_accuracy: number | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  platform: string | null;
  user_agent: string | null;
  // visits
  page?: string | null;
  referrer?: string | null;
  language?: string | null;
  timezone?: string | null;
  screen?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  // visits (the logged-in user's email) and logins (the email typed)
  email?: string | null;
  // logins
  success?: number;
  method?: string;
  reason?: string | null;
  new_device?: number;
}

/** "Lucknow, Uttar Pradesh, IN", or a dash. */
export function placeName(row: Pick<TrafficRow, 'city' | 'region' | 'country'>): string {
  return [row.city, row.region, row.country].filter(Boolean).join(', ') || '—';
}

/** What the GPS column shows: the position, or why there is none. */
export function gpsText(row: Pick<TrafficRow, 'gps_status' | 'gps_lat' | 'gps_lon' | 'gps_accuracy'>): string {
  if (row.gps_lat !== null && row.gps_lon !== null) {
    return `${row.gps_lat.toFixed(5)}, ${row.gps_lon.toFixed(5)}${row.gps_accuracy ? ` (±${Math.round(row.gps_accuracy)} m)` : ''}`;
  }
  return ({ denied: 'Not allowed', unavailable: 'Not available', asked: 'No answer' } as Record<string, string>)[row.gps_status ?? ''] ?? '—';
}

type Today = { visits: number; visitors: number; loggedIn: number; gps: number };

export const REASONS: Record<string, string> = {
  'wrong-password': 'Wrong password',
  'no-account': 'No such account',
  blocked: 'Account blocked',
  paused: 'Paused (too many tries)',
  captcha: 'CAPTCHA failed',
  'no-password': 'No password (uses Google / Facebook / Apple / GitHub)',
};

/** The admin's Visitors and Logins tabs: a searchable, paged table with every field. */
@Component({
  selector: 'app-admin-traffic',
  template: `
    @if (kind() === 'visits' && !userId() && today(); as t) {
      <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Last 24 hours">
        <div class="card p-4"><span class="block text-sm text-muted">Visits (24 h)</span><span class="mt-1 block text-3xl font-semibold">{{ t.visits }}</span></div>
        <div class="card p-4"><span class="block text-sm text-muted">Different visitors (24 h)</span><span class="mt-1 block text-3xl font-semibold">{{ t.visitors }}</span></div>
        <div class="card p-4"><span class="block text-sm text-muted">Logged-in visits (24 h)</span><span class="mt-1 block text-3xl font-semibold">{{ t.loggedIn }}</span></div>
        <div class="card p-4"><span class="block text-sm text-muted">Allowed GPS (24 h)</span><span class="mt-1 block text-3xl font-semibold">{{ t.gps }}</span></div>
      </div>
    }
    <div class="flex flex-wrap items-end gap-3" [class.mt-6]="!userId()" [class.mt-2]="!!userId()">
      <label class="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">Search
        <input class="field font-normal" type="search" [placeholder]="kind() === 'visits' ? 'User, email, IP or city' : 'Email, IP or city'" [value]="query()" (input)="setQuery($any($event.target).value)" />
      </label>
      <label class="flex flex-col gap-1 text-sm font-semibold">Show
        <select class="field font-normal" [attr.aria-label]="kind() === 'visits' ? 'Filter visits' : 'Filter logins'" (change)="filter.set($any($event.target).value); page.set(1)">
          @for (f of filters(); track f.id) { <option [value]="f.id" [selected]="filter() === f.id">{{ f.label }}</option> }
        </select>
      </label>
      <button type="button" class="btn-small" (click)="reload()">↻ Refresh</button>
    </div>
    @if (error()) { <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }

    <div class="card mt-4 overflow-x-auto p-0">
      <table class="w-full min-w-[1100px] text-left text-sm" [attr.aria-label]="kind() === 'visits' ? 'Visits' : 'Logins'">
        <thead class="bg-surface text-muted">
          <tr>
            <th class="px-3 py-2 font-semibold">#</th>
            <th class="px-3 py-2 font-semibold">Date / time</th>
            @if (kind() === 'visits') { <th class="px-3 py-2 font-semibold">User</th> }
            @else { <th class="px-3 py-2 font-semibold">Email</th><th class="px-3 py-2 font-semibold">Result</th> }
            <th class="px-3 py-2 font-semibold">IP</th>
            <th class="px-3 py-2 font-semibold">City / region / country</th>
            <th class="px-3 py-2 font-semibold">GPS (lat, long)</th>
            <th class="px-3 py-2 font-semibold">Device</th>
            <th class="px-3 py-2 font-semibold">OS</th>
            <th class="px-3 py-2 font-semibold">Browser</th>
            <th class="px-3 py-2 font-semibold">Platform</th>
            @if (kind() === 'visits') { <th class="px-3 py-2 font-semibold">Page</th> }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id; let i = $index) {
            <tr class="border-t border-line align-top" [title]="r.user_agent ?? ''">
              <td class="px-3 py-2 text-muted">{{ firstRow() + i }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ when(r.created_at) }}</td>
              @if (kind() === 'visits') {
                <td class="px-3 py-2">
                  @if (r.user_id) {
                    <span class="font-semibold">{{ r.first_name }} {{ r.last_name }}</span><br /><span class="text-xs text-muted">{{ r.email ?? '(deleted user)' }}</span>
                  } @else {
                    <span class="text-muted italic">Unknown user</span>
                  }
                </td>
              } @else {
                <td class="px-3 py-2">{{ r.email }}</td>
                <td class="px-3 py-2">
                  @if (r.success) { <span class="text-success">✓ {{ methodName(r.method) }}{{ r.reason === 'new-account' ? ' (new account)' : '' }}</span> }
                  @else { <span class="text-danger">✗ {{ reason(r.reason) }}</span> }
                  @if (r.new_device) { <br /><span class="chip !py-0 text-xs">New device</span> }
                </td>
              }
              <td class="px-3 py-2 font-mono text-xs">{{ r.ip || '—' }}</td>
              <td class="px-3 py-2">{{ place(r) }}</td>
              <td class="px-3 py-2 whitespace-nowrap">
                @if (r.gps_lat !== null && r.gps_lon !== null) {
                  <a class="text-brand hover:underline" target="_blank" rel="noopener noreferrer" [href]="'https://www.google.com/maps?q=' + r.gps_lat + ',' + r.gps_lon">{{ gps(r) }}</a>
                } @else { <span class="text-muted">{{ gps(r) }}</span> }
              </td>
              <td class="px-3 py-2">{{ r.device_type ?? '—' }}</td>
              <td class="px-3 py-2">{{ r.os ?? '—' }}</td>
              <td class="px-3 py-2">{{ r.browser ?? '—' }}</td>
              <td class="px-3 py-2">{{ r.platform ?? '—' }}</td>
              @if (kind() === 'visits') { <td class="max-w-56 truncate px-3 py-2" [title]="r.page ?? ''">{{ r.page ?? '—' }}</td> }
            </tr>
          } @empty {
            <tr><td class="px-3 py-6 text-center text-muted" colspan="13">{{ loading() ? 'Loading…' : 'Nothing recorded yet.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (total() > 0) {
      <nav class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pages">
        <span class="text-muted">Showing {{ firstRow() }}–{{ lastRow() }} of {{ total() }}</span>
        <span class="flex flex-wrap items-center gap-1">
          <label class="mr-2 flex items-center gap-1 text-muted">Rows
            <select class="field !py-1" aria-label="Rows per page" (change)="size.set(+$any($event.target).value); page.set(1)">
              @for (n of sizes; track n) { <option [value]="n" [selected]="size() === n">{{ n }}</option> }
            </select>
          </label>
          <button type="button" class="btn-small !px-2.5" aria-label="First page" [disabled]="page() <= 1" (click)="page.set(1)">«</button>
          <button type="button" class="btn-small !px-2.5" aria-label="Previous page" [disabled]="page() <= 1" (click)="page.set(page() - 1)">‹</button>
          <span class="px-2">Page {{ page() }} of {{ pages() }}</span>
          <button type="button" class="btn-small !px-2.5" aria-label="Next page" [disabled]="page() >= pages()" (click)="page.set(page() + 1)">›</button>
          <button type="button" class="btn-small !px-2.5" aria-label="Last page" [disabled]="page() >= pages()" (click)="page.set(pages())">»</button>
        </span>
      </nav>
    }
    <p class="mt-3 text-xs text-muted">City comes from the IP address (approximate). GPS is exact, but only when the visitor allowed it. Records are kept for 90 days.</p>
  `,
})
export class AdminTraffic {
  readonly kind = input.required<'visits' | 'logins'>();
  /** Only this user's rows (in the user details), without the 24-hour numbers. */
  readonly userId = input('');
  private readonly auth = inject(Auth);
  protected readonly rows = signal<TrafficRow[]>([]);
  protected readonly total = signal(0);
  protected readonly today = signal<Today | null>(null);
  protected readonly query = signal('');
  private readonly search = signal('');
  protected readonly filter = signal('all');
  protected readonly page = signal(1);
  protected readonly sizes = [20, 50, 100];
  protected readonly size = signal(20);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private readonly tick = signal(0);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly firstRow = computed(() => (this.total() ? (this.page() - 1) * this.size() + 1 : 0));
  protected readonly lastRow = computed(() => Math.min(this.total(), this.page() * this.size()));
  protected readonly filters = computed(() =>
    this.kind() === 'visits'
      ? [
          { id: 'all', label: 'All visitors' },
          { id: 'users', label: 'Logged-in users' },
          { id: 'unknown', label: 'Unknown users' },
        ]
      : [
          { id: 'all', label: 'All logins' },
          { id: 'success', label: 'Successful' },
          { id: 'failed', label: 'Failed' },
          { id: 'new-device', label: 'New device' },
        ],
  );

  protected readonly place = placeName;
  protected readonly gps = gpsText;

  constructor() {
    effect(() => {
      const kind = this.kind();
      const params = new URLSearchParams({ q: this.search(), page: String(this.page()), size: String(this.size()) });
      params.set(kind === 'visits' ? 'who' : 'result', this.filter());
      if (this.userId()) params.set('user', this.userId());
      this.tick();
      untracked(() => void this.load(kind, params));
    });
  }

  private async load(kind: 'visits' | 'logins', params: URLSearchParams): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.auth.call<{ visits?: TrafficRow[]; logins?: TrafficRow[]; total: number; today?: Today }>(
        'GET',
        `/api/admin/${kind}?${params}`,
      );
      this.rows.set((kind === 'visits' ? data.visits : data.logins) ?? []);
      this.total.set(data.total);
      this.today.set(data.today ?? null);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not load this list.');
    } finally {
      this.loading.set(false);
    }
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.search.set(value);
    }, 250);
  }

  protected when(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  protected methodName(method: string | undefined): string {
    return eventLabel(method);
  }

  protected reason(reason: string | null | undefined): string {
    return reason ? (REASONS[reason] ?? reason) : 'Failed';
  }
}
