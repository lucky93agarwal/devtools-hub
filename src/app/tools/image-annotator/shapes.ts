/** The marks an annotation can have, and how each is drawn. */
import { Point } from '../../shared/canvas-pointer';

export type ShapeKind = 'arrow' | 'rect' | 'ellipse' | 'highlight' | 'text' | 'step';

export interface Shape {
  kind: ShapeKind;
  from: Point;
  to: Point;
  colour: string;
  /** Line width, or font size for text, in image pixels. */
  size: number;
  text?: string;
}

/** Arrowhead corner points for a line from `from` to `to`, with a head about `length` long. */
export function arrowHead(from: Point, to: Point, length: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - length * Math.cos(angle - spread), y: to.y - length * Math.sin(angle - spread) },
    { x: to.x - length * Math.cos(angle + spread), y: to.y - length * Math.sin(angle + spread) },
  ];
}

/** Breaks meme text into lines that fit `maxWidth`, using the context's current font. */
export function wrapText(context: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const MEME_FONT = "Impact, 'Anton', 'Arial Black', sans-serif";

export function drawShape(context: CanvasRenderingContext2D, shape: Shape, stepNumber = 0): void {
  const { from, to, colour, size } = shape;
  context.save();
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineWidth = size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  switch (shape.kind) {
    case 'arrow': {
      const [a, b] = arrowHead(from, to, size * 4);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.beginPath();
      context.moveTo(to.x, to.y);
      context.lineTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.closePath();
      context.fill();
      break;
    }
    case 'rect':
      context.strokeRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      break;
    case 'ellipse':
      context.beginPath();
      context.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
      context.stroke();
      break;
    case 'highlight':
      context.globalAlpha = 0.35;
      context.fillRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      break;
    case 'text':
      context.font = `700 ${size}px ${FONT}`;
      context.textBaseline = 'top';
      context.lineWidth = size / 6;
      context.strokeStyle = contrast(colour);
      for (const [i, line] of (shape.text ?? '').split('\n').entries()) {
        context.strokeText(line, from.x, from.y + i * size * 1.2);
        context.fillText(line, from.x, from.y + i * size * 1.2);
      }
      break;
    case 'step': {
      // A numbered circle, for step-by-step screenshots.
      const radius = size * 2.2;
      context.beginPath();
      context.arc(from.x, from.y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = contrast(colour);
      context.font = `700 ${radius * 1.1}px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(stepNumber), from.x, from.y + radius * 0.05);
      break;
    }
  }
  context.restore();
}

/** Classic meme caption: white capitals with a black outline, centred and wrapped. */
export function drawMemeText(context: CanvasRenderingContext2D, text: string, width: number, height: number, position: 'top' | 'bottom'): void {
  if (!text.trim()) return;
  const size = Math.round(width / 10);
  context.save();
  context.font = `${size}px ${MEME_FONT}`;
  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#000000';
  context.lineWidth = size / 8;
  context.lineJoin = 'round';
  const lines = wrapText(context, text.toUpperCase(), width * 0.92);
  const lineHeight = size * 1.05;
  const margin = size * 0.35;
  context.textBaseline = position === 'top' ? 'top' : 'bottom';
  lines.forEach((line, i) => {
    const y = position === 'top' ? margin + i * lineHeight : height - margin - (lines.length - 1 - i) * lineHeight;
    context.strokeText(line, width / 2, y);
    context.fillText(line, width / 2, y);
  });
  context.restore();
}

/** Black or white, whichever stands out against `colour`. */
export function contrast(colour: string): string {
  const value = parseInt(colour.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#ffffff';
}
