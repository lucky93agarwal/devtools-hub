/**
 * Realistic fake records from one sample record or a JSON Schema. Values follow the field names
 * (email, phone, city, price, createdAt…) and a seed makes the same data come out every time.
 */

/** mulberry32: small, fast and good enough for test data. Not for anything secret. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const int = (r: Rand, min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;

const FIRST = ['Aarav', 'Ananya', 'Vivaan', 'Diya', 'Arjun', 'Isha', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Ada', 'Liam', 'Sofia', 'Noah', 'Emma', 'Lucas', 'Mia', 'Yuki', 'Omar', 'Zara'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Reddy', 'Gupta', 'Khan', 'Singh', 'Nair', 'Mehta', 'Das', 'Lovelace', 'Smith', 'Garcia', 'Müller', 'Rossi', 'Tanaka', 'Silva', 'Brown', 'Kim', 'Haddad'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Chennai', 'Hyderabad', 'Kolkata', 'Jaipur', 'Ahmedabad', 'Lucknow', 'London', 'New York', 'Berlin', 'Singapore', 'Tokyo', 'Dubai', 'Sydney', 'Toronto'];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore', 'Japan', 'United Arab Emirates', 'Australia', 'Canada'];
const STREETS = ['MG Road', 'Park Street', 'Linking Road', 'Brigade Road', 'Main Street', 'High Street', 'Station Road', 'Lake View', 'Church Street', 'Hill Road'];
const COMPANIES = ['Acme Labs', 'Globex', 'Initech', 'Umbrella Tech', 'Stark Industries', 'Wayne Systems', 'Hooli', 'Pied Piper', 'Vandelay', 'Soylent'];
const PRODUCTS = ['Notebook', 'Wireless Mouse', 'Desk Lamp', 'Water Bottle', 'Backpack', 'Headphones', 'Coffee Mug', 'Phone Stand', 'Keyboard', 'Plant Pot'];
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis nostrud'.split(' ');
const DOMAINS = ['example.com', 'example.org', 'mail.test', 'company.test'];
const COLORS = ['red', 'blue', 'green', 'black', 'white', 'orange', 'purple', 'teal'];

const sentence = (r: Rand, words = int(r, 6, 14)) => {
  const text = Array.from({ length: words }, () => pick(r, WORDS)).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
};
const hex = (r: Rand, n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(r, 0, 15)]).join('');
const uuid = (r: Rand) => `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-${'89ab'[int(r, 0, 3)]}${hex(r, 3)}-${hex(r, 12)}`;
const slug = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.');
/** A date within the last two years, at a fixed point so a seed always gives the same dates. */
const dateMs = (r: Rand) => Date.UTC(2026, 9, 1) - Math.floor(r() * 2 * 365 * 86400000);

interface Context {
  r: Rand;
  index: number;
  /** A person picked once per record, so name, email and username agree. */
  person: { first: string; last: string };
}

