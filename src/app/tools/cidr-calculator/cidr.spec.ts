import { Block, addressType, blockSize, contains, formatAddress, formatIpv6, hostRange, maskOf, parseBlock, parseIpv6, subnets, toCidr } from './cidr';

const block = (text: string): Block => {
  const result = parseBlock(text);
  if (!result.ok) throw new Error(result.error);
  return result.block;
};

describe('cidr', () => {
  it('works out an IPv4 block', () => {
    const b = block('192.168.1.130/26');
    expect(formatAddress(b.network, 4)).toBe('192.168.1.128');
    expect(formatAddress(b.last, 4)).toBe('192.168.1.191');
    expect(formatAddress(maskOf(26, 4), 4)).toBe('255.255.255.192');
    expect(blockSize(b)).toBe(64n);
    const hosts = hostRange(b);
    expect([formatAddress(hosts.first, 4), formatAddress(hosts.last, 4), hosts.count]).toEqual(['192.168.1.129', '192.168.1.190', 62n]);
    expect(addressType(b)).toBe('Private network (RFC 1918)');
  });

  it('accepts a dotted mask, a single address and edge prefixes', () => {
    expect(toCidr(block('10.1.2.3 255.255.0.0'))).toBe('10.1.0.0/16');
    expect(toCidr(block('8.8.8.8'))).toBe('8.8.8.8/32');
    expect(hostRange(block('10.0.0.0/31')).count).toBe(2n);
    expect(blockSize(block('0.0.0.0/0'))).toBe(2n ** 32n);
    expect(addressType(block('8.8.8.8'))).toBe('Public');
    expect(parseBlock('10.0.0.0 255.0.255.0')).toMatchObject({ ok: false });
    expect(parseBlock('10.0.0.256/8')).toMatchObject({ ok: false });
    expect(parseBlock('10.0.0.0/33')).toMatchObject({ ok: false });
  });

  it('reads and writes IPv6 in short and long form', () => {
    expect(parseIpv6('2001:db8::1')).toBe(0x20010db8000000000000000000000001n);
    expect(parseIpv6('::ffff:192.0.2.1')).toBe(0xffffc0000201n);
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(parseIpv6('1::2::3')).toBeNull();
    expect(formatIpv6(0x20010db8000000000000000000000001n)).toBe('2001:db8::1');
    expect(formatIpv6(0x20010db8000100000000000000010000n)).toBe('2001:db8:1::1:0');
    expect(formatIpv6(1n, true)).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(formatIpv6(0n)).toBe('::');
  });

  it('works out an IPv6 block', () => {
    const b = block('2001:db8:abcd:12::5/48');
    expect(toCidr(b)).toBe('2001:db8:abcd::/48');
    expect(formatAddress(b.last, 6)).toBe('2001:db8:abcd:ffff:ffff:ffff:ffff:ffff');
    expect(blockSize(b)).toBe(2n ** 80n);
    expect(addressType(b)).toBe('Documentation');
    expect(addressType(block('fd12:3456::/48'))).toBe('Unique local address (private)');
  });

  it('checks membership and splits into subnets', () => {
    const b = block('10.0.0.0/16');
    expect(contains(b, '10.0.255.1')).toBe(true);
    expect(contains(b, '10.1.0.0')).toBe(false);
    expect(contains(b, 'nope')).toBeNull();
    const split = subnets(b, 18);
    expect(split.total).toBe(4n);
    expect(split.list.map(toCidr)).toEqual(['10.0.0.0/18', '10.0.64.0/18', '10.0.128.0/18', '10.0.192.0/18']);
    expect(subnets(b, 32, 3).list).toHaveLength(3);
    expect(subnets(b, 8).total).toBe(0n);
  });
});
