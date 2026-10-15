import { DiffStats } from '../../shared/code-editor/diff-viewer';

/** Sample pair so visitors can try the tool without their own JSON. */
export const COMPARE_SAMPLES = {
  original: JSON.stringify({
    name: 'DevTools Hub',
    version: 1,
    free: true,
    tools: ['JSON formatter', 'JSON compare'],
    limits: { imagesPerBatch: 10, maxImageMb: 20 },
    beta: true,
  }),
  changed: JSON.stringify({
    name: 'DevTools Hub',
    version: 2,
    free: true,
    tools: ['JSON formatter', 'JSON compare', 'Image converter'],
    limits: { imagesPerBatch: 15, maxImageMb: 20 },
    launched: '2026-10',
  }),
} as const;

/** Plain-language summary, for example "3 places (2 lines changed, 1 line added)". */
export function describeStats(stats: DiffStats): string {
  const parts: string[] = [];
  const lines = (n: number) => (n === 1 ? '1 line' : `${n} lines`);
  if (stats.changed) parts.push(`${lines(stats.changed)} changed`);
  if (stats.added) parts.push(`${lines(stats.added)} added`);
  if (stats.removed) parts.push(`${lines(stats.removed)} removed`);
  const places = stats.places === 1 ? '1 place' : `${stats.places} places`;
  return `${places} (${parts.join(', ')})`;
}
