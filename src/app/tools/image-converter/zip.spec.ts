import { strFromU8, unzipSync } from 'fflate';
import { buildZip, uniqueNames } from './zip';

describe('uniqueNames', () => {
  it('numbers repeated names before the extension', () => {
    expect(uniqueNames(['photo.webp', 'photo.webp', 'logo.webp', 'photo.webp'])).toEqual([
      'photo.webp',
      'photo (2).webp',
      'logo.webp',
      'photo (3).webp',
    ]);
  });

  it('treats names that differ only in case as the same', () => {
    expect(uniqueNames(['A.png', 'a.png'])).toEqual(['A.png', 'a (2).png']);
  });

  it('does not clash with a name that already has a number', () => {
    expect(uniqueNames(['x (2).png', 'x.png', 'x.png'])).toEqual(['x (2).png', 'x.png', 'x (3).png']);
  });
});

describe('buildZip', () => {
  it('packs every file with its content and a unique name', async () => {
    const zip = await buildZip([
      { name: 'a.webp', blob: new Blob(['first']) },
      { name: 'a.webp', blob: new Blob(['second']) },
      { name: 'b.webp', blob: new Blob(['third']) },
    ]);
    expect(zip.type).toBe('application/zip');

    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['a.webp', 'a (2).webp', 'b.webp']);
    expect(strFromU8(files['a (2).webp'])).toBe('second');
  });

  it('compresses BMP files, which are stored uncompressed', async () => {
    const bmp = new Blob([new Uint8Array(10_000)]);
    const zip = await buildZip([{ name: 'scan.bmp', blob: bmp }]);
    expect(zip.size).toBeLessThan(1_000);
    expect(unzipSync(new Uint8Array(await zip.arrayBuffer()))['scan.bmp']).toHaveLength(10_000);
  });
});
