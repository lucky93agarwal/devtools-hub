import { CONVERTER_ACCEPT, CONVERTER_TYPES, ImageLimits, describePlan, isSupportedImage, planAdd } from './image-list';

const MB = 1024 * 1024;
const limits: ImageLimits = { maxImages: 15, maxImageBytes: 20 * MB, maxBatchBytes: 150 * MB };

/** A File whose reported size can be set without allocating that much memory. */
function image(name: string, size = 1000, type = 'image/png', lastModified = 1): File {
  const file = new File(['x'], name, { type, lastModified });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const many = (n: number, start = 0) => Array.from({ length: n }, (_, i) => image(`photo-${start + i + 1}.png`));

describe('isSupportedImage', () => {
  it('accepts PNG, JPG and WebP by type', () => {
    expect(isSupportedImage(image('a.png', 1, 'image/png'))).toBe(true);
    expect(isSupportedImage(image('a.jpg', 1, 'image/jpeg'))).toBe(true);
    expect(isSupportedImage(image('a.webp', 1, 'image/webp'))).toBe(true);
    expect(isSupportedImage(image('a.gif', 1, 'image/gif'))).toBe(false);
    expect(isSupportedImage(image('a.txt', 1, 'text/plain'))).toBe(false);
  });

  it('falls back to the extension when the type is missing', () => {
    expect(isSupportedImage(image('Photo.JPEG', 1, ''))).toBe(true);
    expect(isSupportedImage(image('notes', 1, ''))).toBe(false);
  });

  it('accepts every converter format, by type or by extension', () => {
    for (const [name, type] of [
      ['a.gif', 'image/gif'],
      ['a.bmp', 'image/bmp'],
      ['a.tiff', 'image/tiff'],
      ['a.ico', 'image/vnd.microsoft.icon'],
      ['a.avif', 'image/avif'],
      ['a.svg', 'image/svg+xml'],
      ['IMG_0001.HEIC', 'image/heic'],
      // Chrome on Windows often gives HEIC files no type at all.
      ['IMG_0002.heic', ''],
      ['scan.tif', 'application/octet-stream'],
    ]) {
      expect(isSupportedImage(image(name, 1, type), CONVERTER_TYPES)).toBe(true);
    }
    expect(isSupportedImage(image('a.pdf', 1, 'application/pdf'), CONVERTER_TYPES)).toBe(false);
  });

  it('lists each extension once in the accept attribute', () => {
    const parts = CONVERTER_ACCEPT.split(',');
    expect(new Set(parts).size).toBe(parts.length);
    expect(parts).toEqual(expect.arrayContaining(['.heic', '.heif', '.svg', '.ico', '.tif', '.tiff', '.avif']));
  });
});

describe('planAdd', () => {
  it('keeps the first 15 of 20 and reports the other 5', () => {
    const plan = planAdd([], many(20), limits);
    expect(plan.added.map((f) => f.name)).toEqual(many(15).map((f) => f.name));
    expect(plan.overLimit).toHaveLength(5);
    expect(describePlan(plan, limits)).toEqual(['5 images left out because a batch holds up to 15. The first 15 were kept.']);
  });

  it('counts images already in the batch', () => {
    const plan = planAdd(many(10), many(8, 10), limits);
    expect(plan.added).toHaveLength(5);
    expect(plan.overLimit).toHaveLength(3);
  });

  it('adds nothing when the batch is full', () => {
    const plan = planAdd(many(15), many(1, 15), limits);
    expect(plan.added).toHaveLength(0);
    expect(describePlan(plan, limits)[0]).toBe('1 image left out because a batch holds up to 15. The first 15 were kept.');
  });

  it('skips files that are not supported images', () => {
    const files = [image('a.png'), image('notes.txt', 10, 'text/plain'), image('anim.gif', 10, 'image/gif'), image('cv.pdf', 10, 'application/pdf')];
    const plan = planAdd([], files, limits);
    expect(plan.added.map((f) => f.name)).toEqual(['a.png', 'anim.gif']);
    expect(describePlan(plan, limits)).toEqual(['Skipped because they are not images this tool can open: notes.txt, cv.pdf.']);
  });

  it('skips images over the size limit', () => {
    const plan = planAdd([], [image('huge.png', 21 * MB), image('ok.png', 5 * MB)], limits);
    expect(plan.added.map((f) => f.name)).toEqual(['ok.png']);
    expect(describePlan(plan, limits)).toEqual(['Skipped because they are over 20 MB each: huge.png.']);
  });

  it('stops before the batch goes over its total size', () => {
    const big = Array.from({ length: 9 }, (_, i) => image(`big-${i}.png`, 19 * MB));
    const plan = planAdd([], big, limits);
    expect(plan.added).toHaveLength(7); // 7 x 19 MB = 133 MB; an 8th would make 152 MB
    expect(plan.overBatch).toHaveLength(2);
    expect(describePlan(plan, limits)).toEqual(['2 images skipped because the batch would go over 150 MB in total.']);
  });

  it('does not add the same file twice', () => {
    const photo = image('photo.png', 500);
    const plan = planAdd([photo], [image('photo.png', 500), image('photo.png', 501)], limits);
    expect(plan.duplicates.map((f) => f.size)).toEqual([500]);
    expect(plan.added.map((f) => f.size)).toEqual([501]);
    expect(describePlan(plan, limits)).toEqual(['Already in the list: photo.png.']);
  });

  it('shortens long lists of names', () => {
    const texts = Array.from({ length: 5 }, (_, i) => image(`n${i}.txt`, 1, 'text/plain'));
    expect(describePlan(planAdd([], texts, limits), limits)[0]).toBe(
      'Skipped because they are not images this tool can open: n0.txt, n1.txt, n2.txt and 2 more.',
    );
  });
});
