import { addCues, parseSrt, projectCues, toSrt } from './captions';
import { estimateSize, exportRange, frameTimes, outputSize } from './export';
import { toEdl, toFcpXml } from './interchange';
import {
  Clip,
  MediaItem,
  Project,
  clipLength,
  ease,
  easeKeyframes,
  newProject,
  rampPosition,
  rampRate,
  rateAt,
  renameTrack,
  scaleRect,
  setKeyframe,
  slideshow,
  sourceTime,
  splitClip,
  valueAt,
} from './project';
import { scaledSize, targetVideoBitrate } from '../video/media';
import { distortionCurve, hasAudioFx } from './audio-fx';

const clip = (over: Partial<Clip> = {}): Clip => ({ id: 'a', track: 1, start: 0, in: 0, out: 10, mediaId: 'm', volume: 1, ...over });
const media = (over: Partial<MediaItem> = {}): MediaItem =>
  ({ id: 'm', name: 'holiday clip.mp4', kind: 'video', duration: 10, width: 1280, height: 720, hasAudio: true, url: '', file: new File([], 'x'), ...over }) as MediaItem;

describe('keyframe curves', () => {
  it('eases between keyframes', () => {
    expect(ease('linear', 0.5)).toBe(0.5);
    expect(ease('ease-in', 0.5)).toBeCloseTo(0.125);
    expect(ease('ease-out', 0.5)).toBeCloseTo(0.875);
    expect(ease('ease', 0.5)).toBeCloseTo(0.5);
    expect(ease('hold', 0.9)).toBe(0);
    const list = [
      { t: 0, v: 0, ease: 'hold' as const },
      { t: 2, v: 10 },
    ];
    expect(valueAt(list, 1.9, 5)).toBe(0);
    expect(valueAt(list, 2, 5)).toBe(10);
    expect(valueAt([{ t: 0, v: 0, ease: 'ease-in' }, { t: 2, v: 8 }], 1, 0)).toBeCloseTo(1);
  });

  it('keeps a keyframe curve when its value changes, and sets every curve at once', () => {
    let c = clip({ keyframes: { x: [{ t: 1, v: 0.2, ease: 'ease' }] } });
    c = { ...c, keyframes: setKeyframe(c, 'x', 1, 0.7) };
    expect(c.keyframes!.x).toEqual([{ t: 1, v: 0.7, ease: 'ease' }]);
    expect(easeKeyframes({ ...c, keyframes: { ...c.keyframes, y: [{ t: 0, v: 1 }] } }, 'hold')!.y![0].ease).toBe('hold');
  });
});

describe('speed ramps', () => {
  it('bends time but keeps the ends and the length', () => {
    for (const shape of ['speed-up', 'slow-down', 'slow-middle', 'fast-middle'] as const) {
      const ramp = { shape, amount: 0.6 };
      expect(rampPosition(ramp, 0)).toBeCloseTo(0);
      expect(rampPosition(ramp, 1)).toBeCloseTo(1);
      // Always moving forwards.
      for (let p = 0; p < 1; p += 0.05) expect(rampPosition(ramp, p + 0.05)).toBeGreaterThan(rampPosition(ramp, p));
      // The rate is the slope of the position.
      expect(rampRate(ramp, 0.3)).toBeCloseTo((rampPosition(ramp, 0.3001) - rampPosition(ramp, 0.2999)) / 0.0002, 2);
    }
    const c = clip({ ramp: { shape: 'slow-middle', amount: 0.5 } });
    expect(clipLength(c)).toBe(10);
    expect(sourceTime(c, 5)).toBeCloseTo(5);
    expect(rateAt(c, 5)).toBeCloseTo(0.5);
    expect(rateAt(c, 0)).toBeCloseTo(1.5);
  });

  it('drops the ramp when split', () => {
    const project: Project = { ...newProject(), clips: [clip({ ramp: { shape: 'speed-up', amount: 0.5 } })] };
    const parts = splitClip(project, 'a', 4).clips;
    expect(parts.every((p) => !p.ramp)).toBe(true);
  });
});

