import { addCues, captionY, parseSrt, projectCues, toSrt } from './captions';
import { estimateSize, exportRange, frameTimes, outputSize, tooLong } from './export';
import { wrapLines } from './render';
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
  shiftKeyframes,
  speedChange,
  splitAll,
  splitClip,
  trimClip,
  timelineTime,
  valueAt,
} from './project';
import { audioBitrate, scaledSize, targetVideoBitrate, videoBitrate } from '../video/media';
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

describe('bug fixes after testing', () => {
  it('finds the timeline time of a source time, with ramps and reverse', () => {
    const ramped = clip({ start: 3, ramp: { shape: 'speed-up', amount: 0.6 } });
    for (const t of [3.5, 5, 9, 12.5]) expect(timelineTime(ramped, sourceTime(ramped, t))).toBeCloseTo(t, 4);
    const back = clip({ start: 1, reverse: true, speed: 2 });
    expect(timelineTime(back, 10)).toBeCloseTo(1, 4);
    expect(timelineTime(back, 0)).toBeCloseTo(6, 4);
  });

  it('gives new keyframes the curve the clip already uses', () => {
    const c = clip({ keyframes: { x: [{ t: 0, v: 0, ease: 'ease-in' }] } });
    expect(setKeyframe(c, 'x', 2, 1).x!.at(-1)).toEqual({ t: 2, v: 1, ease: 'ease-in' });
    expect(setKeyframe(c, 'scale', 1, 2).scale).toEqual([{ t: 1, v: 2, ease: 'ease-in' }]);
    expect(setKeyframe(clip(), 'x', 1, 1).x).toEqual([{ t: 1, v: 1 }]);
  });

  it('does not stack a new caption on another, and keeps captions out of the Reels buttons', () => {
    let p = addCues(newProject(), [{ start: 0, end: 3, text: 'a' }], 0, true).project;
    p = addCues(p, [{ start: 1, end: 4, text: 'b' }], 0, true).project;
    expect(p.clips.map((c) => c.start)).toEqual([0, 3]);
    // Imported lines keep their own times.
    expect(addCues(p, [{ start: 1, end: 2, text: 'c' }]).project.clips.at(-1)!.start).toBe(1);
    expect(captionY({ width: 1080, height: 1920 })).toBeLessThan(0.72);
    expect(captionY({ width: 1280, height: 720 })).toBe(0.86);
  });

  it('estimates sizes with the bitrates the encoder uses', () => {
    const project: Project = { ...newProject(), clips: [clip()] };
    // 720p high H.264 ≈ 2.8 Mbit/s whatever the frame rate, plus 192 kbit/s AAC.
    const bytes = estimateSize(project, { format: 'mp4', quality: 'high' });
    expect(bytes / 10 / 125_000).toBeGreaterThan(2.8);
    expect(bytes / 10 / 125_000).toBeLessThan(3.2);
    expect(estimateSize(project, { format: 'mp4', quality: 'high', fps: 60 })).toBe(bytes);
    expect(estimateSize(project, { format: 'mp4', quality: 'high' }, false)).toBeLessThan(bytes);
    expect(estimateSize(project, { format: 'webm', quality: 'high' })).toBeLessThan(bytes);
    expect(videoBitrate(1280, 720, 'high', 'avc')).toBeCloseTo(2_820_000, -5);
    expect(audioBitrate('aac', 'high')).toBe(192_000);
  });

  it('notes that titles are left out of EDL and XML', () => {
    const project: Project = { ...newProject(), clips: [clip(), { ...clip({ id: 't', mediaId: undefined }), title: { text: 'x', size: 5, colour: '#fff', x: 0.5, y: 0.5, background: false } }] };
    expect(toEdl(project, [media()])).toContain('* NOTE: 1 title or caption clip is not included');
    expect(toFcpXml(project, [media()])).toContain('Titles and captions are not included');
  });
});

describe('second round of fixes', () => {
  it('stretches keyframes with a speed change', () => {
    const c = clip({ keyframes: { scale: [{ t: 0, v: 1 }, { t: 1.5, v: 2, ease: 'ease' }] } });
    expect(speedChange(c, 2).keyframes!.scale).toEqual([{ t: 0, v: 1 }, { t: 0.75, v: 2, ease: 'ease' }]);
    expect(speedChange({ ...c, speed: 2 }, 1)).toEqual({ speed: undefined, keyframes: { scale: [{ t: 0, v: 1 }, { t: 3, v: 2, ease: 'ease' }] } });
  });

  it('keeps keyframes on the same picture when the start is trimmed', () => {
    const c = clip({ keyframes: { scale: [{ t: 0, v: 1 }, { t: 4, v: 3 }] } });
    const p = trimClip({ ...newProject(), clips: [c] }, 'a', 'start', 2, 10);
    const trimmed = p.clips[0];
    expect(trimmed.start).toBe(2);
    expect(trimmed.keyframes!.scale).toEqual([{ t: 0, v: 2 }, { t: 2, v: 3 }]);
    expect(shiftKeyframes(undefined, 1)).toBeUndefined();
  });

  it('does not split clips on locked tracks', () => {
    const project: Project = { ...newProject(), clips: [clip(), clip({ id: 'b', track: 2 })] };
    const locked = { ...project, tracks: project.tracks.map((t) => (t.id === 2 ? { ...t, locked: true } : t)) };
    expect(splitAll(locked, 5).clips.length).toBe(3);
  });

  it('puts overlapping subtitle lines on a second lane, skips empty lines, and survives a renamed track', () => {
    const { project } = addCues(newProject(), [
      { start: 5, end: 8, text: 'First' },
      { start: 6, end: 7, text: 'Second' },
      { start: 9, end: 10, text: 'Third' },
    ]);
    const lanes = project.tracks.filter((t) => t.captions);
    expect(lanes.map((t) => [t.name, t.captions])).toEqual([
      ['Captions', 1],
      ['Captions 2', 2],
    ]);
    const second = project.clips.find((c) => c.title?.text === 'Second')!;
    expect(second.track).toBe(lanes[1].id);
    expect(second.title!.y).toBeLessThan(project.clips[0].title!.y);
    expect(project.clips.find((c) => c.title?.text === 'Third')!.track).toBe(lanes[0].id);

    const renamed = renameTrack(project, lanes[0].id, 'Subs');
    expect(addCues(renamed, [{ start: 20, end: 21, text: 'x' }]).project.tracks.length).toBe(renamed.tracks.length);
    const empty = addCues(newProject(), [{ start: 0, end: 1, text: 'a' }]).project;
    empty.clips[0] = { ...empty.clips[0], title: { ...empty.clips[0].title!, text: '  ' } };
    expect(projectCues(empty)).toEqual([]);
  });

  it('refuses GIFs and picture sequences that would not fit in memory', () => {
    const long: Project = { ...newProject(), clips: [clip({ out: 600 })] };
    expect(tooLong(long, { format: 'gif', quality: 'high' })).toContain('at most 150 seconds');
    expect(tooLong(long, { format: 'gif', quality: 'high', range: { start: 0, end: 60 } })).toBeNull();
    expect(tooLong(long, { format: 'png-sequence', quality: 'high' })).toContain('too large');
    expect(tooLong(long, { format: 'mp4', quality: 'high' })).toBeNull();
  });

  it('wraps long title lines', () => {
    const fake = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;
    expect(wrapLines(fake, 'one two three four', 100)).toEqual(['one two', 'three four']);
    expect(wrapLines(fake, 'short\nsupercalifragilistic word', 90)).toEqual(['short', 'supercalifragilistic', 'word']);
  });
});
