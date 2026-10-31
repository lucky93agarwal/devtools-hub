/** Unix permission bits as numbers (755), symbols (rwxr-xr-x) and chmod commands. */

export const WHO = ['owner', 'group', 'others'] as const;
export const WHAT = ['read', 'write', 'execute'] as const;
export const SPECIAL = ['setuid', 'setgid', 'sticky'] as const;

/** 12 bits: setuid, setgid, sticky, then rwx for owner, group and others. */
export type Mode = number;

export type ModeResult = { ok: true; mode: Mode } | { ok: false; error: string };

/** Reads 755, 0755, 4755, rwxr-xr-x, -rwxr-xr-x (as ls shows it) or rwsr-sr-t. */
export function parseMode(input: string): ModeResult {
  const text = input.trim();
  if (!text) return { ok: false, error: '' };
  if (/^0?[0-7]{3,4}$/.test(text.replace(/^0o/i, ''))) {
    return { ok: true, mode: parseInt(text.replace(/^0o/i, ''), 8) };
  }
  const symbolic = /^[-dlcbps]?([r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-])$/.exec(text);
  if (!symbolic) {
    return { ok: false, error: 'Enter a number such as 755 or 0644, or symbols such as rwxr-xr-x.' };
  }
  const s = symbolic[1];
  let mode = 0;
  for (let i = 0; i < 9; i++) if (s[i] !== '-' && s[i] !== 'S' && s[i] !== 'T') mode |= 1 << (8 - i);
  if (/[sS]/.test(s[2])) mode |= 0o4000;
  if (/[sS]/.test(s[5])) mode |= 0o2000;
  if (/[tT]/.test(s[8])) mode |= 0o1000;
  return { ok: true, mode };
}

export const toOctal = (mode: Mode) => (mode > 0o777 ? mode.toString(8).padStart(4, '0') : mode.toString(8).padStart(3, '0'));

export function toSymbolic(mode: Mode): string {
  let out = '';
  for (let i = 0; i < 9; i++) out += mode & (1 << (8 - i)) ? 'rwx'[i % 3] : '-';
  const special = (index: number, bit: number, lower: string) => {
    const has = (mode & (1 << (8 - index))) !== 0;
    if (mode & bit) out = out.slice(0, index) + (has ? lower : lower.toUpperCase()) + out.slice(index + 1);
  };
  special(2, 0o4000, 's');
  special(5, 0o2000, 's');
  special(8, 0o1000, 't');
  return out;
}

/** The u=,g=,o= form, which sets every class exactly. */
export function toSymbolicCommand(mode: Mode): string {
  return WHO.map((_, w) => {
    let perms = WHAT.map((_, i) => (hasBit(mode, w, i) ? 'rwx'[i] : '')).join('');
    if (w === 0 && mode & 0o4000) perms += 's';
    if (w === 1 && mode & 0o2000) perms += 's';
    if (w === 2 && mode & 0o1000) perms += 't';
    return `${'ugo'[w]}=${perms}`;
  }).join(',');
}

export const hasBit = (mode: Mode, who: number, what: number) => (mode & (1 << (8 - (who * 3 + what)))) !== 0;
export const toggleBit = (mode: Mode, who: number, what: number) => mode ^ (1 << (8 - (who * 3 + what)));
export const SPECIAL_BITS = [0o4000, 0o2000, 0o1000];

/** Plain-English summary, e.g. "The owner can read, write and run it. Others can read and run it." */
export function describe(mode: Mode): string[] {
  const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);
  const lines = WHO.map((who, w) => {
    const can = WHAT.filter((_, i) => hasBit(mode, w, i)).map((p) => (p === 'execute' ? 'run it (or open the folder)' : p));
    const name = who === 'owner' ? 'The owner' : who === 'group' ? 'The group' : 'Everyone else';
    return can.length ? `${name} can ${list(can)}.` : `${name} has no access.`;
  });
  if (mode & 0o4000) lines.push('setuid: the program runs with the owner’s rights.');
  if (mode & 0o2000) lines.push('setgid: runs with the group’s rights; new files in a folder get its group.');
  if (mode & 0o1000) lines.push('Sticky: in a shared folder, only a file’s owner can delete or rename it.');
  if (hasBit(mode, 2, 1)) lines.push('Warning: anyone on the system can change this file.');
  return lines;
}
