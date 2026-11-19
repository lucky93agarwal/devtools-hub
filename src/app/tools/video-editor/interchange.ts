/**
 * Timeline export for other editors: a CMX 3600 EDL (Premiere, Resolve, Avid) and a
 * Final Cut Pro 7 XML (Premiere, Resolve, Final Cut via converters). Only the cuts
 * are carried over: clips, their source in/out and place on the timeline.
 */
import { Clip, MediaItem, Project, clipEnd, timecode } from './project';

const SMPTE_RATES = [24, 25, 30, 50, 60];

/** EDL timecodes use ":" between all parts, frames at the end, and a whole-number rate. */
function tc(seconds: number, fps: number): string {
  return timecode(seconds, fps);
}

function reelName(name: string): string {
  return (name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'AX').slice(0, 8);
}

/** Clips that come from files, in timeline order (titles and captions cannot be carried as cuts). */
function mediaClips(project: Project, media: readonly MediaItem[]): { clip: Clip; item: MediaItem }[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return project.clips
    .filter((c) => c.mediaId && byId.has(c.mediaId))
    .map((clip) => ({ clip, item: byId.get(clip.mediaId!)! }))
    .sort((a, b) => a.clip.start - b.clip.start || a.clip.track - b.clip.track);
}

export function toEdl(project: Project, media: readonly MediaItem[], title = 'DevTools24 Project'): string {
  const fps = SMPTE_RATES.includes(project.fps) ? project.fps : 30;
  const lines = [`TITLE: ${title.toUpperCase().slice(0, 60)}`, 'FCM: NON-DROP FRAME', ''];
  let n = 1;
  for (const { clip, item } of mediaClips(project, media)) {
    const kind = clip.audioOnly || item.kind === 'audio' ? 'AA' : item.hasAudio && !clip.muted ? 'B' : 'V';
    const event = String(n++).padStart(3, '0');
    const sourceIn = clip.reverse ? clip.out : clip.in;
    const sourceOut = clip.reverse ? clip.in : clip.out;
    lines.push(
      `${event}  ${reelName(item.name).padEnd(8)} ${kind.padEnd(5)} C        ${tc(Math.min(sourceIn, sourceOut), fps)} ${tc(Math.max(sourceIn, sourceOut), fps)} ${tc(clip.start, fps)} ${tc(clipEnd(clip), fps)}`,
    );
    if ((clip.speed ?? 1) !== 1 || clip.reverse) {
      const rate = (clip.reverse ? -1 : 1) * fps * (clip.speed ?? 1);
      lines.push(`M2   ${reelName(item.name).padEnd(8)}       ${rate.toFixed(1).padStart(6)}                ${tc(clip.in, fps)}`);
    }
    lines.push(`* FROM CLIP NAME: ${item.name}`, '');
  }
  return lines.join('\n');
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Final Cut Pro 7 XML (xmeml v5): one video track per editor video track, audio on its own tracks. */
export function toFcpXml(project: Project, media: readonly MediaItem[], title = 'DevTools24 Project'): string {
  const fps = Math.round(project.fps);
  const f = (seconds: number) => Math.round(seconds * fps);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const clips = mediaClips(project, media);
  const written = new Set<string>();
  const fileXml = (item: MediaItem) => {
    if (written.has(item.id)) return `<file id="file-${escape(item.id)}"/>`;
    written.add(item.id);
    return `<file id="file-${escape(item.id)}"><name>${escape(item.name)}</name><pathurl>file://localhost/${encodeURIComponent(item.name)}</pathurl>${rate}<duration>${f(item.duration || 5)}</duration><media>${
      item.kind !== 'audio' ? `<video><samplecharacteristics><width>${item.width}</width><height>${item.height}</height></samplecharacteristics></video>` : ''
    }${item.hasAudio ? '<audio><channelcount>2</channelcount></audio>' : ''}</media></file>`;
  };
  const clipXml = (clip: Clip, item: MediaItem, n: number) =>
    `<clipitem id="clipitem-${n}"><name>${escape(item.name)}</name>${rate}<start>${f(clip.start)}</start><end>${f(clipEnd(clip))}</end><in>${f(clip.in)}</in><out>${f(clip.out)}</out>${fileXml(item)}${
      (clip.speed ?? 1) !== 1 || clip.reverse
        ? `<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><parameter><parameterid>speed</parameterid><value>${(clip.reverse ? -100 : 100) * (clip.speed ?? 1)}</value></parameter></effect></filter>`
        : ''
    }</clipitem>`;
  let n = 1;
  const videoTracks = project.tracks
    .map((track) => clips.filter(({ clip, item }) => clip.track === track.id && !clip.audioOnly && item.kind !== 'audio'))
    .filter((list) => list.length)
    .map((list) => `<track>${list.map(({ clip, item }) => clipXml(clip, item, n++)).join('')}</track>`);
  const audioTracks = project.tracks
    .map((track) => clips.filter(({ clip, item }) => clip.track === track.id && item.hasAudio && !clip.muted))
    .filter((list) => list.length)
    .map((list) => `<track>${list.map(({ clip, item }) => clipXml(clip, item, n++)).join('')}</track>`);
  const duration = Math.max(0, ...project.clips.map((c) => f(clipEnd(c))));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="sequence-1"><name>${escape(title)}</name><duration>${duration}</duration>${rate}<media><video><format><samplecharacteristics>${rate}<width>${project.width}</width><height>${project.height}</height></samplecharacteristics></format>${videoTracks.join('')}</video><audio>${audioTracks.join('')}</audio></media></sequence></xmeml>
`;
}
