import { Mesh, Mat4, multiply, orbitView, perspective } from './mesh';

const VERTEX = `
attribute vec2 position;
attribute vec2 uv;
attribute float depth;
uniform mat4 matrix;
uniform float depthScale;
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vec3 p = vec3(position, (depth - 0.5) * depthScale);
  vPos = p;
  gl_Position = matrix * vec4(p, 1.0);
}`;

/** With derivatives the surface gets soft light and shade, which shows its shape when turned. */
const FRAGMENT = (derivatives: boolean) => `
${derivatives ? '#extension GL_OES_standard_derivatives : enable' : ''}
precision highp float;
varying vec2 vUv;
varying vec3 vPos;
uniform sampler2D image;
uniform float shading;
void main() {
  vec4 colour = texture2D(image, vUv);
  float light = 1.0;
  ${
    derivatives
      ? `vec3 normal = normalize(cross(dFdx(vPos), dFdy(vPos)));
  light = mix(1.0, 0.55 + 0.45 * abs(dot(normal, normalize(vec3(0.3, 0.5, 1.0)))), shading);`
      : ''
  }
  // The back of the surface is shown darker, so it is clear you are behind the photo.
  if (!gl_FrontFacing) light *= 0.45;
  gl_FragColor = vec4(colour.rgb * light, 1.0);
}`;

export interface Orbit {
  yaw: number;
  pitch: number;
  distance: number;
  depthScale: number;
}

/** Draws the photo as a 3D relief that can be turned to any side. */
export class ModelRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly buffers: WebGLBuffer[] = [];
  private indexCount = 0;
  private readonly at: (name: string) => WebGLUniformLocation | null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('This browser cannot show 3D models (no WebGL).');
    this.gl = gl;
    const derivatives = !!gl.getExtension('OES_standard_derivatives');
    const program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT(derivatives)],
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
    this.at = (name) => gl.getUniformLocation(program, name);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.at('image'), 0);
    gl.uniform1f(this.at('shading'), derivatives ? 1 : 0);
    gl.enable(gl.DEPTH_TEST);
  }

  setModel(image: TexImageSource, mesh: Mesh): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    this.buffers.length = 0;
    const xy = new Float32Array((mesh.positions.length / 3) * 2);
    for (let i = 0; i < xy.length / 2; i++) xy.set([mesh.positions[i * 3], mesh.positions[i * 3 + 1]], i * 2);
    this.attribute('position', xy, 2);
    this.attribute('uv', mesh.uvs, 2);
    this.attribute('depth', mesh.depths, 1);
    const index = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.buffers.push(index);
    this.indexCount = mesh.indices.length;
  }

  private attribute(name: string, data: Float32Array, size: number): void {
    const gl = this.gl;
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    this.buffers.push(buffer);
  }

  draw(orbit: Orbit, background: [number, number, number]): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const matrix: Mat4 = multiply(
      perspective(Math.PI / 4, this.canvas.width / this.canvas.height, 0.05, 100),
      orbitView(orbit.yaw, orbit.pitch, orbit.distance),
    );
    gl.uniformMatrix4fv(this.at('matrix'), false, matrix);
    gl.uniform1f(this.at('depthScale'), orbit.depthScale);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  dispose(): void {
    for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }
}