describe('scale modes', () => {
  it('fits, fills, stretches or keeps the size', () => {
    expect(scaleRect('fit', 400, 300, 1280, 720)).toEqual({ x: 160, y: 0, width: 960, height: 720 });
    expect(scaleRect('fill', 400, 300, 1280, 720)).toEqual({ x: 0, y: -120, width: 1280, height: 960 });
    expect(scaleRect('stretch', 400, 300, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    expect(scaleRect('none', 400, 300, 1280, 720)).toEqual({ x: 440, y: 210, width: 400, height: 300 });
  });
});

describe('captions', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\n\n2\r\n00:00:04,000 --> 00:00:05,000\r\nSecond\r\nline\r\n\nbad block';
  it('reads and writes .srt', () => {
    const cues = parseSrt(srt);
    expect(cues).toEqual([
      { start: 1, end: 3.5, text: 'Hello there' },
      { start: 4, end: 5, text: 'Second\nline' },
    ]);
    expect(toSrt(cues)).toBe('1\n00:00:01,000 --> 00:00:03,500\nHello there\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond\nline\n');
    expect(parseSrt('WEBVTT\n\n00:00:01.5 --> 00:00:02.000\nVTT')).toEqual([{ start: 1.5, end: 2, text: 'VTT' }]);
  });

  it('turns lines into caption clips on a Captions track and back', () => {
    const { project, ids } = addCues(newProject(), parseSrt(srt));
    expect(ids.length).toBe(2);
    const track = project.tracks.find((t) => t.name === 'Captions')!;
    expect(project.clips.every((c) => c.track === track.id && c.caption)).toBe(true);
    expect(projectCues(project)).toEqual(parseSrt(srt));
    // A second import reuses the track.
    expect(addCues(project, [{ start: 9, end: 10, text: 'x' }]).project.tracks.length).toBe(project.tracks.length);
  });
});

describe('export settings', () => {
  const project: Project = { ...newProject(), clips: [clip()] };
  it('scales the output keeping its shape', () => {
    expect(outputSize(project, 'project')).toEqual({ width: 1280, height: 720 });
    expect(outputSize(project, 480)).toEqual({ width: 854, height: 480 });
    expect(outputSize({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 });
  });

  it('clamps the range and lists only frames inside it', () => {
    expect(exportRange(project, undefined)).toEqual({ start: 0, end: 10 });
    expect(exportRange(project, { start: 2, end: 99 })).toEqual({ start: 2, end: 10 });
    expect(frameTimes(clip(), 10, 2, 3).length).toBe(10);
    expect(frameTimes(clip(), 10, 2, 3)[0]).toBeCloseTo(2);
  });

  it('guesses a file size that grows with quality, length and size', () => {
    const low = estimateSize(project, { format: 'mp4', quality: 'low' });
    const high = estimateSize(project, { format: 'mp4', quality: 'high' });
    expect(high).toBeGreaterThan(low);
    expect(estimateSize(project, { format: 'mp4', quality: 'high', range: { start: 0, end: 5 } })).toBeCloseTo(high / 2, -3);
    expect(estimateSize(project, { format: 'mp4', quality: 'high', resolution: 1080 })).toBeGreaterThan(high);
    expect(estimateSize(project, { format: 'wav', quality: 'high' })).toBe(10 * 48_000 * 4);
  });
});

describe('EDL and Final Cut XML', () => {
  const project: Project = { ...newProject(), clips: [clip({ start: 2, in: 1, out: 4 }), clip({ id: 'b', start: 5, in: 0, out: 2, speed: 2 })] };
  it('lists every cut with source and record timecodes', () => {
    const edl = toEdl(project, [media()]);
    expect(edl).toContain('TITLE: DEVTOOLS24 PROJECT');
    expect(edl).toContain('001  HOLIDAYC B     C        00:00:01:00 00:00:04:00 00:00:02:00 00:00:05:00');
    expect(edl).toContain('M2   HOLIDAYC');
    expect(edl).toContain('* FROM CLIP NAME: holiday clip.mp4');
  });

  it('writes an xmeml sequence', () => {
    const xml = toFcpXml(project, [media()]);
    expect(xml).toContain('<xmeml version="5">');
    expect(xml.match(/<clipitem /g)!.length).toBe(4);
    expect(xml).toContain('<start>60</start><end>150</end><in>30</in><out>120</out>');
    expect(xml).toContain('Time Remap');
  });
});

describe('slideshow, tracks, audio effects, compressor', () => {
  it('places photos one after another with fades', () => {
    const photos = [media({ id: 'p1', kind: 'image' }), media({ id: 'p2', kind: 'image' })];
    const { project, ids } = slideshow(newProject(), photos, 1, 0, 2, true);
    expect(ids.length).toBe(2);
    expect(project.clips.map((c) => [c.start, c.out, c.transitionIn?.type])).toEqual([
      [0, 2, 'fade'],
      [2, 2, 'fade'],
    ]);
  });

  it('renames tracks, ignoring empty names', () => {
    expect(renameTrack(newProject(), 1, '  Music  ').tracks[0].name).toBe('Music');
    expect(renameTrack(newProject(), 1, '   ').tracks[0].name).toBe('Track 1');
  });

  it('knows when new sound effects are on', () => {
    const none = { echo: 0, bass: 0, treble: 0, clean: false };
    expect(hasAudioFx(none)).toBe(false);
    expect(hasAudioFx({ ...none, robot: true })).toBe(true);
    expect(hasAudioFx({ ...none, mid: 3 })).toBe(true);
    const curve = distortionCurve(0.5, 5);
    expect(curve[0]).toBeCloseTo(-1);
    expect(curve[2]).toBeCloseTo(0);
    expect(curve[4]).toBeCloseTo(1);
  });

  it('works out the bitrate for a target size and the output size', () => {
    // 10 MB over 60 s ≈ 1.33 Mbit/s, minus sound.
    expect(targetVideoBitrate(10 * 1024 * 1024, 60, true)).toBe(Math.round((10 * 1024 * 1024 * 8 * 0.95) / 60 - 96_000));
    expect(targetVideoBitrate(1000, 60, true)).toBe(100_000);
    expect(scaledSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(scaledSize(1080, 1920, 480)).toEqual({ width: 480, height: 854 });
    expect(scaledSize(640, 360, 1080)).toEqual({ width: 640, height: 360 });
  });
});
