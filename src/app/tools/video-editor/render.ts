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
  scaleRect,
  titleEntrance,
  transformAt,
  transitionGain,
  transitionProgress,
} from './project';
import { chromaKey, colourEffects, hexToRgb, noiseTile, rgbShift, sharpen } from './pixels';

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

/** Splits text into lines no wider than `maxWidth` (breaking at spaces; a single long word stays whole). */
export function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
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
  context.save();
  context.font = `700 ${size}px ${fontCss}`;
  // Long lines wrap so the title stays inside the frame.
  const allLines = wrapLines(context, title.text, width * 0.9);
  let lines = allLines;
  if (animation === 'typewriter' && p < 1) {
    let left = Math.floor(allLines.join('').length * p);
    lines = [];
    for (const line of allLines) {
      if (left <= 0) break;
      lines.push(line.slice(0, left));
      left -= line.length;
    }
    if (!lines.length) lines = [''];
  }
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
    default:
      maskPath(context, transition.type, p, width, height);
      context.clip();
  }
}

/** The growing shape of a mask transition (star, heart, clock…) at progress `p`; it covers the frame at 1. */
export function maskPath(context: CanvasRenderingContext2D, type: Transition['type'], p: number, width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const diagonal = Math.hypot(width, height);
  context.beginPath();
  switch (type) {
    case 'star': {
      // The inner corners must pass the frame corners, so the star grows past the frame.
      const outer = (p * diagonal) / 2 / 0.4;
      const inner = outer * 0.45;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? inner : outer;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i) context.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else context.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      context.closePath();
      break;
    }
    case 'heart': {
      const k = (p * diagonal * 1.7) / 32;
      // A classic heart curve, 32 units wide, centred.
      context.moveTo(cx, cy + 10 * k);
      context.bezierCurveTo(cx - 16 * k, cy, cx - 16 * k, cy - 12 * k, cx - 8 * k, cy - 12 * k);
      context.bezierCurveTo(cx - 3 * k, cy - 12 * k, cx, cy - 8 * k, cx, cy - 6 * k);
      context.bezierCurveTo(cx, cy - 8 * k, cx + 3 * k, cy - 12 * k, cx + 8 * k, cy - 12 * k);
      context.bezierCurveTo(cx + 16 * k, cy - 12 * k, cx + 16 * k, cy, cx, cy + 10 * k);
      context.closePath();
      break;
    }
    case 'diamond':
      context.moveTo(cx, cy - p * height);
      context.lineTo(cx + p * width, cy);
      context.lineTo(cx, cy + p * height);
      context.lineTo(cx - p * width, cy);
      context.closePath();
      break;
    case 'clock':
      // A hand sweeping round from twelve o'clock.
      context.moveTo(cx, cy);
      context.arc(cx, cy, diagonal, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      context.closePath();
      break;
    case 'blinds': {
      const strips = 10;
      const strip = height / strips;
      for (let i = 0; i < strips; i++) context.rect(0, i * strip, width, strip * p);
      break;
    }
    case 'checker': {
      const cols = 8;
      const rows = Math.max(1, Math.round((cols * height) / width));
      const w = width / cols;
      const h = height / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) context.rect(c * w + (w * (1 - p)) / 2, r * h + (h * (1 - p)) / 2, w * p, h * p);
      break;
    }
    case 'barn-door':
      context.rect(cx - (p * width) / 2, 0, p * width, height);
      break;
    default:
      context.rect(0, 0, width, height);
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
  const box = scaleRect(t.fit, sw, sh, width, height);
  const effects = clip.effects;
  if (effects?.mirror) context.scale(-1, 1);
  const pixelWork = !!(effects?.chroma || effects?.sharpen || effects?.pixelate || effects?.rgbShift || (filter && !nativeFilters));
  let picture: { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } = { image: source.image, sx, sy, sw, sh };
  if (pixelWork) {
    // Effects on pixels: draw the cropped picture at its final size, change it, then place it.
    const w = Math.max(1, Math.round(Math.min(box.width, width * 2)));
    const h = Math.max(1, Math.round(Math.min(box.height, height * 2)));
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
    if (effects!.chroma || effects!.sharpen || effects!.rgbShift || (filter && !nativeFilters)) {
      const pixels = work.getImageData(0, 0, w, h);
      if (filter && !nativeFilters) colourEffects(pixels.data, effects!);
      if (effects!.chroma) chromaKey(pixels.data, hexToRgb(effects!.chromaColour ?? '#00ff00'), effects!.chroma);
      let data: Uint8ClampedArray = effects!.sharpen ? sharpen(pixels.data, w, h, effects!.sharpen) : pixels.data;
      if (effects!.rgbShift) data = rgbShift(data, w, h, (effects!.rgbShift * w) / Math.max(1, box.width) * (height / 720));
      work.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
    }
    picture = { image: work.canvas, sx: 0, sy: 0, sw: w, sh: h };
  }
  const left = -box.width / 2;
  const top = -box.height / 2;
  if (effects?.wave) {
    // Rows of the picture slide left and right in a moving wave.
    const strips = 48;
    const amplitude = ((effects.wave / 100) * box.width) / 40;
    const local = time - clip.start;
    for (let i = 0; i < strips; i++) {
      const sy0 = picture.sy + (picture.sh * i) / strips;
      const dy = top + (box.height * i) / strips;
      const dx = Math.sin(i * 0.45 + local * 4) * amplitude;
      context.drawImage(picture.image, picture.sx, sy0, picture.sw, picture.sh / strips + 0.5, left + dx, dy, box.width, box.height / strips + 1);
    }
  } else {
    context.drawImage(picture.image, picture.sx, picture.sy, picture.sw, picture.sh, left, top, box.width, box.height);
  }
  if (effects?.grain || effects?.vignette) {
    context.filter = 'none';
    context.save();
    context.beginPath();
    context.rect(left, top, box.width, box.height);
    context.clip();
    if (effects.grain) {
      // Noise that changes every frame, mixed over the picture.
      const tile = grainTile(context);
      if (tile) {
        const frame = Math.floor((time - clip.start) * 24);
        context.globalAlpha *= Math.min(1, effects.grain / 100) * 0.45;
        context.globalCompositeOperation = 'overlay';
        context.translate(left - ((frame * 73) % 128), top - ((frame * 41) % 128));
        context.fillStyle = tile;
        context.fillRect(0, 0, box.width + 128, box.height + 128);
      }
    }
    context.restore();
    if (effects.vignette) {
      const radius = Math.hypot(box.width, box.height) / 2;
      const gradient = context.createRadialGradient(0, 0, radius * (1 - effects.vignette / 130), 0, 0, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, effects.vignette / 100)})`);
      context.fillStyle = gradient;
      context.fillRect(left, top, box.width, box.height);
    }
  }
  context.restore();
}

let grainCanvas: HTMLCanvasElement | null = null;
let grainPattern: CanvasPattern | null = null;
function grainTile(context: CanvasRenderingContext2D): CanvasPattern | null {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = grainCanvas.height = 256;
    grainCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(noiseTile(256, 7)), 256, 256), 0, 0);
  }
  grainPattern ??= context.createPattern(grainCanvas, 'repeat');
  return grainPattern;
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
  const background = project.background;
  context.fillStyle = background?.kind === 'colour' ? (background.colour ?? '#000000') : '#000000';
  context.fillRect(0, 0, width, height);
  const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
  const showing = clipsAt(project, time);
  if (background?.kind === 'blur') {
    // A big, soft, darker copy of the bottom picture fills the bars around it.
    const under = showing.find((c) => !hidden.has(c.track) && !c.audioOnly && !c.title);
    const source = under ? sourceFor(under) : null;
    if (source?.width && source.height) {
      const box = scaleRect('fill', source.width, source.height, width, height);
      const small = scratchSmall(32, Math.max(1, Math.round((32 * height) / width)));
      small.drawImage(source.image, 0, 0, source.width, source.height, (box.x / width) * 32, (box.y / height) * small.canvas.height, (box.width / width) * 32, (box.height / height) * small.canvas.height);
      context.save();
      // The blurred copy fades in and out with the picture it copies.
      context.globalAlpha = Math.max(0, Math.min(1, transitionGain(under!, time) * transformAt(under!, time).opacity));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(small.canvas, 0, 0, width, height);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(0, 0, width, height);
      context.restore();
    }
  }
  for (const clip of showing) {
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
