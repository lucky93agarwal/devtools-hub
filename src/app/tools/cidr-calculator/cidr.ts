/** IPv4 and IPv6 CIDR blocks: ranges, masks, address types, membership and subnets. Addresses are BigInts. */

export type Family = 4 | 6;

export interface Block {
  family: Family;
  /** The address as typed, before masking. */
  address: bigint;
  prefix: number;
  network: bigint;
  last: bigint;
}

export type BlockResult = { ok: true; block: Block } | { ok: false; error: string };

const bitsOf = (family: Family) => (family === 4 ? 32 : 128);

export function parseIpv4(text: string): bigint | null {
  const parts = text.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8n) | BigInt(p), 0n);
}

export function parseIpv6(text: string): bigint | null {
  let source = text.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  // An IPv4 tail, as in ::ffff:192.0.2.1, becomes two hex groups.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(source);
  if (v4) {
    const value = parseIpv4(v4[1]);
    if (value === null) return null;
    source = source.slice(0, v4.index) + `${(value >> 16n).toString(16)}:${(value & 0xffffn).toString(16)}`;
  }
  const halves = source.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(`0x${g}`), 0n);
}

export function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join('.');
}

/** RFC 5952 short form: lowercase, no leading zeros, the longest run of zero groups as ::. */
export function formatIpv6(value: bigint, expanded = false): string {
  const groups = Array.from({ length: 8 }, (_, i) => (value >> BigInt(112 - i * 16)) & 0xffffn);
  if (expanded) return groups.map((g) => g.toString(16).padStart(4, '0')).join(':');
  let best = { start: -1, length: 1 };
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0n) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0n) j++;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (best.start < 0) return hex.join(':');
  return `${hex.slice(0, best.start).join(':')}::${hex.slice(best.start + best.length).join(':')}`;
}

export const formatAddress = (value: bigint, family: Family) => (family === 4 ? formatIpv4(value) : formatIpv6(value));

export const maskOf = (prefix: number, family: Family) => {
  const bits = BigInt(bitsOf(family));
  return ((1n << bits) - 1n) ^ ((1n << (bits - BigInt(prefix))) - 1n);
};

/** Reads 10.0.0.0/16, 192.168.1.10 255.255.255.0, 2001:db8::/32, or a single address (/32 or /128). */
export function parseBlock(input: string): BlockResult {
  const text = input.trim();
  if (!text) return { ok: false, error: '' };
  const [addressText, maskText] = text.split(/\s*\/\s*|\s+/);
  const family: Family | null = addressText.includes(':') ? 6 : addressText.includes('.') ? 4 : null;
  const address = family === 6 ? parseIpv6(addressText) : family === 4 ? parseIpv4(addressText) : null;
  if (family === null || address === null) {
    return { ok: false, error: `“${addressText}” is not an IPv4 or IPv6 address.` };
  }
  const bits = bitsOf(family);
  let prefix = bits;
  if (maskText !== undefined) {
    if (/^\d+$/.test(maskText) && Number(maskText) <= bits) prefix = Number(maskText);
    else if (family === 4 && parseIpv4(maskText) !== null) {
      const mask = parseIpv4(maskText)!;
      const ones = mask.toString(2).replace(/0+$/, '');
      if (mask !== 0n && (ones.includes('0') || ones.length === 0)) {
        return { ok: false, error: `${maskText} is not a valid subnet mask: its 1 bits must come first.` };
      }
      prefix = mask === 0n ? 0 : ones.length;
    } else return { ok: false, error: `The prefix must be a number from 0 to ${bits}.` };
  }
  const mask = maskOf(prefix, family);
  const network = address & mask;
  const last = network | (((1n << BigInt(bits)) - 1n) ^ mask);
  return { ok: true, block: { family, address, prefix, network, last } };
}

export const blockSize = (block: Block) => block.last - block.network + 1n;

/** Usable host addresses: IPv4 loses the network and broadcast address except in /31 and /32. */
export function hostRange(block: Block): { first: bigint; last: bigint; count: bigint } {
  if (block.family === 4 && block.prefix < 31) {
    return { first: block.network + 1n, last: block.last - 1n, count: blockSize(block) - 2n };
  }
  return { first: block.network, last: block.last, count: blockSize(block) };
}

const RANGES: { family: Family; cidr: string; label: string }[] = [
  { family: 4, cidr: '10.0.0.0/8', label: 'Private network (RFC 1918)' },
  { family: 4, cidr: '172.16.0.0/12', label: 'Private network (RFC 1918)' },
  { family: 4, cidr: '192.168.0.0/16', label: 'Private network (RFC 1918)' },
  { family: 4, cidr: '100.64.0.0/10', label: 'Carrier-grade NAT (RFC 6598)' },
  { family: 4, cidr: '127.0.0.0/8', label: 'Loopback' },
  { family: 4, cidr: '169.254.0.0/16', label: 'Link-local' },
  { family: 4, cidr: '192.0.2.0/24', label: 'Documentation (TEST-NET-1)' },
  { family: 4, cidr: '198.51.100.0/24', label: 'Documentation (TEST-NET-2)' },
  { family: 4, cidr: '203.0.113.0/24', label: 'Documentation (TEST-NET-3)' },
  { family: 4, cidr: '224.0.0.0/4', label: 'Multicast' },
  { family: 4, cidr: '0.0.0.0/8', label: '“This network”' },
  { family: 4, cidr: '240.0.0.0/4', label: 'Reserved' },
  { family: 6, cidr: '::1/128', label: 'Loopback' },
  { family: 6, cidr: '::/128', label: 'Unspecified' },
  { family: 6, cidr: '::ffff:0:0/96', label: 'IPv4-mapped address' },
  { family: 6, cidr: 'fc00::/7', label: 'Unique local address (private)' },
  { family: 6, cidr: 'fe80::/10', label: 'Link-local' },
  { family: 6, cidr: '2001:db8::/32', label: 'Documentation' },
  { family: 6, cidr: 'ff00::/8', label: 'Multicast' },
  { family: 6, cidr: '2000::/3', label: 'Global unicast (public)' },
];

/** What kind of block this is: private, loopback and so on, or public. */
export function addressType(block: Block): string {
  for (const range of RANGES) {
    if (range.family !== block.family) continue;
    const r = (parseBlock(range.cidr) as { ok: true; block: Block }).block;
    if (block.network >= r.network && block.last <= r.last) return range.label;
  }
  return block.family === 4 ? 'Public' : 'Other';
}

export function contains(block: Block, address: string): boolean | null {
  const value = block.family === 4 ? parseIpv4(address.trim()) : parseIpv6(address.trim());
  return value === null ? null : value >= block.network && value <= block.last;
}

/** The first `limit` subnets of `newPrefix` inside the block. */
export function subnets(block: Block, newPrefix: number, limit = 256): { total: bigint; list: Block[] } {
  const bits = bitsOf(block.family);
  if (newPrefix < block.prefix || newPrefix > bits) return { total: 0n, list: [] };
  const total = 1n << BigInt(newPrefix - block.prefix);
  const size = 1n << BigInt(bits - newPrefix);
  const list: Block[] = [];
  for (let i = 0n; i < total && i < BigInt(limit); i++) {
    const network = block.network + i * size;
    list.push({ family: block.family, address: network, prefix: newPrefix, network, last: network + size - 1n });
  }
  return { total, list };
}

export const toCidr = (block: Block) => `${formatAddress(block.network, block.family)}/${block.prefix}`;
