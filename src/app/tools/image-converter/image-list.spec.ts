import { ImageLimits, describePlan, isSupportedImage, planAdd } from './image-list';

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
    const plan = planAdd([], [image('a.png'), image('notes.txt', 10, 'text/plain'), image('anim.gif', 10, 'image/gif')], limits);
    expect(plan.added).toHaveLength(1);
    expect(describePlan(plan, limits)).toEqual(['Skipped because they are not PNG, JPG or WebP images: notes.txt, anim.gif.']);
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
      'Skipped because they are not PNG, JPG or WebP images: n0.txt, n1.txt, n2.txt and 2 more.',
    );
  });
});
