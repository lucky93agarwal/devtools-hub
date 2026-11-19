/** Drawing one frame of the project, shared by the preview and the export. */
import { Clip, Project, TitleStyle, clipsAt, fitRect } from './project';

/** What a clip shows at the current time: a video frame, an image, or nothing yet. */
export type FrameSource = { image: CanvasImageSource; width: number; height: number } | null;

const TITLE_FONT = "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif";

export function drawTitle(context: CanvasRenderingContext2D, title: TitleStyle, width: number, height: number): void {
  const lines = title.text.split('\n');
  const size = (title.size / 100) * height;
  context.save();
  context.font = `700 ${size}px ${TITLE_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = size * 1.2;
  const x = title.x * width;
  const top = title.y * height - ((lines.length - 1) * lineHeight) / 2;
  if (title.background) {
    const textWidth = Math.max(...lines.map((l) => context.measureText(l).width));
    const pad = size * 0.4;
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.beginPath();
    context.roundRect(x - textWidth / 2 - pad, top - lineHeight / 2 - pad / 2, textWidth + pad * 2, lines.length * lineHeight + pad, size * 0.25);
    context.fill();
  } else {
    context.shadowColor = 'rgba(0,0,0,0.6)';
    context.shadowBlur = size * 0.15;
  }
  context.fillStyle = title.colour;
  lines.forEach((line, i) => context.fillText(line, x, top + i * lineHeight));
  context.restore();
}

/**
 * Draws the project at `time`: black, then each visible clip from the bottom track
 * up, so higher tracks cover lower ones, like layers.
 */
export function drawFrame(
  context: CanvasRenderingContext2D,
  project: Project,
  time: number,
  sourceFor: (clip: Clip) => FrameSource,
): void {
  const { width, height } = project;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
  for (const clip of clipsAt(project, time)) {
    if (hidden.has(clip.track)) continue;
    if (clip.title) {
      drawTitle(context, clip.title, width, height);
      continue;
    }
    const source = sourceFor(clip);
    if (!source || !source.width || !source.height) continue;
    const box = fitRect(source.width, source.height, width, height);
    context.drawImage(source.image, box.x, box.y, box.width, box.height);
  }
}
