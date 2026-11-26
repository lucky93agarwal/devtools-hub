/**
 * A small evaluator for JasperReports expressions (Java / Groovy style): $F{}, $P{}, $V{}, strings,
 * numbers, + - * /, comparisons, && || !, ternaries, common String / Number methods,
 * new SimpleDateFormat("...").format(date), String.valueOf, String.format, Integer/Double parsing
 * and new java.util.Date(). Anything it does not understand throws, and callers show the expression.
 */

export type Value = string | number | boolean | Date | null | { sdf: string } | { numberFormat: 'currency' | 'number' | 'percent'; locale: string } | undefined;

export interface Scope {
  field(name: string): unknown;
  parameter(name: string): unknown;
  variable(name: string): unknown;
}

type Token = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; kind: 'F' | 'P' | 'V'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const ref = /^\$([FPV])\{([^}]*)\}/.exec(src.slice(i));
    if (ref) {
      tokens.push({ t: 'ref', kind: ref[1] as 'F' | 'P' | 'V', v: ref[2].trim() });
      i += ref[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[++j];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        } else out += src[j];
        j++;
      }
      if (j >= src.length) throw new Error('Unclosed string');
      tokens.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    const number = /^\d+(\.\d+)?[LlDdFf]?/.exec(src.slice(i));
    if (number) {
      tokens.push({ t: 'num', v: parseFloat(number[0]) });
      i += number[0].length;
      continue;
    }
    const id = /^[A-Za-z_][\w]*/.exec(src.slice(i));
    if (id) {
      tokens.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = /^(==|!=|<=|>=|&&|\|\||[-+*/%<>!?:().,])/.exec(src.slice(i));
    if (!op) throw new Error(`Unexpected "${c}"`);
    tokens.push({ t: 'op', v: op[0] });
    i += op[0].length;
  }
  return tokens;
}

const isNumber = (v: Value): v is number => typeof v === 'number';
const toText = (v: Value): string => (v === null || v === undefined ? 'null' : v instanceof Date ? v.toString() : typeof v === 'object' ? '' : String(v));
const truthy = (v: Value) => v === true || (typeof v === 'string' ? v === 'true' : !!v && typeof v !== 'object');

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Java SimpleDateFormat patterns (the common letters). */
export function formatDate(date: Date, pattern: string): string {
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return pattern.replace(/'([^']*)'|y+|M+|d+|H+|h+|m+|s+|S+|a|E+/g, (t, quoted) => {
    if (quoted !== undefined) return quoted;
    const n = t.length;
    switch (t[0]) {
      case 'y':
        return n === 2 ? pad(date.getFullYear() % 100, 2) : String(date.getFullYear());
      case 'M':
        return n >= 4 ? MONTHS[date.getMonth()] : n === 3 ? MONTHS[date.getMonth()].slice(0, 3) : pad(date.getMonth() + 1, n);
      case 'd':
        return pad(date.getDate(), n);
      case 'H':
        return pad(date.getHours(), n);
      case 'h':
        return pad(date.getHours() % 12 || 12, n);
      case 'm':
        return pad(date.getMinutes(), n);
      case 's':
        return pad(date.getSeconds(), n);
      case 'S':
        return pad(date.getMilliseconds(), 3).slice(0, n);
      case 'a':
        return date.getHours() < 12 ? 'AM' : 'PM';
      case 'E':
        return n >= 4 ? DAYS[date.getDay()] : DAYS[date.getDay()].slice(0, 3);
    }
    return t;
  });
}

