import { TestBed } from '@angular/core/testing';
import { Analytics } from '../../core/analytics';
import { AppIconGenerator } from './app-icon-generator';
import { placement, planIcons } from './icon-plan';
import { IconRenderer } from './icon-renderer';

describe('planIcons', () => {
  const plan = planIcons({ android: true, ios: true, iosAllSizes: false, background: '#1a73e8' });
  const paths = plan.images.map((i) => `${i.path}:${i.size}`);

  it('makes Android launcher, round and adaptive icons for every density', () => {
    expect(paths).toContain('android/app/src/main/res/mipmap-mdpi/ic_launcher.png:48');
    expect(paths).toContain('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png:192');
    expect(paths).toContain('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png:324');
    expect(paths).toContain('android/playstore-icon.png:512');
    expect(plan.texts.map((t) => t.path)).toContain('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
    const colour = plan.texts.find((t) => t.path.endsWith('values/ic_launcher_background.xml'))!;
    expect(colour.text).toContain('<color name="ic_launcher_background">#1A73E8</color>');
  });

  it('makes one 1024 px iOS icon for current Xcode', () => {
    expect(paths).toContain('ios/AppIcon.appiconset/AppIcon-1024.png:1024');
    const contents = JSON.parse(plan.texts.find((t) => t.path.endsWith('Contents.json'))!.text);
    expect(contents.images).toEqual([
      { filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ]);
  });

  it('lists every iPhone and iPad size for older Xcode, drawing shared files once', () => {
    const all = planIcons({ android: false, ios: true, iosAllSizes: true, background: '#ffffff' });
    const contents = JSON.parse(all.texts[0].text);
    expect(contents.images).toContainEqual({ filename: 'AppIcon-60@3x.png', idiom: 'iphone', scale: '3x', size: '60x60' });
    expect(contents.images).toContainEqual({ filename: 'AppIcon-83.5@2x.png', idiom: 'ipad', scale: '2x', size: '83.5x83.5' });
    expect(all.images.find((i) => i.path.endsWith('AppIcon-60@3x.png'))?.size).toBe(180);
    // iPhone and iPad both use 20@2x; the file is drawn once.
    expect(all.images.filter((i) => i.path.endsWith('AppIcon-20@2x.png'))).toHaveLength(1);
  });
});

describe('placement', () => {
  it('centres a wide image with padding', () => {
    expect(placement(200, 100, 100, 'square', 0.1)).toEqual({ x: 10, y: 30, width: 80, height: 40 });
  });

  it('keeps the adaptive foreground inside the safe zone', () => {
    const box = placement(100, 100, 108, 'foreground', 0);
    expect(box.width).toBeCloseTo(66);
    expect(box.x).toBeCloseTo(21);
  });
});

describe('AppIconGenerator', () => {
  let drawn: { size: number; style: string }[];

  async function setup() {
    drawn = [];
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn();
    const renderer = {
      load: vi.fn(async () => ({ source: {}, width: 512, height: 512, close: vi.fn() })),
      png: vi.fn(async (_image: unknown, size: number, style: string) => {
        drawn.push({ size, style });
        return new Blob(['png'], { type: 'image/png' });
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: IconRenderer, useValue: renderer },
        { provide: Analytics, useValue: { track: vi.fn(), load: vi.fn(), limitHit: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AppIconGenerator);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const choose = async () => {
      const input = el.querySelector<HTMLInputElement>('app-upload-box input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'logo.png', { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
      await settle();
      await settle();
    };
    return { el, settle, choose, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('previews the icons and warns that a small image will be blurry', async () => {
    const { el, choose, text } = await setup();
    await choose();
    expect(el.querySelectorAll('ul img')).toHaveLength(4);
    expect(text()).toContain('This image is 512×512 px. Use at least 1024×1024 px');
  });

  it('downloads a ZIP with every planned file', async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    const { el, choose, settle, text } = await setup();
    await choose();
    expect(text()).toContain('Download 21 files (ZIP)');
    drawn = [];
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Download'))!.click();
    await settle();
    await settle();
    expect(downloads).toEqual(['app-icons.zip']);
    expect(drawn).toHaveLength(17);
    expect(drawn).toContainEqual({ size: 1024, style: 'square' });
    vi.restoreAllMocks();
  });
});
