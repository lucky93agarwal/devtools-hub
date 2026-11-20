import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountError, Auth } from '../../core/accounts/auth';

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  emailVerifiedAt: number | null;
  blocked: boolean;
  blockedAt: number | null;
  createdAt: number;
  lastLoginAt: number | null;
  loginCount: number;
  activeSessions: number;
}

interface Stats {
  total: number;
  today: number;
  week: number;
  verified: number;
  blocked: number;
  admins: number;
  activeToday: number;
  activeSessions: number;
  signupsByDay: number[];
}

interface Detail {
  user: AdminUser;
  sessions: { createdAt: number; lastSeenAt: number; expiresAt: number; userAgent: string; ip: string }[];
  emails: { id: number; subject: string; sent: number; created_at: number }[];
}

interface Email {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  link: string | null;
  sent: number;
  created_at: number;
}

type Tab = 'overview' | 'users' | 'emails' | 'activity';

/** A short, readable device name from a browser's user agent. */
export function deviceName(userAgent: string): string {
  const ua = userAgent || '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl/.test(ua) ? 'curl' : 'Browser';
  return `${browser} on ${os}`;
}

/** The admin panel: numbers, every user with search and filters, one user's details, emails and the admin log. */
@Component({
  selector: 'app-admin-page',
  imports: [RouterLink],
  template: `
    <div class="container-page pt-10 pb-16 sm:pt-12">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-[28px] leading-9 sm:text-[36px] sm:leading-11">Admin panel</h1>
        @if (auth.user(); as me) { <span class="text-sm text-muted">Logged in as {{ me.email }}</span> }
      </div>
      @if (!auth.checked()) {
        <p class="mt-6 text-muted">Loading…</p>
      } @else if (!auth.user()) {
        <div class="card mt-6 max-w-md p-5"><p>Please log in with an admin account.</p><a routerLink="/login" [queryParams]="{ next: '/admin' }" class="btn-primary mt-4">Log in</a></div>
      } @else if (auth.user()!.role !== 'admin') {
        <div class="card mt-6 max-w-md p-5" role="alert"><p>Only admins can open this page.</p><a routerLink="/account" class="btn-secondary mt-4">My account</a></div>
      } @else {
        <div class="mt-6 flex gap-1 border-b border-line" role="tablist" aria-label="Admin sections">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" class="-mb-px border-b-2 px-4 py-2 text-sm font-semibold" [class]="tab() === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}</button>
          }
        </div>
        @if (error()) { <p class="mt-4 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm" role="alert">{{ error() }}</p> }

        @switch (tab()) {
          @case ('overview') {
            @if (stats(); as s) {
              <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Numbers">
                @for (c of cards(); track c.label) {
                  <button type="button" class="card p-4 text-left hover:border-brand" (click)="c.filter && showUsers(c.filter)">
                    <span class="block text-sm text-muted">{{ c.label }}</span>
                    <span class="mt-1 block text-3xl font-semibold" [attr.aria-label]="c.label + ' ' + c.value">{{ c.value }}</span>
                  </button>
                }
              </div>
              <section class="card mt-6 p-5" aria-label="New accounts in the last 14 days">
                <h2 class="text-base font-semibold">New accounts, last 14 days</h2>
                <div class="mt-4 flex h-32 items-end gap-1.5">
                  @for (n of s.signupsByDay; track $index) {
                    <div class="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span class="text-xs text-muted">{{ n || '' }}</span>
                      <div class="w-full rounded-t bg-brand" [style.height.%]="(n / maxDay()) * 85" [style.min-height.px]="n ? 4 : 1" [title]="n + ' on ' + dayLabel($index)"></div>
                    </div>
                  }
                </div>
                <div class="mt-1 flex justify-between text-xs text-muted"><span>{{ dayLabel(0) }}</span><span>Today</span></div>
              </section>
            }
          }
          @case ('users') {
            <div class="mt-6 flex flex-wrap items-end gap-3">
              <label class="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">Search
                <input class="field font-normal" type="search" placeholder="Name, email or mobile" [value]="query()" (input)="setQuery($any($event.target).value)" />
              </label>
              <label class="flex flex-col gap-1 text-sm font-semibold">Show
                <select class="field font-normal" aria-label="Filter users" (change)="filter.set($any($event.target).value); page.set(1)">
                  @for (f of filters; track f.id) { <option [value]="f.id" [selected]="filter() === f.id">{{ f.label }}</option> }
                </select>
              </label>
              <label class="flex flex-col gap-1 text-sm font-semibold">Sort
                <select class="field font-normal" aria-label="Sort users" (change)="sort.set($any($event.target).value); page.set(1)">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="last-login">Last login</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
            <p class="mt-3 text-sm text-muted" role="status">{{ total() }} user{{ total() === 1 ? '' : 's' }}</p>
            <div class="mt-2 overflow-x-auto rounded-xl border border-line">
              <table class="w-full min-w-[820px] text-left text-sm" aria-label="Users">
                <thead class="bg-surface text-xs text-muted uppercase">
                  <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Mobile</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Signed up</th><th class="px-3 py-2">Last login</th><th class="px-3 py-2">Logins</th></tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr class="cursor-pointer border-t border-line hover:bg-surface" [class.bg-surface]="selected()?.user?.id === u.id" (click)="select(u.id)" tabindex="0" (keydown.enter)="select(u.id)" [attr.aria-label]="'User ' + u.email">
                      <td class="px-3 py-2 font-semibold">{{ u.firstName }} {{ u.lastName }}@if (u.role === 'admin') { <span class="chip ml-1 !px-1.5 !py-0 !text-xs">Admin</span> }</td>
                      <td class="px-3 py-2">{{ u.email }}</td>
                      <td class="px-3 py-2">{{ u.mobile }}</td>
                      <td class="px-3 py-2">
                        @if (u.blocked) { <span class="font-semibold text-danger">Blocked</span> }
                        @else if (u.emailVerified) { <span class="text-success">✓ Confirmed</span> }
                        @else { <span class="text-warning">Not confirmed</span> }
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ when(u.createdAt) }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">{{ u.lastLoginAt ? when(u.lastLoginAt) : '—' }}</td>
                      <td class="px-3 py-2">{{ u.loginCount }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="7" class="px-3 py-6 text-center text-muted">No users match.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (pages() > 1) {
              <div class="mt-3 flex items-center gap-2 text-sm">
                <button type="button" class="btn-small" [disabled]="page() <= 1" (click)="page.set(page() - 1)">← Previous</button>
                <span>Page {{ page() }} of {{ pages() }}</span>
                <button type="button" class="btn-small" [disabled]="page() >= pages()" (click)="page.set(page() + 1)">Next →</button>
              </div>
            }

            @if (selected(); as d) {
              <section class="card mt-6 p-5" aria-label="User details">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 class="text-xl leading-7">{{ d.user.firstName }} {{ d.user.lastName }}</h2>
                    <p class="text-sm text-muted">{{ d.user.email }} · {{ d.user.mobile }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    @if (d.user.id !== auth.user()!.id) {
                      <button type="button" class="btn-small" [class.!border-danger]="!d.user.blocked" [class.!text-danger]="!d.user.blocked" (click)="block(d.user, !d.user.blocked)">{{ d.user.blocked ? 'Unblock' : 'Block user' }}</button>
                    }
                    <button type="button" class="btn-small" [disabled]="!d.sessions.length" (click)="logoutUser(d.user)">Log out everywhere</button>
                    <button type="button" class="btn-small" aria-label="Close details" (click)="selected.set(null)">✕</button>
                  </div>
                </div>
                <dl class="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">
                  <dt class="text-muted">Account type</dt><dd>{{ d.user.role === 'admin' ? 'Admin' : 'User' }}</dd>
                  <dt class="text-muted">Email confirmed</dt><dd>{{ d.user.emailVerifiedAt ? when(d.user.emailVerifiedAt) : 'Not yet' }}</dd>
                  <dt class="text-muted">Signed up</dt><dd>{{ when(d.user.createdAt) }}</dd>
                  <dt class="text-muted">Last login</dt><dd>{{ d.user.lastLoginAt ? when(d.user.lastLoginAt) : '—' }} ({{ d.user.loginCount }} logins)</dd>
                  <dt class="text-muted">Status</dt><dd>{{ d.user.blocked ? 'Blocked since ' + when(d.user.blockedAt!) : 'Active' }}</dd>
                  <dt class="text-muted">User ID</dt><dd class="font-mono text-xs">{{ d.user.id }}</dd>
                </dl>
                <h3 class="mt-5 text-base font-semibold">Logged in on ({{ d.sessions.length }})</h3>
                @if (d.sessions.length) {
                  <ul class="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
                    @for (s of d.sessions; track s.createdAt) {
                      <li class="flex flex-wrap justify-between gap-2 px-3 py-2"><span class="font-semibold">{{ device(s.userAgent) }}</span><span class="text-muted">since {{ when(s.createdAt) }} · last seen {{ when(s.lastSeenAt) }}@if (s.ip) { · {{ s.ip }} }</span></li>
                    }
                  </ul>
                } @else { <p class="mt-2 text-sm text-muted">Not logged in anywhere.</p> }
                <h3 class="mt-5 text-base font-semibold">Emails sent</h3>
                <ul class="mt-2 text-sm">
                  @for (e of d.emails; track e.id) { <li class="py-0.5">{{ when(e.created_at) }} · {{ e.subject }}</li> } @empty { <li class="text-muted">None</li> }
                </ul>
              </section>
            }
          }
          @case ('emails') {
            <p class="mt-6 text-sm text-muted">
              @if (emailServiceOn()) { Emails are sent by the email service and also listed here. }
              @else { No email service is connected yet (local testing), so emails are not sent: they are kept here. Use the links to test confirming an email and resetting a password. }
            </p>
            <ul class="mt-4 flex flex-col gap-3" aria-label="Emails">
              @for (e of emails(); track e.id) {
                <li class="card p-4 text-sm">
                  <p class="flex flex-wrap justify-between gap-2"><strong>{{ e.subject }}</strong><span class="text-muted">{{ when(e.created_at) }}</span></p>
                  <p class="text-muted">To {{ e.to_email }} · {{ e.sent ? 'Sent' : 'Not sent (no email service)' }}</p>
                  <pre class="mt-2 font-sans whitespace-pre-wrap">{{ e.body }}</pre>
                  @if (e.link) { <a class="btn-small mt-2" [href]="e.link">Open the link</a> }
                </li>
              } @empty { <li class="text-muted">No emails yet.</li> }
            </ul>
          }
          @case ('activity') {
            <ul class="mt-6 divide-y divide-line rounded-xl border border-line text-sm" aria-label="Admin activity">
              @for (a of log(); track a.id) {
                <li class="flex flex-wrap justify-between gap-2 px-3 py-2"><span><strong>{{ a.admin_email }}</strong> · {{ a.action }} · {{ a.target_email }}</span><span class="text-muted">{{ when(a.created_at) }}</span></li>
              } @empty { <li class="px-3 py-4 text-muted">No admin actions yet.</li> }
            </ul>
          }
        }
      }
    </div>
  `,
})
export class AdminPage {
  protected readonly auth = inject(Auth);
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'emails', label: 'Emails' },
    { id: 'activity', label: 'Activity' },
  ];
  protected readonly filters = [
    { id: 'all', label: 'All users' },
    { id: 'verified', label: 'Email confirmed' },
    { id: 'unverified', label: 'Email not confirmed' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'admins', label: 'Admins' },
  ];
  protected readonly tab = signal<Tab>('overview');
  protected readonly stats = signal<Stats | null>(null);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly total = signal(0);
  protected readonly query = signal('');
  private readonly search = signal('');
  protected readonly filter = signal('all');
  protected readonly sort = signal('newest');
  protected readonly page = signal(1);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 20)));
  protected readonly selected = signal<Detail | null>(null);
  protected readonly emails = signal<Email[]>([]);
  protected readonly emailServiceOn = signal(false);
  protected readonly log = signal<{ id: number; action: string; created_at: number; admin_email: string; target_email: string }[]>([]);
  protected readonly error = signal('');
  protected readonly device = deviceName;
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly maxDay = computed(() => Math.max(1, ...(this.stats()?.signupsByDay ?? [1])));
  protected readonly cards = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { label: 'Total users', value: s.total, filter: 'all' },
      { label: 'New today', value: s.today, filter: 'all' },
      { label: 'New this week', value: s.week, filter: 'all' },
      { label: 'Active today', value: s.activeToday, filter: '' },
      { label: 'Email confirmed', value: s.verified, filter: 'verified' },
      { label: 'Not confirmed', value: s.total - s.verified, filter: 'unverified' },
      { label: 'Blocked', value: s.blocked, filter: 'blocked' },
      { label: 'Logged-in devices', value: s.activeSessions, filter: '' },
    ];
  });

  constructor() {
    // Load what the open tab needs once we know the user is an admin.
    effect(() => {
      const tab = this.tab();
      const admin = this.auth.user()?.role === 'admin';
      if (!admin) return;
      if (tab === 'users') {
        this.search();
        this.filter();
        this.sort();
        this.page();
      }
      untracked(() => void this.load(tab));
    });
  }

  protected open(tab: Tab): void {
    this.error.set('');
    this.tab.set(tab);
  }

  protected showUsers(filter: string): void {
    this.filter.set(filter);
    this.page.set(1);
    this.open('users');
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.search.set(value);
    }, 250);
  }

  private async load(tab: Tab): Promise<void> {
    try {
      if (tab === 'overview') this.stats.set(await this.auth.call<Stats>('GET', '/api/admin/stats'));
      if (tab === 'users') {
        const params = new URLSearchParams({ q: this.search(), filter: this.filter(), sort: this.sort(), page: String(this.page()), size: '20' });
        const data = await this.auth.call<{ users: AdminUser[]; total: number }>('GET', `/api/admin/users?${params}`);
        this.users.set(data.users);
        this.total.set(data.total);
      }
      if (tab === 'emails') {
        const data = await this.auth.call<{ emails: Email[]; emailServiceOn: boolean }>('GET', '/api/admin/outbox');
        this.emails.set(data.emails);
        this.emailServiceOn.set(data.emailServiceOn);
      }
      if (tab === 'activity') this.log.set((await this.auth.call<{ entries: [] }>('GET', '/api/admin/log')).entries);
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not load this section.');
    }
  }

  protected async select(id: string): Promise<void> {
    try {
      this.selected.set(await this.auth.call<Detail>('GET', `/api/admin/users/${id}`));
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'Could not open this user.');
    }
  }

  protected async block(user: AdminUser, blocked: boolean): Promise<void> {
    if (blocked && !confirm(`Block ${user.email}? They will be logged out and cannot log in until unblocked.`)) return;
    await this.act(user, `/api/admin/users/${user.id}/block`, { blocked });
  }

  protected async logoutUser(user: AdminUser): Promise<void> {
    await this.act(user, `/api/admin/users/${user.id}/logout`, {});
  }

  private async act(user: AdminUser, path: string, body: object): Promise<void> {
    try {
      await this.auth.call('POST', path, body);
      await this.select(user.id);
      await this.load('users');
    } catch (e) {
      this.error.set(e instanceof AccountError ? e.message : 'That did not work.');
    }
  }

  protected when(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  protected dayLabel(index: number): string {
    return new Date(Date.now() - (13 - index) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
