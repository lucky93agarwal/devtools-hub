/** Drawing one frame of the project, shared by the preview and the export. */
import { Clip, Project, TitleStyle, Transition, clipsAt, effectsFilter, fitRect, transitionProgress } from './project';

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
 * Sets up the context for one transition at `progress` (0 = start of the transition,
 * 1 = clip fully shown). `entering` is false for a closing transition, so slides
 * leave the opposite way.
 */
export function applyTransition(
  context: CanvasRenderingContext2D,
  transition: Transition,
  progress: number,
  width: number,
  height: number,
  entering: boolean,
): void {
  const p = Math.min(1, Math.max(0, progress));
  switch (transition.type) {
    case 'fade':
      context.globalAlpha *= p;
      break;
    case 'wipe-left':
      context.beginPath();
      context.rect(0, 0, width * p, height);
      context.clip();
      break;
    case 'wipe-right':
      context.beginPath();
      context.rect(width * (1 - p), 0, width * p, height);
      context.clip();
      break;
    case 'wipe-up':
      context.beginPath();
      context.rect(0, height * (1 - p), width, height * p);
      context.clip();
      break;
    case 'slide-left':
      context.translate((entering ? 1 : -1) * (1 - p) * width, 0);
      break;
    case 'slide-right':
      context.translate((entering ? -1 : 1) * (1 - p) * width, 0);
      break;
    case 'circle':
      context.beginPath();
      context.arc(width / 2, height / 2, (p * Math.hypot(width, height)) / 2, 0, Math.PI * 2);
      context.clip();
      break;
    case 'zoom': {
      const scale = 0.4 + 0.6 * p;
      context.translate(width / 2, height / 2);
      context.scale(scale, scale);
      context.translate(-width / 2, -height / 2);
      context.globalAlpha *= p;
      break;
    }
  }
}

/** Draws one clip with its effects and the transitions active at `time`. */
function drawClip(context: CanvasRenderingContext2D, project: Project, clip: Clip, time: number, draw: () => void): void {
  const { width, height } = project;
  const progress = transitionProgress(clip, time);
  context.save();
  if (clip.transitionIn && progress.in !== null) applyTransition(context, clip.transitionIn, progress.in, width, height, true);
  if (clip.transitionOut && progress.out !== null) applyTransition(context, clip.transitionOut, progress.out, width, height, false);
  if (clip.effects) {
    context.globalAlpha *= clip.effects.opacity / 100;
    const filter = effectsFilter(clip.effects, height);
    if (filter) context.filter = filter;
  }
  draw();
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
      const title = clip.title;
      drawClip(context, project, clip, time, () => drawTitle(context, title, width, height));
      continue;
    }
    const source = sourceFor(clip);
    if (!source || !source.width || !source.height) continue;
    const box = fitRect(source.width, source.height, width, height);
    drawClip(context, project, clip, time, () => context.drawImage(source.image, box.x, box.y, box.width, box.height));
  }
}
