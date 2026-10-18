import type { LimitKind } from '../../core/analytics';
import { LIMITS } from '../../core/app-config';
import { formatBytes } from '../../shared/file-utils';

/** Image types every browser can open directly, with their file extensions. */
export const IMAGE_TYPES: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

/**
 * Everything the converter reads. HEIC and TIFF are opened with a library in
 * browsers that cannot show them; SVG is drawn at a useful size.
 */
export const CONVERTER_TYPES: Record<string, string[]> = {
  ...IMAGE_TYPES,
  'image/svg+xml': ['.svg'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/heic-sequence': ['.heic'],
  'image/heif-sequence': ['.heif'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/x-ms-bmp': ['.bmp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/x-icon': ['.ico'],
  'image/vnd.microsoft.icon': ['.ico'],
  'image/avif': ['.avif'],
};

const acceptFor = (types: Record<string, string[]>) =>
  [...new Set(Object.entries(types).flatMap(([type, extensions]) => [type, ...extensions]))].join(',');

/** Value for the file input's accept attribute (PNG, JPG and WebP). */
export const IMAGE_ACCEPT = acceptFor(IMAGE_TYPES);
export const CONVERTER_ACCEPT = acceptFor(CONVERTER_TYPES);

export interface ImageLimits {
  maxImages: number;
  maxImageBytes: number;
  maxBatchBytes: number;
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxImages: LIMITS.MAX_IMAGES,
  maxImageBytes: LIMITS.MAX_IMAGE_BYTES,
  maxBatchBytes: LIMITS.MAX_BATCH_BYTES,
};

/** What happened to each file the user tried to add. */
export interface AddPlan {
  added: File[];
  overLimit: File[];
  wrongType: File[];
  tooLarge: File[];
  overBatch: File[];
  duplicates: File[];
}

/**
 * True for PNG, JPG and WebP, or every converter format with `types`. Uses the
 * extension when the browser gives no type or a generic one.
 */
export function isSupportedImage(file: File, types = IMAGE_TYPES): boolean {
  if (file.type && file.type in types) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  const name = file.name.toLowerCase();
  return Object.values(types).some((extensions) => extensions.some((ext) => name.endsWith(ext)));
}

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * Decides which new files join the batch. Files are taken in order, so when more
 * than the limit are chosen, the first ones are kept.
 */
export function planAdd(existing: readonly File[], incoming: readonly File[], limits = DEFAULT_IMAGE_LIMITS): AddPlan {
  const plan: AddPlan = { added: [], overLimit: [], wrongType: [], tooLarge: [], overBatch: [], duplicates: [] };
  let count = existing.length;
  let bytes = existing.reduce((sum, file) => sum + file.size, 0);

  for (const file of incoming) {
    if (!isSupportedImage(file, CONVERTER_TYPES)) plan.wrongType.push(file);
    else if (file.size > limits.maxImageBytes) plan.tooLarge.push(file);
    else if ([...existing, ...plan.added].some((other) => sameFile(other, file))) plan.duplicates.push(file);
    else if (count >= limits.maxImages) plan.overLimit.push(file);
    else if (bytes + file.size > limits.maxBatchBytes) plan.overBatch.push(file);
    else {
      plan.added.push(file);
      count++;
      bytes += file.size;
    }
  }
  return plan;
}

/** The limits a batch ran into, for counting how often people need more. */
export function limitsHit(plan: AddPlan): LimitKind[] {
  const hit: LimitKind[] = [];
  if (plan.overLimit.length) hit.push('count');
  if (plan.tooLarge.length) hit.push('file-size');
  if (plan.overBatch.length) hit.push('batch-size');
  return hit;
}

/** Plain-language notes about files that were not added. Empty when everything was added. */
export function describePlan(plan: AddPlan, limits = DEFAULT_IMAGE_LIMITS): string[] {
  const notes: string[] = [];
  const images = (n: number) => (n === 1 ? '1 image' : `${n} images`);
  const names = (files: File[]) => {
    const shown = files.slice(0, 3).map((f) => f.name);
    return files.length > 3 ? `${shown.join(', ')} and ${files.length - 3} more` : shown.join(', ');
  };

  if (plan.overLimit.length) {
    notes.push(
      `${images(plan.overLimit.length)} left out because a batch holds up to ${limits.maxImages}. ` +
        `The first ${limits.maxImages} were kept.`,
    );
  }
  if (plan.wrongType.length) {
    notes.push(`Skipped because they are not images this tool can open: ${names(plan.wrongType)}.`);
  }
  if (plan.tooLarge.length) {
    notes.push(`Skipped because they are over ${formatBytes(limits.maxImageBytes)} each: ${names(plan.tooLarge)}.`);
  }
  if (plan.overBatch.length) {
    notes.push(
      `${images(plan.overBatch.length)} skipped because the batch would go over ${formatBytes(limits.maxBatchBytes)} in total.`,
    );
  }
  if (plan.duplicates.length) {
    notes.push(`Already in the list: ${names(plan.duplicates)}.`);
  }
  return notes;
}
