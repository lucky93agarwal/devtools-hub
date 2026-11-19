/** Drawing one frame of the project, shared by the preview and the export. */
import {
  Clip,
  Project,
  TITLE_FONTS,
  TitleStyle,
  Transition,
  clipLength,
  clipsAt,
  easeOut,
  easeOutBack,
  effectsFilter,
  fitRect,
  titleEntrance,
  transformAt,
  transitionProgress,
} from './project';
import { chromaKey, colourEffects, hexToRgb, sharpen } from './pixels';

/** Safari (before 18) and some others ignore canvas filters; their effects are then done on pixels. */
let filtersWork: boolean | null = null;
export function canvasFiltersWork(): boolean {
  if (filtersWork === null) {
    const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    if (context) context.filter = 'blur(1px)';
    filtersWork = !!context && context.filter === 'blur(1px)';
  }
  return filtersWork;
}

/** What a clip shows at the current time: a video frame, an image, or nothing yet. */
export type FrameSource = { image: CanvasImageSource; width: number; height: number } | null;


/** A darker shade of a #rrggbb colour, for the sides of 3D letters. */
export function shade(colour: string, amount: number): string {
  const value = parseInt(colour.replace('#', ''), 16) || 0;
  const c = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/**
 * Draws a title at clip-local time `local` (seconds) of a clip `length` seconds long,
 * with its entrance animation. Without a time, the settled title is drawn.
 */
export function drawTitle(context: CanvasRenderingContext2D, title: TitleStyle, width: number, height: number, local = Infinity, length = Infinity): void {
  const animation = title.animation ?? 'none';
  const p = titleEntrance(local, length, animation);
  const e = easeOut(p);
  const size = (title.size / 100) * height;
  const fontCss = (TITLE_FONTS.find((f) => f.id === title.font) ?? TITLE_FONTS[0]).css;
  let text = title.text;
  if (animation === 'typewriter' && p < 1) text = text.slice(0, Math.floor(text.length * p));
  const lines = text.split('\n');
  const allLines = title.text.split('\n');
  context.save();
  context.font = `700 ${size}px ${fontCss}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = size * 1.2;
  const cx = title.x * width;
  const cy = title.y * height;
  const top = cy - ((allLines.length - 1) * lineHeight) / 2;

  // Entrance movement around the title's centre.
  switch (animation) {
    case 'fade-up':
      context.globalAlpha *= e;
      context.translate(0, (1 - e) * size);
      break;
    case 'pop': {
      const k = Math.max(0.01, easeOutBack(p));
      context.translate(cx, cy);
      context.scale(k, k);
      context.translate(-cx, -cy);
      context.globalAlpha *= Math.min(1, p * 3);
      break;
    }
    case 'slide':
      context.translate(-(1 - e) * width * 0.6, 0);
      context.globalAlpha *= e;
      break;
    case 'zoom': {
      const k = 1 + (1 - e) * 2;
      context.translate(cx, cy);
      context.scale(k, k);
      context.translate(-cx, -cy);
      context.globalAlpha *= e;
      break;
    }
    case 'flip-3d': {
      // A card turning towards you around its horizontal axis.
      const angle = (1 - e) * (Math.PI / 2);
      context.translate(cx, cy);
      context.transform(1, 0, -Math.sin(angle) * 0.3, Math.max(0.02, Math.cos(angle)), 0, 0);
      context.translate(-cx, -cy);
      context.globalAlpha *= Math.min(1, p * 2);
      break;
    }
    case 'extrude-3d': {
      const k = Math.max(0.01, easeOutBack(p));
      context.translate(cx, cy);
      context.scale(k, k);
      context.translate(-cx, -cy);
      break;
    }
  }

  if (title.background && lines.some((l) => l)) {
    const textWidth = Math.max(...lines.map((l) => context.measureText(l).width));
    const pad = size * 0.4;
    context.save();
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.beginPath();
    context.roundRect(cx - textWidth / 2 - pad, top - lineHeight / 2 - pad / 2, textWidth + pad * 2, allLines.length * lineHeight + pad, size * 0.25);
    context.fill();
    context.restore();
  }

  const drawText = (line: string, x: number, y: number, fill: string) => {
    if (title.outline) {
      context.lineWidth = Math.max(2, size / 10);
      context.strokeStyle = 'rgba(0,0,0,0.85)';
      context.lineJoin = 'round';
      context.strokeText(line, x, y);
    }
    context.fillStyle = fill;
    context.fillText(line, x, y);
  };

  if (animation === 'extrude-3d') {
    // Stacked copies, darker towards the back, give the letters depth; the depth
    // direction sways slowly so the title looks like it turns in 3D.
    const depth = Math.max(4, Math.round(size / 7));
    const angle = Math.PI / 4 + Math.sin((Number.isFinite(local) ? local : 0) * 1.2) * 0.7;
    const step = Math.max(1, size / 40);
    for (let k = depth; k >= 1; k--) {
      const dx = Math.cos(angle) * k * step;
      const dy = Math.sin(angle) * k * step;
      const tone = shade(title.colour, 0.35 + (0.4 * k) / depth);
      lines.forEach((line, i) => {
        context.fillStyle = tone;
        context.fillText(line, cx + dx, top + i * lineHeight + dy);
      });
    }
    lines.forEach((line, i) => drawText(line, cx, top + i * lineHeight, title.colour));
    context.restore();
    return;
  }

  if (!title.background && !title.outline) {
    context.shadowColor = 'rgba(0,0,0,0.6)';
    context.shadowBlur = size * 0.15;
  }

  if (animation === 'wave') {
    // Each letter bobs up and down, one after another.
    const t = Number.isFinite(local) ? local : 0;
    lines.forEach((line, i) => {
      const lineWidth = context.measureText(line).width;
      let x = cx - lineWidth / 2;
      context.textAlign = 'left';
      [...line].forEach((ch, n) => {
        const y = top + i * lineHeight + Math.sin(t * 5 - n * 0.55) * size * 0.12;
        drawText(ch, x, y, title.colour);
        x += context.measureText(ch).width;
      });
    });
    context.restore();
    return;
  }

  lines.forEach((line, i) => drawText(line, cx, top + i * lineHeight, title.colour));
  if (animation === 'typewriter' && p < 1) {
    // A blinking cursor after the last letter typed.
    const last = lines.length - 1;
    const w = context.measureText(lines[last]).width;
    if (Math.floor((Number.isFinite(local) ? local : 0) * 3) % 2 === 0) {
      context.fillRect(cx + w / 2 + size * 0.08, top + last * lineHeight - size * 0.45, size * 0.08, size * 0.9);
    }
  }
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

/** Reused scratch canvas for effects that work on pixels. */
let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(width: number, height: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const context = scratch.getContext('2d', { willReadFrequently: true })!;
  context.clearRect(0, 0, width, height);
  return context;
}

/**
 * Draws one clip with its transform (size, place, rotation, crop, keyframes),
 * effects and the transitions active at `time`.
 */
function drawClip(context: CanvasRenderingContext2D, project: Project, clip: Clip, time: number, source: FrameSource | 'title'): void {
  const { width, height } = project;
  const progress = transitionProgress(clip, time);
  const t = transformAt(clip, time);
  context.save();
  if (clip.transitionIn && progress.in !== null) applyTransition(context, clip.transitionIn, progress.in, width, height, true);
  if (clip.transitionOut && progress.out !== null) applyTransition(context, clip.transitionOut, progress.out, width, height, false);
  context.globalAlpha *= Math.max(0, Math.min(1, t.opacity));
  const filter = effectsFilter(clip.effects, height);
  const nativeFilters = canvasFiltersWork();
  if (filter && nativeFilters) context.filter = filter;
  // Move to the clip's centre, rotate and scale around it.
  context.translate(t.x * width, t.y * height);
  context.rotate((t.rotation * Math.PI) / 180);
  context.scale(t.scale, t.scale);
  if (source === 'title') {
    context.translate(-width / 2, -height / 2);
    drawTitle(context, clip.title!, width, height, time - clip.start, clipLength(clip));
    context.restore();
    return;
  }
  if (!source) {
    context.restore();
    return;
  }
  const sx = source.width * t.cropLeft;
  const sy = source.height * t.cropTop;
  const sw = Math.max(1, source.width * (1 - t.cropLeft - t.cropRight));
  const sh = Math.max(1, source.height * (1 - t.cropTop - t.cropBottom));
  const box = fitRect(sw, sh, width, height);
  const effects = clip.effects;
  const pixelWork = !!(effects?.chroma || effects?.sharpen || effects?.pixelate || (filter && !nativeFilters));
  if (!pixelWork) {
    context.drawImage(source.image, sx, sy, sw, sh, -box.width / 2, -box.height / 2, box.width, box.height);
    context.restore();
    return;
  }
  // Effects on pixels: draw the cropped picture at its final size, change it, then place it.
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  const work = scratchCanvas(w, h);
  const softBlur = !nativeFilters && (effects!.blur ?? 0) > 0;
  if (effects!.pixelate || softBlur) {
    // Pixelate draws blocks; without canvas filters, blur is faked by shrinking and smoothing back up.
    const block = Math.max(2, ((effects!.pixelate || effects!.blur) * height) / 720);
    const small = scratchSmall(Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)));
    small.drawImage(source.image, sx, sy, sw, sh, 0, 0, small.canvas.width, small.canvas.height);
    work.imageSmoothingEnabled = !effects!.pixelate;
    work.drawImage(small.canvas, 0, 0, w, h);
    work.imageSmoothingEnabled = true;
  } else {
    work.drawImage(source.image, sx, sy, sw, sh, 0, 0, w, h);
  }
  if (effects!.chroma || effects!.sharpen || (filter && !nativeFilters)) {
    const pixels = work.getImageData(0, 0, w, h);
    if (filter && !nativeFilters) colourEffects(pixels.data, effects!);
    if (effects!.chroma) chromaKey(pixels.data, hexToRgb(effects!.chromaColour ?? '#00ff00'), effects!.chroma);
    const data = effects!.sharpen ? sharpen(pixels.data, w, h, effects!.sharpen) : pixels.data;
    work.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  }
  context.drawImage(work.canvas, -box.width / 2, -box.height / 2, box.width, box.height);
  context.restore();
}

let smallCanvas: HTMLCanvasElement | null = null;
function scratchSmall(width: number, height: number): CanvasRenderingContext2D {
  smallCanvas ??= document.createElement('canvas');
  smallCanvas.width = width;
  smallCanvas.height = height;
  return smallCanvas.getContext('2d')!;
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
    if (hidden.has(clip.track) || clip.audioOnly) continue;
    if (clip.title) {
      drawClip(context, project, clip, time, 'title');
      continue;
    }
    const source = sourceFor(clip);
    if (!source || !source.width || !source.height) continue;
    drawClip(context, project, clip, time, source);
  }
}
