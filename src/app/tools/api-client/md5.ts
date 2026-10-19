/**
 * MD5 of UTF-8 text, as hex. Web Crypto has no MD5, and HTTP Digest auth still
 * uses it by default. Not for security on its own; only to answer Digest challenges.
 */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const length = bytes.length;
  const words = new Uint32Array((((length + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[length >> 2] |= 0x80 << ((length % 4) * 8);
  words[words.length - 2] = length * 8;
  words[words.length - 1] = Math.floor((length * 8) / 0x100000000);

  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let block = 0; block < words.length; block += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      let f: number;
      let g: number;
      if (round === 0) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (round === 1) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (round === 2) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const shift = shifts[round * 4 + (i % 4)];
      const sum = (a + f + constants[i] + words[block + g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0]
    .map((word) => Array.from({ length: 4 }, (_, i) => ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join(''))
    .join('');
}
