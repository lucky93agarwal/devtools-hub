/**
 * Draws the "3D photo" effect with WebGL: each pixel is shifted by the camera
 * movement times its depth, with a short ray march so near objects cover what is
 * behind them instead of smearing.
 */

const VERTEX = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D image;
uniform sampler2D depth;
uniform vec2 offset;
uniform float dolly;
uniform float focus;
uniform float zoom;
const int STEPS = 32;
void main() {
  vec2 base = (vUv - 0.5) / zoom + 0.5;
  vec2 move = offset + (base - 0.5) * dolly;
  vec2 uv = base + move * (0.0 - focus);
  for (int i = 0; i <= STEPS; i++) {
    float h = 1.0 - float(i) / float(STEPS);
    vec2 p = base + move * (h - focus);
    if (texture2D(depth, p).r >= h) {
      uv = p;
      break;
    }
  }
  gl_FragColor = texture2D(image, clamp(uv, 0.0, 1.0));
}`;

export interface View {
  /** Camera movement, about -1 to 1 on each axis, already scaled by strength. */
  x: number;
  y: number;
  /** Push-in movement for the zoom animation. */
  dolly: number;
  /** Depth (0 far to 1 near) that stays still. */
  focus: number;
  /** Slight zoom so moved edges never show outside the photo. */
  zoom: number;
}

export class Photo3dRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly textures: { image: WebGLTexture; depth: WebGLTexture };
  private readonly uniforms: Record<'offset' | 'dolly' | 'focus' | 'zoom' | 'image' | 'depth', WebGLUniformLocation | null>;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('This browser cannot show 3D photos (no WebGL).');
    this.gl = gl;
    const program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('The 3D view could not start.');
    gl.useProgram(program);
    this.program = program;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.textures = { image: this.texture(), depth: this.texture() };
    const at = (name: string) => gl.getUniformLocation(program, name);
    this.uniforms = { offset: at('offset'), dolly: at('dolly'), focus: at('focus'), zoom: at('zoom'), image: at('image'), depth: at('depth') };
    gl.uniform1i(this.uniforms.image, 0);
    gl.uniform1i(this.uniforms.depth, 1);
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  setImage(source: TexImageSource): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.image);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /** Depth as one byte per pixel (0 far, 255 near). */
  setDepth(depth: Uint8Array | Uint8ClampedArray, width: number, height: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.depth);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(depth.buffer, depth.byteOffset, depth.length));
  }

  draw(view: View): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.offset, view.x, view.y);
    gl.uniform1f(this.uniforms.dolly, view.dolly);
    gl.uniform1f(this.uniforms.focus, view.focus);
    gl.uniform1f(this.uniforms.zoom, view.zoom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.gl.deleteTexture(this.textures.image);
    this.gl.deleteTexture(this.textures.depth);
    this.gl.deleteProgram(this.program);
  }
}

export type Motion = 'follow' | 'circle' | 'sway' | 'bob' | 'zoom';

/** Camera position for an animation at time t (0 to 1 is one loop). */
export function motionAt(motion: Exclude<Motion, 'follow'>, t: number): { x: number; y: number; dolly: number } {
  const a = t * Math.PI * 2;
  switch (motion) {
    case 'circle':
      return { x: Math.cos(a), y: Math.sin(a) * 0.6, dolly: 0 };
    case 'sway':
      return { x: Math.sin(a), y: 0, dolly: 0 };
    case 'bob':
      return { x: 0, y: Math.sin(a), dolly: 0 };
    case 'zoom':
      return { x: 0, y: 0, dolly: (1 - Math.cos(a)) / 2 };
  }
}

/** Softens the depth map a little, which hides tearing at object edges. */
export function smoothDepth(depth: Uint8ClampedArray, width: number, height: number, radius = 2): Uint8ClampedArray {
  const pass = (input: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const px = horizontal ? x + k : x;
          const py = horizontal ? y : y + k;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          sum += input[py * width + px];
          count++;
        }
        out[y * width + x] = sum / count;
      }
    }
    return out;
  };
  return pass(pass(depth, true), false);
}