/** Java DecimalFormat patterns such as "#,##0.00", "¤ #,##0.00", "0.0%", "₹#,##0". Indian grouping with locale en-IN. */
export function formatNumber(value: number, pattern: string): string {
  const percent = pattern.includes('%');
  const n = percent ? value * 100 : value;
  const decimals = (/\.([0#]+)/.exec(pattern)?.[1] ?? '').length;
  const minDecimals = (/\.(0+)/.exec(pattern)?.[1] ?? '').length;
  const grouped = pattern.includes(',');
  let text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals, useGrouping: grouped });
  const prefix = (/^[^#0,.]*/.exec(pattern)?.[0] ?? '').replace('¤', '₹');
  const suffix = (/[^#0,.%]*%?[^#0,.]*$/.exec(pattern)?.[0] ?? '').replace('¤', '₹');
  text = `${n < 0 ? '-' : ''}${prefix}${text}${suffix}`;
  return text;
}

export function evaluate(expression: string, scope: Scope): Value {
  const tokens = tokenize(expression);
  let pos = 0;
  /** Above 0 while reading a branch that is not taken (? :, &&, ||): parse only, do not run. */
  let skipping = 0;
  const peek = (v?: string) => tokens[pos] && (v === undefined || (tokens[pos].t === 'op' || tokens[pos].t === 'id') && (tokens[pos] as { v: string }).v === v);
  const take = (v: string) => {
    if (!peek(v)) throw new Error(`Expected "${v}"`);
    pos++;
  };

  const args = (): Value[] => {
    take('(');
    const out: Value[] = [];
    while (!peek(')')) {
      out.push(ternary());
      if (peek(',')) pos++;
      else break;
    }
    take(')');
    return out;
  };

  const callStatic = (name: string, a: Value[]): Value => {
    if (skipping) return null;
    const short = name.replace(/^java\.(lang|util|text|math)\./, '');
    switch (short) {
      case 'String.valueOf':
        return toText(a[0]);
      case 'String.format': {
        let i = 1;
        return String(a[0] ?? '').replace(/%(\.(\d+))?([sdf])/g, (_m, _p, prec, type) => {
          const v = a[i++];
          if (type === 'f') return isNumber(v) ? v.toFixed(prec ? Number(prec) : 6) : toText(v);
          if (type === 'd') return isNumber(v) ? String(Math.trunc(v)) : toText(v);
          return toText(v);
        });
      }
      case 'Integer.valueOf':
      case 'Integer.parseInt':
      case 'Long.valueOf':
      case 'Long.parseLong':
        return parseInt(toText(a[0]), 10);
      case 'Double.valueOf':
      case 'Double.parseDouble':
      case 'Float.parseFloat':
        return parseFloat(toText(a[0]));
      case 'Math.round':
        return Math.round(Number(a[0]));
      case 'Math.abs':
        return Math.abs(Number(a[0]));
      case 'Math.max':
        return Math.max(Number(a[0]), Number(a[1]));
      case 'Math.min':
        return Math.min(Number(a[0]), Number(a[1]));
      case 'NumberFormat.getCurrencyInstance':
        return { numberFormat: 'currency', locale: 'en-IN' };
      case 'NumberFormat.getNumberInstance':
      case 'NumberFormat.getInstance':
        return { numberFormat: 'number', locale: 'en-IN' };
      case 'NumberFormat.getPercentInstance':
        return { numberFormat: 'percent', locale: 'en-IN' };
    }
    throw new Error(`Unknown function ${name}`);
  };

  const construct = (name: string, a: Value[]): Value => {
    if (skipping) return null;
    const short = name.replace(/^java\.(lang|util|text|math)\./, '');
    if (short === 'SimpleDateFormat') return { sdf: toText(a[0]) };
    if (short === 'Date' || short === 'Timestamp') return a.length ? toDate(a[0]) : new Date();
    if (short === 'BigDecimal' || short === 'Double' || short === 'Integer' || short === 'Long') return Number(a[0]);
    if (short === 'String') return toText(a[0] ?? '');
    if (short === 'Locale') return null;
    throw new Error(`Unknown class ${name}`);
  };

  const method = (target: Value, name: string, a: Value[]): Value => {
    if (skipping) return null;
    if (target && typeof target === 'object' && 'sdf' in target) {
      if (name === 'format') {
        const d = toDate(a[0]);
        return d ? formatDate(d, target.sdf) : toText(a[0]);
      }
      if (name === 'parse') return toDate(a[0]);
    }
    if (target && typeof target === 'object' && 'numberFormat' in target && name === 'format') {
      const v = Number(a[0]);
      if (target.numberFormat === 'currency') return v.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
      if (target.numberFormat === 'percent') return `${Math.round(v * 100)}%`;
      return v.toLocaleString('en-IN');
    }
    if (target === null || target === undefined) throw new Error(`null.${name}()`);
    const s = toText(target);
    switch (name) {
      case 'toUpperCase':
        return s.toUpperCase();
      case 'toLowerCase':
        return s.toLowerCase();
      case 'trim':
        return s.trim();
      case 'length':
        return s.length;
      case 'isEmpty':
        return s.length === 0;
      case 'substring':
        return s.substring(Number(a[0]), a[1] === undefined ? undefined : Number(a[1]));
      case 'replace':
      case 'replaceAll':
        return s.split(toText(a[0])).join(toText(a[1]));
      case 'equals':
        return s === toText(a[0]);
      case 'equalsIgnoreCase':
        return s.toLowerCase() === toText(a[0]).toLowerCase();
      case 'contains':
        return s.includes(toText(a[0]));
      case 'startsWith':
        return s.startsWith(toText(a[0]));
      case 'endsWith':
        return s.endsWith(toText(a[0]));
      case 'toString':
        return s;
      case 'intValue':
      case 'longValue':
        return Math.trunc(Number(target));
      case 'doubleValue':
      case 'floatValue':
        return Number(target);
      case 'setScale':
        return Number(Number(target).toFixed(Number(a[0])));
      case 'compareTo': {
        const x = Number(target);
        const y = Number(a[0]);
        return x < y ? -1 : x > y ? 1 : 0;
      }
    }
    throw new Error(`Unknown method ${name}()`);
  };

  function primary(): Value {
    const token = tokens[pos];
    if (!token) throw new Error('Unexpected end');
    if (token.t === 'num' || token.t === 'str') {
      pos++;
      return token.v;
    }
    if (token.t === 'ref') {
      pos++;
      const raw = token.kind === 'F' ? scope.field(token.v) : token.kind === 'P' ? scope.parameter(token.v) : scope.variable(token.v);
      return raw as Value;
    }
    if (token.t === 'op' && token.v === '(') {
      pos++;
      // A cast like (String) or (java.lang.Integer) is skipped.
      const cast = /^(?:[a-z]+\.)*[A-Z]\w*$/;
      const save = pos;
      let name = '';
      while (tokens[pos] && (tokens[pos].t === 'id' || (tokens[pos].t === 'op' && (tokens[pos] as { v: string }).v === '.'))) name += (tokens[pos++] as { v: string }).v;
      if (name && cast.test(name) && peek(')')) {
        pos++;
        return postfix(primary());
      }
      pos = save;
      const v = ternary();
      take(')');
      return v;
    }
    if (token.t === 'op' && (token.v === '!' || token.v === '-')) throw new Error('unary');
    if (token.t === 'id') {
      if (token.v === 'null') return pos++, null;
      if (token.v === 'true' || token.v === 'false') return pos++, token.v === 'true';
      if (token.v === 'new') {
        pos++;
        let name = (tokens[pos++] as { v: string }).v;
        while (peek('.')) {
          pos++;
          name += '.' + (tokens[pos++] as { v: string }).v;
        }
        return construct(name, args());
      }
      // Qualified name: Class.method(...) or a.b.c
      let name = token.v;
      pos++;
      while (peek('.') && tokens[pos + 1]?.t === 'id') {
        const next = (tokens[pos + 1] as { v: string }).v;
        const afterNext = tokens[pos + 2];
        name += '.' + next;
        pos += 2;
        if (afterNext && afterNext.t === 'op' && afterNext.v === '(') return callStatic(name, args());
      }
      throw new Error(`Unknown name ${name}`);
    }
    throw new Error(`Unexpected "${(token as { v: unknown }).v}"`);
  }

  function postfix(value: Value): Value {
    while (peek('.')) {
      pos++;
      const name = (tokens[pos++] as { v: string }).v;
      value = method(value, name, peek('(') ? args() : []);
    }
    return value;
  }

  function unary(): Value {
    if (peek('!')) {
      pos++;
      return !truthy(unary());
    }
    if (peek('-')) {
      pos++;
      return -Number(unary());
    }
    return postfix(primary());
  }

  function mul(): Value {
    let v = unary();
    while (peek('*') || peek('/') || peek('%')) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = unary();
      v = op === '*' ? Number(v) * Number(r) : op === '/' ? Number(v) / Number(r) : Number(v) % Number(r);
    }
    return v;
  }

  function add(): Value {
    let v = mul();
    while (peek('+') || peek('-')) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = mul();
      if (op === '+') v = isNumber(v) && isNumber(r) ? v + r : toText(v) + toText(r);
      else v = Number(v) - Number(r);
    }
    return v;
  }

  function rel(): Value {
    let v = add();
    while (peek('<') || peek('>') || peek('<=') || peek('>=')) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = add();
      const a = Number(v);
      const b = Number(r);
      v = op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    return v;
  }

  function eq(): Value {
    let v = rel();
    while (peek('==') || peek('!=')) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = rel();
      const same = v === r || (v !== null && r !== null && v !== undefined && r !== undefined && toText(v) === toText(r) && typeof v === typeof r);
      v = op === '==' ? same : !same;
    }
    return v;
  }

  function and(): Value {
    let v = eq();
    while (peek('&&')) {
      pos++;
      const left = truthy(v);
      if (!left) skipping++;
      const r = eq();
      if (!left) skipping--;
      v = left && truthy(r);
    }
    return v;
  }

  function or(): Value {
    let v = and();
    while (peek('||')) {
      pos++;
      const left = truthy(v);
      if (left) skipping++;
      const r = and();
      if (left) skipping--;
      v = left || truthy(r);
    }
    return v;
  }

  function ternary(): Value {
    const condition = or();
    if (!peek('?')) return condition;
    pos++;
    const yes = truthy(condition);
    if (!yes) skipping++;
    const a = ternary();
    if (!yes) skipping--;
    take(':');
    if (yes) skipping++;
    const b = ternary();
    if (yes) skipping--;
    return yes ? a : b;
  }

  const result = ternary();
  if (pos < tokens.length) throw new Error(`Unexpected "${(tokens[pos] as { v: unknown }).v}"`);
  return result;
}

/** Display text for a value, with the textField's pattern when there is one. */
export function display(value: Value, pattern = ''): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value, pattern || 'dd/MM/yyyy');
  if (typeof value === 'number') return pattern ? formatNumber(value, pattern) : String(Number.isInteger(value) ? value : Math.round(value * 100) / 100);
  if (typeof value === 'string' && pattern) {
    const d = toDate(value);
    if (d && /[yMdHhms]/.test(pattern)) return formatDate(d, pattern);
    if (/^-?\d+(\.\d+)?$/.test(value) && /[#0]/.test(pattern)) return formatNumber(Number(value), pattern);
  }
  if (typeof value === 'object') return '';
  return String(value);
}