/** A value for a string field, chosen by its name; null when the name gives no hint. */
function byName(key: string, ctx: Context): string | number | null {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const { r, person } = ctx;
  if (/^(first|given)name$/.test(k)) return person.first;
  if (/^(last|family|sur)name$/.test(k)) return person.last;
  if (/^(full)?name$|^(customer|user|author|owner|contact)name$/.test(k)) return `${person.first} ${person.last}`;
  if (/user(name)?$|handle|login/.test(k)) return `${slug(person.first)}${int(r, 1, 999)}`;
  if (/email/.test(k)) return `${slug(person.first)}.${slug(person.last)}@${pick(r, DOMAINS)}`;
  if (/phone|mobile|tel/.test(k)) return `+91 ${int(r, 6, 9)}${String(int(r, 0, 999999999)).padStart(9, '0')}`;
  if (/city|town/.test(k)) return pick(r, CITIES);
  if (/country/.test(k)) return pick(r, COUNTRIES);
  if (/(address|street)/.test(k)) return `${int(r, 1, 250)}, ${pick(r, STREETS)}`;
  if (/(zip|postal|pin)(code)?$/.test(k)) return String(int(r, 110001, 855999));
  if (/company|organi[sz]ation|employer/.test(k)) return pick(r, COMPANIES);
  if (/product|item/.test(k) && !/id$/.test(k)) return pick(r, PRODUCTS);
  if (/url|website|link|homepage/.test(k)) return `https://${pick(r, DOMAINS)}/${hex(r, 6)}`;
  if (/avatar|image|photo|picture|thumbnail/.test(k)) return `https://picsum.photos/seed/${hex(r, 6)}/200`;
  if (/colou?r/.test(k)) return pick(r, COLORS);
  if (/uuid|guid/.test(k)) return uuid(r);
  if (/^ip(address)?$|ipv4/.test(k)) return `${int(r, 1, 223)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`;
  if (/currency/.test(k)) return pick(r, ['INR', 'USD', 'EUR', 'GBP']);
  if (/(date|time|at|on)$|^dob$|birth/.test(k)) {
    const iso = new Date(dateMs(r)).toISOString();
    return /dob|birth/.test(k) ? `${int(r, 1960, 2006)}-${String(int(r, 1, 12)).padStart(2, '0')}-${String(int(r, 1, 28)).padStart(2, '0')}` : /date$/.test(k) ? iso.slice(0, 10) : iso;
  }
  if (/description|bio|about|summary|comment|note|message|body|text/.test(k)) return sentence(r);
  if (/title|subject|headline/.test(k)) return sentence(r, int(r, 3, 6)).slice(0, -1);
  if (/password|secret|token|key$/.test(k)) return hex(r, 24);
  return null;
}

function numberFor(key: string, sample: number, ctx: Context): number {
  const k = key.toLowerCase();
  const { r } = ctx;
  if (/^id$|_id$|id$/.test(k) && Number.isInteger(sample)) return ctx.index + 1;
  if (/age/.test(k)) return int(r, 18, 75);
  if (/lat/.test(k)) return Number((r() * 160 - 80).toFixed(6));
  if (/lng|lon/.test(k)) return Number((r() * 360 - 180).toFixed(6));
  if (/rating|stars|score/.test(k) && sample <= 5) return Number((int(r, 10, 50) / 10).toFixed(1));
  if (/year/.test(k)) return int(r, 2015, 2026);
  // Otherwise stay near the sample's size and keep whole numbers whole.
  const scale = Math.max(1, Math.abs(sample) * 2);
  const value = r() * scale;
  return Number.isInteger(sample) ? Math.round(value) : Number(value.toFixed(2));
}

/** One fake record shaped like the sample. */
export function fromSample(sample: unknown, ctx: Context, key = ''): unknown {
  if (Array.isArray(sample)) {
    if (!sample.length) return [];
    return Array.from({ length: int(ctx.r, 1, Math.max(3, sample.length)) }, () => fromSample(sample[0], ctx, key));
  }
  if (sample && typeof sample === 'object') {
    return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, fromSample(v, ctx, k)]));
  }
  if (typeof sample === 'boolean') return ctx.r() < 0.5;
  if (typeof sample === 'number') return numberFor(key, sample, ctx);
  if (typeof sample === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(sample)) return uuid(ctx.r);
    if (/^\d{4}-\d{2}-\d{2}T/.test(sample)) return new Date(dateMs(ctx.r)).toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return new Date(dateMs(ctx.r)).toISOString().slice(0, 10);
    const named = byName(key, ctx);
    if (named !== null) return named;
    // Short single words are usually categories or statuses: keep the sample's value.
    if (/^[\w-]{1,20}$/.test(sample)) return sample;
    return sentence(ctx.r, Math.max(2, Math.min(14, sample.split(/\s+/).length)));
  }
  return sample;
}

interface Schema {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
}

