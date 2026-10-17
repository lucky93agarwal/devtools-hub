/**
 * Which icon files an Android and an iOS app need, where they go in the project,
 * and the small text files that go with them. Matches what Android Studio's Image
 * Asset tool and Xcode's asset catalog produce.
 */

/** How one PNG is drawn. */
export type IconStyle =
  /** Full square on the background colour (launcher masks it). */
  | 'square'
  /** Circle on the background colour, for launchers that ask for a round icon. */
  | 'round'
  /** Transparent, image kept inside the adaptive icon's safe zone (66 of 108 dp). */
  | 'foreground';

export interface IconFile {
  path: string;
  size: number;
  style: IconStyle;
}

export interface TextFile {
  path: string;
  text: string;
}

export interface IconPlan {
  images: IconFile[];
  texts: TextFile[];
}

export interface PlanOptions {
  android: boolean;
  ios: boolean;
  /** Every iPhone and iPad size, for Xcode 13 and older. Newer Xcode needs only 1024 px. */
  iosAllSizes: boolean;
  /** Background colour of the adaptive icon, as #rrggbb. */
  background: string;
}

const RES = 'android/app/src/main/res';

/** Launcher icon is 48 dp; the adaptive foreground is 108 dp. */
const DENSITIES = [
  { name: 'mdpi', scale: 1 },
  { name: 'hdpi', scale: 1.5 },
  { name: 'xhdpi', scale: 2 },
  { name: 'xxhdpi', scale: 3 },
  { name: 'xxxhdpi', scale: 4 },
];

/** Sizes in points, with the scales and devices Xcode lists for each. */
const IOS_LEGACY: { idiom: 'iphone' | 'ipad' | 'ios-marketing'; points: number; scales: number[] }[] = [
  { idiom: 'iphone', points: 20, scales: [2, 3] },
  { idiom: 'iphone', points: 29, scales: [2, 3] },
  { idiom: 'iphone', points: 40, scales: [2, 3] },
  { idiom: 'iphone', points: 60, scales: [2, 3] },
  { idiom: 'ipad', points: 20, scales: [1, 2] },
  { idiom: 'ipad', points: 29, scales: [1, 2] },
  { idiom: 'ipad', points: 40, scales: [1, 2] },
  { idiom: 'ipad', points: 76, scales: [1, 2] },
  { idiom: 'ipad', points: 83.5, scales: [2] },
  { idiom: 'ios-marketing', points: 1024, scales: [1] },
];

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

export function planIcons(options: PlanOptions): IconPlan {
  const images: IconFile[] = [];
  const texts: TextFile[] = [];

  if (options.android) {
    for (const density of DENSITIES) {
      const folder = `${RES}/mipmap-${density.name}`;
      images.push({ path: `${folder}/ic_launcher.png`, size: 48 * density.scale, style: 'square' });
      images.push({ path: `${folder}/ic_launcher_round.png`, size: 48 * density.scale, style: 'round' });
      images.push({ path: `${folder}/ic_launcher_foreground.png`, size: 108 * density.scale, style: 'foreground' });
    }
    texts.push({ path: `${RES}/mipmap-anydpi-v26/ic_launcher.xml`, text: ADAPTIVE_XML });
    texts.push({ path: `${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, text: ADAPTIVE_XML });
    texts.push({
      path: `${RES}/values/ic_launcher_background.xml`,
      text:
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' +
        `    <color name="ic_launcher_background">${options.background.toUpperCase()}</color>\n</resources>\n`,
    });
    images.push({ path: 'android/playstore-icon.png', size: 512, style: 'square' });
  }

  if (options.ios) {
    const folder = 'ios/AppIcon.appiconset';
    const entries: Record<string, string>[] = [];
    if (options.iosAllSizes) {
      for (const size of IOS_LEGACY) {
        for (const scale of size.scales) {
          const pixels = size.points * scale;
          const filename = `AppIcon-${size.points}@${scale}x.png`;
          if (!images.some((image) => image.path === `${folder}/${filename}`)) {
            images.push({ path: `${folder}/${filename}`, size: pixels, style: 'square' });
          }
          entries.push({ filename, idiom: size.idiom, scale: `${scale}x`, size: `${size.points}x${size.points}` });
        }
      }
    } else {
      // Xcode 14 and later make every size from one 1024 px image.
      images.push({ path: `${folder}/AppIcon-1024.png`, size: 1024, style: 'square' });
      entries.push({ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' });
    }
    texts.push({
      path: `${folder}/Contents.json`,
      text: JSON.stringify({ images: entries, info: { author: 'xcode', version: 1 } }, null, 2) + '\n',
    });
  }
  return { images, texts };
}

/** Where the image sits in a square of `size`: centred, keeping its shape, with `padding` (0 to 0.4) around it. */
export function placement(width: number, height: number, size: number, style: IconStyle, padding: number) {
  // The adaptive foreground is cropped by the launcher to the middle 66 of its 108 units.
  const area = style === 'foreground' ? size * (66 / 108) : size;
  const box = area * (1 - 2 * padding);
  const scale = box / Math.max(width, height);
  const w = width * scale;
  const h = height * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, width: w, height: h };
}
