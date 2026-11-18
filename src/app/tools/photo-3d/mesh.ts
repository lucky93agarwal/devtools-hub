/**
 * Turns a photo and its depth map into a 3D relief surface: a grid whose points
 * are pushed towards the viewer by how near they are. Used for the rotatable
 * 3D model view and the GLB download.
 */

export interface Mesh {
  /** x, y, z per vertex. x spans -aspect..aspect, y -1..1, z 0..1 before scaling. */
  positions: Float32Array;
  /** u, v per vertex (0..1, v from the top). */
  uvs: Float32Array;
  /** The depth value (0..1) per vertex, so the depth scale can change without a rebuild. */
  depths: Float32Array;
  indices: Uint16Array;
  columns: number;
  rows: number;
}

/** Most vertices, so indices fit in 16 bits (WebGL 1 and every glTF viewer handle that). */
const MAX_VERTICES = 65_000;

/** Grid size for an image's shape, as many points as 16-bit indices allow. */
export function gridSize(aspect: number): { columns: number; rows: number } {
  const rows = Math.floor(Math.sqrt(MAX_VERTICES / aspect));
  const columns = Math.floor(MAX_VERTICES / rows);
  return { columns: Math.max(2, Math.min(columns, Math.round(rows * aspect))), rows: Math.max(2, rows) };
}

/** Samples the depth map (0..255 bytes) with bilinear filtering at u, v in 0..1. */
export function sampleDepth(depth: Uint8Array | Uint8ClampedArray, width: number, height: number, u: number, v: number): number {
  const x = Math.min(width - 1, Math.max(0, u * (width - 1)));
  const y = Math.min(height - 1, Math.max(0, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number) => depth[py * width + px];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

export function buildMesh(depth: Uint8Array | Uint8ClampedArray, depthWidth: number, depthHeight: number, aspect: number): Mesh {
  const { columns, rows } = gridSize(aspect);
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const depths = new Float32Array(count);
  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1);
    for (let col = 0; col < columns; col++) {
      const u = col / (columns - 1);
      const i = row * columns + col;
      const d = sampleDepth(depth, depthWidth, depthHeight, u, v);
      positions.set([(u * 2 - 1) * aspect, 1 - v * 2, d], i * 3);
      uvs.set([u, v], i * 2);
      depths[i] = d;
    }
  }
  const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
  let k = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < columns - 1; col++) {
      const a = row * columns + col;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { positions, uvs, depths, indices, columns, rows };
}

/** Column-major 4×4 matrices, as WebGL wants them. */
export type Mat4 = Float32Array;

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** The camera orbiting the model: yaw turns around the vertical axis, pitch tilts up and down. */
export function orbitView(yaw: number, pitch: number, distance: number): Mat4 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Rotation of the model (yaw then pitch), then move it away from the camera.
  const rotateY = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rotateX = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
  const translate = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1]);
  return multiply(translate, multiply(rotateX, rotateY));
}
