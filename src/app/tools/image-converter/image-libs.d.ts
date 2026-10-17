// Minimal typings for the parts of the image libraries this tool uses.

declare module 'utif' {
  interface Ifd {
    width: number;
    height: number;
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
    encodeImage(rgba: ArrayBuffer, width: number, height: number): ArrayBuffer;
  };
  export default UTIF;
}

declare module 'gifenc/dist/gifenc.esm.js' {
  type Palette = number[][];
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number },
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: Palette; transparent?: boolean; transparentIndex?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}

declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      done: (result: { data: Uint8ClampedArray } | null) => void,
    ): void;
    free?(): void;
  }
  interface Libheif {
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
  }
  const factory: () => Libheif | Promise<Libheif>;
  export default factory;
}

declare module '@jsquash/avif/codec/enc/avif_enc.js' {
  interface AvifModule {
    encode(
      data: BufferSource,
      width: number,
      height: number,
      options: Record<string, number | boolean>,
    ): Uint8Array | null;
  }
  const factory: (options: {
    noInitialRun?: boolean;
    locateFile?: (path: string) => string;
  }) => Promise<AvifModule>;
  export default factory;
}
