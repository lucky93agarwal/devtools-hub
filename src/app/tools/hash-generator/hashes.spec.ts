import { findMatch, formatDigest, hashFile, hashText } from './hashes';

describe('hashes', () => {
  it('hashes text with every algorithm', async () => {
    const d = await hashText('abc');
    expect(d['md5']).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(d['sha1']).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(d['sha256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(d['sha3-256']).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    expect(d['crc32']).toBe('352441c2');
    expect(Object.keys(d)).toHaveLength(9);
  });

  it('makes HMACs with a key and leaves out CRC32', async () => {
    const d = await hashText('The quick brown fox jumps over the lazy dog', 'key');
    expect(d['sha256']).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
    expect(d['md5']).toBe('80070713463e7749b90c2dc24911e275');
    expect(d['crc32']).toBeUndefined();
  });

  it('hashes a file in pieces with progress', async () => {
    const progress: number[] = [];
    const d = await hashFile(new Blob(['abc']), '', (p) => progress.push(p));
    expect(d?.['sha256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(progress).toEqual([1]);
    expect(await hashFile(new Blob(['abc']), '', undefined, () => true)).toBeNull();
  });

  it('formats digests and finds a pasted checksum', async () => {
    const d = await hashText('abc');
    expect(formatDigest(d['md5'], 'HEX')).toBe('900150983CD24FB0D6963F7D28E17F72');
    expect(formatDigest(d['md5'], 'base64')).toBe('kAFQmDzST7DWlj99KOF/cg==');
    expect(findMatch(d, ' 900150983CD24FB0D6963F7D28E17F72 ')).toBe('md5');
    expect(findMatch(d, 'kAFQmDzST7DWlj99KOF/cg==')).toBe('md5');
    expect(findMatch(d, 'deadbeef')).toBeNull();
  });
});