/** One fake record that follows a JSON Schema (draft 7 and later, the common keywords). */
export function fromSchema(schema: Schema, ctx: Context, key = ''): unknown {
  const { r } = ctx;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return pick(r, schema.enum);
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : (schema.type ?? (schema.properties ? 'object' : schema.items ? 'array' : 'string'));
  switch (type) {
    case 'object':
      return Object.fromEntries(
        Object.entries(schema.properties ?? {})
          // Optional properties are left out now and then, as in real data.
          .filter(([name]) => schema.required?.includes(name) || r() < 0.85)
          .map(([name, sub]) => [name, fromSchema(sub, ctx, name)]),
      );
    case 'array':
      return Array.from({ length: int(r, schema.minItems ?? 1, schema.maxItems ?? Math.max(3, schema.minItems ?? 1)) }, () =>
        fromSchema(schema.items ?? {}, ctx, key),
      );
    case 'integer':
    case 'number': {
      const min = schema.minimum ?? (/id$/i.test(key) ? 1 : 0);
      const max = schema.maximum ?? Math.max(min + 100, min * 2);
      if (/^id$|id$/i.test(key) && schema.minimum === undefined && schema.maximum === undefined) return ctx.index + 1;
      return type === 'integer' ? int(r, Math.ceil(min), Math.floor(max)) : Number((min + r() * (max - min)).toFixed(2));
    }
    case 'boolean':
      return r() < 0.5;
    case 'null':
      return null;
    default: {
      const formats: Record<string, () => string> = {
        email: () => `${slug(ctx.person.first)}.${slug(ctx.person.last)}@${pick(r, DOMAINS)}`,
        uuid: () => uuid(r),
        'date-time': () => new Date(dateMs(r)).toISOString(),
        date: () => new Date(dateMs(r)).toISOString().slice(0, 10),
        uri: () => `https://${pick(r, DOMAINS)}/${hex(r, 6)}`,
        ipv4: () => `${int(r, 1, 223)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`,
        hostname: () => `${hex(r, 6)}.${pick(r, DOMAINS)}`,
      };
      let text = String(formats[schema.format ?? '']?.() ?? byName(key, ctx) ?? schema.examples?.[0] ?? schema.example ?? sentence(r, int(r, 2, 5)).slice(0, -1));
      if (schema.maxLength !== undefined) text = text.slice(0, schema.maxLength);
      if (schema.minLength !== undefined) text = text.padEnd(schema.minLength, 'x');
      return text;
    }
  }
}

export type MockSource = { kind: 'sample'; value: unknown } | { kind: 'schema'; value: Schema };

export function generate(source: MockSource, count: number, seed: number): unknown[] {
  const r = rng(seed);
  const template = source.kind === 'sample' && Array.isArray(source.value) ? source.value[0] : source.value;
  return Array.from({ length: count }, (_, index) => {
    const ctx: Context = { r, index, person: { first: pick(r, FIRST), last: pick(r, LAST) } };
    return source.kind === 'schema' ? fromSchema(template as Schema, ctx) : fromSample(template, ctx);
  });
}

/** Is this a JSON Schema rather than a sample record? */
export function looksLikeSchema(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v['$schema'] === 'string' || (v['type'] === 'object' && typeof v['properties'] === 'object');
}

/** Nested fields become dotted column names; arrays and objects inside are written as JSON. */
function flatten(record: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    for (const [k, v] of Object.entries(record)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, `${prefix}${k}.`, out);
      else out[`${prefix}${k}`] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
  } else out[prefix.replace(/\.$/, '') || 'value'] = record;
  return out;
}

export type MockFormat = 'json' | 'ndjson' | 'csv' | 'sql';

export function formatRecords(records: unknown[], format: MockFormat, table = 'items'): string {
  if (format === 'json') return JSON.stringify(records, null, 2) + '\n';
  if (format === 'ndjson') return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const rows = records.map((r) => flatten(r));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (format === 'csv') {
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\n') + '\n';
  }
  const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const literal = (v: unknown) =>
    v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`;
  return (
    rows.map((row) => `INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')}) VALUES (${columns.map((c) => literal(row[c])).join(', ')});`).join('\n') + '\n'
  );
}
