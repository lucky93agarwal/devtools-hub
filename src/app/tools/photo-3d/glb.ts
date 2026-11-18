/** Writes the 3D relief as a binary glTF (.glb) file, which Blender, three.js, Windows 3D Viewer and AR apps open. */
import { Mesh } from './mesh';

const pad4 = (n: number) => (n + 3) & ~3;

/**
 * A GLB with one textured, double-sided mesh. `depthScale` sets how far near parts
 * stand out; the photo is the colour texture, shown unlit so it looks like the photo.
 */
export function writeGlb(mesh: Mesh, jpeg: Uint8Array, depthScale: number): Uint8Array {
  const count = mesh.depths.length;
  const positions = new Float32Array(count * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], (mesh.depths[i] - 0.5) * depthScale];
    positions.set(p, i * 3);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  const parts = [
    new Uint8Array(positions.buffer),
    new Uint8Array(mesh.uvs.buffer, mesh.uvs.byteOffset, mesh.uvs.byteLength),
    new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength),
    jpeg,
  ];
  const offsets: number[] = [];
  let length = 0;
  for (const part of parts) {
    offsets.push(length);
    length = pad4(length + part.length);
  }
  const gltf = {
    asset: { version: '2.0', generator: 'DevTools24 3D Photo Maker' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Photo' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [
      {
        name: 'Photo',
        doubleSided: true,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 3, mimeType: 'image/jpeg' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: mesh.indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: parts[0].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: parts[1].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: parts[2].length, target: 34963 },
      { buffer: 0, byteOffset: offsets[3], byteLength: parts[3].length },
    ],
    buffers: [{ byteLength: length }],
  };
  // The JSON chunk is padded with spaces and the binary chunk with zeros, as the format requires.
  let json = JSON.stringify(gltf);
  json += ' '.repeat(pad4(json.length) - json.length);
  const jsonBytes = new TextEncoder().encode(json);
  const total = 12 + 8 + jsonBytes.length + 8 + length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  const bin = 20 + jsonBytes.length;
  view.setUint32(bin, length, true);
  view.setUint32(bin + 4, 0x004e4942, true); // "BIN"
  parts.forEach((part, i) => out.set(part, bin + 8 + offsets[i]));
  return out;
}
