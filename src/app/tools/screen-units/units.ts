/** Screen size units for Android (dp, sp, px per density), iOS (pt, @1x–@3x) and the web (CSS px, rem, em). */

export type Unit = 'px' | 'dp' | 'sp' | 'pt' | 'rem';

export const DENSITIES = [
  { id: 'ldpi', label: 'ldpi', scale: 0.75 },
  { id: 'mdpi', label: 'mdpi (1x)', scale: 1 },
  { id: 'hdpi', label: 'hdpi (1.5x)', scale: 1.5 },
  { id: 'xhdpi', label: 'xhdpi (2x)', scale: 2 },
  { id: 'xxhdpi', label: 'xxhdpi (3x)', scale: 3 },
  { id: 'xxxhdpi', label: 'xxxhdpi (4x)', scale: 4 },
] as const;

export interface UnitSettings {
  /** Device pixels per dp (Android) or per pt (iOS): 1, 1.5, 2, 3 or 4. */
  scale: number;
  /** Android's font scale for sp: 1 by default, up to 2 with large text. */
  fontScale: number;
  /** Root font size in CSS px, for rem. */
  rootFontSize: number;
}

export const DEFAULT_SETTINGS: UnitSettings = { scale: 3, fontScale: 1, rootFontSize: 16 };

/** Device-independent size (dp = pt = CSS px) of a value in any unit. */
function toDp(value: number, unit: Unit, s: UnitSettings): number {
  switch (unit) {
    case 'px':
      return value / s.scale;
    case 'sp':
      return value * s.fontScale;
    case 'rem':
      return value * s.rootFontSize;
    default:
      return value;
  }
}

export interface Converted {
  devicePx: number;
  dp: number;
  sp: number;
  pt: number;
  cssPx: number;
  rem: number;
  /** Device pixels at every Android density, for exporting images. */
  perDensity: { label: string; px: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function convertUnits(value: number, unit: Unit, s: UnitSettings): Converted {
  const dp = toDp(value, unit, s);
  return {
    devicePx: round(dp * s.scale),
    dp: round(dp),
    sp: round(dp / s.fontScale),
    pt: round(dp),
    cssPx: round(dp),
    rem: round(dp / s.rootFontSize),
    perDensity: DENSITIES.map((d) => ({ label: d.label, px: round(dp * d.scale) })),
  };
}
