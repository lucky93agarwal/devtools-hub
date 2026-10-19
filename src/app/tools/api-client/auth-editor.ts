import { Component, computed, input, output, signal } from '@angular/core';
import { ASAP_ALGORITHMS, AUTH_TYPES, Auth, AuthType, JWT_ALGORITHMS, defaultAuth } from './auth';

type FieldKind = 'text' | 'secret' | 'select' | 'textarea' | 'checkbox' | 'number';

interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly (string | { value: string; label: string })[];
  placeholder?: string;
  /** Shown only when this returns true. */
  when?: (auth: Record<string, unknown>) => boolean;
}

const isHmac = (auth: Record<string, unknown>) => String(auth['algorithm']).startsWith('HS');
const addTo = [
  { value: 'header', label: 'Request headers' },
  { value: 'query', label: 'Query params' },
];

/** The fields each type asks for, in Postman's order. */
const FIELDS: Partial<Record<AuthType, Field[]>> = {
  basic: [
    { key: 'username', label: 'Username', kind: 'text' },
    { key: 'password', label: 'Password', kind: 'secret' },
  ],
  bearer: [{ key: 'token', label: 'Token', kind: 'secret' }],
  jwt: [
    { key: 'algorithm', label: 'Algorithm', kind: 'select', options: JWT_ALGORITHMS },
    { key: 'secret', label: 'Secret', kind: 'secret', when: isHmac },
    { key: 'secretBase64', label: 'Secret is Base64 encoded', kind: 'checkbox', when: isHmac },
    { key: 'privateKey', label: 'Private key (PEM, PKCS #8)', kind: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----', when: (a) => !isHmac(a) },
    { key: 'payload', label: 'Payload (JSON)', kind: 'textarea' },
    { key: 'header', label: 'Extra JWT headers (JSON)', kind: 'textarea' },
    { key: 'addTo', label: 'Add JWT token to', kind: 'select', options: addTo },
    { key: 'prefix', label: 'Header prefix', kind: 'text', when: (a) => a['addTo'] === 'header' },
    { key: 'queryKey', label: 'Query param name', kind: 'text', when: (a) => a['addTo'] === 'query' },
  ],
  digest: [
    { key: 'username', label: 'Username', kind: 'text' },
    { key: 'password', label: 'Password', kind: 'secret' },
    { key: 'realm', label: 'Realm', kind: 'text', placeholder: 'From the WWW-Authenticate header' },
    { key: 'nonce', label: 'Nonce', kind: 'text', placeholder: 'From the WWW-Authenticate header' },
    { key: 'algorithm', label: 'Algorithm', kind: 'select', options: ['MD5', 'MD5-sess', 'SHA-256', 'SHA-256-sess'] },
    { key: 'qop', label: 'qop', kind: 'select', options: [{ value: 'auth', label: 'auth' }, { value: 'auth-int', label: 'auth-int' }, { value: '', label: 'none' }] },
    { key: 'nonceCount', label: 'Nonce count', kind: 'text' },
    { key: 'clientNonce', label: 'Client nonce', kind: 'text', placeholder: 'Random if empty' },
    { key: 'opaque', label: 'Opaque', kind: 'text' },
  ],
  oauth1: [
    { key: 'signatureMethod', label: 'Signature method', kind: 'select', options: ['HMAC-SHA1', 'HMAC-SHA256', 'HMAC-SHA512', 'PLAINTEXT'] },
    { key: 'consumerKey', label: 'Consumer key', kind: 'text' },
    { key: 'consumerSecret', label: 'Consumer secret', kind: 'secret' },
    { key: 'token', label: 'Access token', kind: 'text' },
    { key: 'tokenSecret', label: 'Token secret', kind: 'secret' },
    { key: 'realm', label: 'Realm', kind: 'text' },
    { key: 'addTo', label: 'Add auth data to', kind: 'select', options: addTo },
  ],
  oauth2: [
    { key: 'accessToken', label: 'Access token', kind: 'secret' },
    { key: 'headerPrefix', label: 'Header prefix', kind: 'text', when: (a) => a['addTo'] === 'header' },
    { key: 'addTo', label: 'Add token to', kind: 'select', options: addTo },
  ],
  hawk: [
    { key: 'authId', label: 'Hawk auth ID', kind: 'text' },
    { key: 'authKey', label: 'Hawk auth key', kind: 'secret' },
    { key: 'algorithm', label: 'Algorithm', kind: 'select', options: ['sha256', 'sha1'] },
    { key: 'user', label: 'User', kind: 'text' },
    { key: 'ext', label: 'ext', kind: 'text' },
    { key: 'app', label: 'app', kind: 'text' },
    { key: 'dlg', label: 'dlg', kind: 'text' },
    { key: 'includePayloadHash', label: 'Include payload hash', kind: 'checkbox' },
  ],
  aws: [
    { key: 'accessKey', label: 'Access key', kind: 'text' },
    { key: 'secretKey', label: 'Secret key', kind: 'secret' },
    { key: 'region', label: 'AWS region', kind: 'text', placeholder: 'us-east-1' },
    { key: 'service', label: 'Service name', kind: 'text', placeholder: 'execute-api' },
    { key: 'sessionToken', label: 'Session token', kind: 'secret' },
  ],
  ntlm: [
    { key: 'username', label: 'Username', kind: 'text' },
    { key: 'password', label: 'Password', kind: 'secret' },
    { key: 'domain', label: 'Domain', kind: 'text' },
    { key: 'workstation', label: 'Workstation', kind: 'text' },
  ],
  'api-key': [
    { key: 'key', label: 'Key', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'secret' },
    { key: 'addTo', label: 'Add to', kind: 'select', options: addTo },
  ],
  edgegrid: [
    { key: 'accessToken', label: 'Access token', kind: 'text' },
    { key: 'clientToken', label: 'Client token', kind: 'text' },
    { key: 'clientSecret', label: 'Client secret', kind: 'secret' },
    { key: 'headersToSign', label: 'Headers to sign', kind: 'text', placeholder: 'Comma-separated, usually empty' },
  ],
  asap: [
    { key: 'algorithm', label: 'Algorithm', kind: 'select', options: ASAP_ALGORITHMS },
    { key: 'issuer', label: 'Issuer', kind: 'text' },
    { key: 'subject', label: 'Subject', kind: 'text', placeholder: 'Same as the issuer if empty' },
    { key: 'audience', label: 'Audience', kind: 'text', placeholder: 'Comma-separated for several' },
    { key: 'keyId', label: 'Key ID (kid)', kind: 'text' },
    { key: 'privateKey', label: 'Private key (PEM, PKCS #8)', kind: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----' },
    { key: 'claims', label: 'Additional claims (JSON)', kind: 'textarea' },
    { key: 'expiresIn', label: 'Expires in (seconds)', kind: 'number' },
  ],
};

/** A short note shown under some types. */
const NOTES: Partial<Record<AuthType, string>> = {
  jwt: 'The token is signed in your browser each time you send, with a fresh iat if your payload has none.',
  digest:
    'Browsers hide the server\'s 401 challenge from web pages, so copy the realm and nonce from its WWW-Authenticate header (for example from curl -i). The response is then worked out here.',
  oauth1: 'The signature, timestamp and nonce are made fresh each time you send.',
  hawk: 'The Hawk header is signed each time you send.',
  aws: 'The request is signed with AWS Signature Version 4 each time you send.',
  ntlm: 'NTLM needs a handshake on the network connection itself, which browsers do not let web pages do. You can keep these settings for Postman export; to send, use Postman or curl --ntlm.',
  edgegrid: 'Use the values from your .edgerc file. The request is signed each time you send.',
  asap: 'A signed ASAP token (JWT) is made each time you send and sent as a Bearer token.',
};

/**
 * Settings for one auth type, laid out from the field list above. The parent
 * owns the auth; every change comes back through authChange.
 */
@Component({
  selector: 'app-auth-editor',
  template: `
    <div class="grid gap-4 text-sm leading-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      <label class="flex flex-col gap-1">
        <span class="font-semibold text-muted">Auth Type</span>
        <select
          class="rounded-xl border border-line bg-page px-3 py-2"
          aria-label="Auth Type"
          (change)="setType($any($event.target).value)"
        >
          @for (type of types(); track type.type) {
            <option [value]="type.type" [selected]="auth().type === type.type">{{ type.label }}</option>
          }
        </select>
      </label>

      <div class="flex min-w-0 flex-col gap-3">
        @switch (auth().type) {
          @case ('inherit') {
            <p class="text-muted">
              @if (inheritedSummary(); as summary) {
                This request uses <strong class="text-ink">{{ summary }}</strong>.
              } @else {
                This request uses the auth of its folder or collection. It is not saved in a collection with auth, so
                no auth is sent.
              }
            </p>
          }
          @case ('none') {
            <p class="text-muted">This request does not use any authorization.</p>
          }
          @default {
            @for (field of fields(); track field.key) {
              @switch (field.kind) {
                @case ('checkbox') {
                  <label class="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      class="size-4 accent-brand"
                      [checked]="$any(value(field.key))"
                      (change)="set(field.key, $any($event.target).checked)"
                    />
                    {{ field.label }}
                  </label>
                }
                @case ('select') {
                  <label class="grid items-center gap-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
                    <span class="font-semibold">{{ field.label }}</span>
                    <select
                      class="rounded-xl border border-line bg-page px-3 py-2"
                      [attr.aria-label]="field.label"
                      (change)="set(field.key, $any($event.target).value)"
                    >
                      @for (option of field.options; track $index) {
                        <option [value]="optionValue(option)" [selected]="value(field.key) === optionValue(option)">
                          {{ optionLabel(option) }}
                        </option>
                      }
                    </select>
                  </label>
                }
                @case ('textarea') {
                  <label class="flex flex-col gap-1">
                    <span class="font-semibold">{{ field.label }}</span>
                    <textarea
                      rows="4"
                      class="rounded-xl border border-line bg-page px-3 py-2 font-mono text-[13px]"
                      spellcheck="false"
                      [attr.aria-label]="field.label"
                      [placeholder]="field.placeholder ?? ''"
                      [value]="value(field.key)"
                      (input)="set(field.key, $any($event.target).value)"
                    ></textarea>
                  </label>
                }
                @default {
                  <label class="grid items-center gap-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
                    <span class="font-semibold">{{ field.label }}</span>
                    <span class="flex min-w-0 items-center rounded-xl border border-line bg-page focus-within:border-brand">
                      <input
                        class="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
                        autocomplete="off"
                        spellcheck="false"
                        [attr.aria-label]="field.label"
                        [type]="field.kind === 'secret' && !revealed().has(field.key) ? 'password' : field.kind === 'number' ? 'number' : 'text'"
                        [placeholder]="field.placeholder ?? ''"
                        [value]="value(field.key)"
                        (input)="set(field.key, field.kind === 'number' ? $any($event.target).valueAsNumber : $any($event.target).value)"
                      />
                      @if (field.kind === 'secret') {
                        <button
                          type="button"
                          class="px-3 text-muted hover:text-ink"
                          [attr.aria-label]="(revealed().has(field.key) ? 'Hide ' : 'Show ') + field.label"
                          (click)="toggleReveal(field.key)"
                        >
                          {{ revealed().has(field.key) ? 'Hide' : 'Show' }}
                        </button>
                      }
                    </span>
                  </label>
                }
              }
            }
            @if (note(); as text) {
              <p class="text-xs leading-5 text-muted">{{ text }}</p>
            }
            @if (auth().type === 'oauth2') {
              <ng-content />
            }
          }
        }
      </div>
    </div>
  `,
})
export class AuthEditor {
  readonly auth = input.required<Auth>();
  /** "Bearer Token from My collection", when this request inherits. */
  readonly inheritedSummary = input<string | null>(null);
  /** Collections and folders cannot inherit. */
  readonly allowInherit = input(true);
  readonly authChange = output<Auth>();

  protected readonly types = computed(() => AUTH_TYPES.filter((t) => this.allowInherit() || t.type !== 'inherit'));
  protected readonly fields = computed(() => {
    const auth = this.auth() as unknown as Record<string, unknown>;
    return (FIELDS[this.auth().type] ?? []).filter((field) => !field.when || field.when(auth));
  });
  protected readonly note = computed(() => NOTES[this.auth().type] ?? null);
  /** Secret fields shown in plain text. */
  protected readonly revealed = signal(new Set<string>());

  protected value(key: string): unknown {
    return (this.auth() as unknown as Record<string, unknown>)[key] ?? '';
  }

  protected set(key: string, value: unknown): void {
    this.authChange.emit({ ...this.auth(), [key]: value } as Auth);
  }

  protected setType(type: AuthType): void {
    if (type !== this.auth().type) this.authChange.emit(defaultAuth(type));
  }

  protected toggleReveal(key: string): void {
    const next = new Set(this.revealed());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.revealed.set(next);
  }

  protected optionValue(option: string | { value: string; label: string }): string {
    return typeof option === 'string' ? option : option.value;
  }

  protected optionLabel(option: string | { value: string; label: string }): string {
    return typeof option === 'string' ? option : option.label;
  }
}
