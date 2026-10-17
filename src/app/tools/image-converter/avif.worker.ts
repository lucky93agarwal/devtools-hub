/// <reference lib="webworker" />
import factory from '@jsquash/avif/codec/enc/avif_enc.js';

// Single-threaded build: the multi-threaded one needs cross-origin isolation,
// which this static site does not set. The .wasm file is copied to /avif/ at build time.
const encoder = factory({ noInitialRun: true, locateFile: (path) => `/avif/${path}` });

addEventListener(
  'message',
  async ({ data }: MessageEvent<{ image: ImageData; quality: number }>) => {
    try {
      const { image, quality } = data;
      const avif = (await encoder).encode(image.data, image.width, image.height, {
        // Same scale as the quality slider (0 to 100), like Squoosh.
        quality: Math.round(quality * 100),
        qualityAlpha: -1,
        denoiseLevel: 0,
        tileColsLog2: 0,
        tileRowsLog2: 0,
        // 0 is slowest and smallest, 10 fastest. 6 is the library default.
        speed: 6,
        subsample: 1,
        chromaDeltaQ: false,
        sharpness: 0,
        tune: 0,
        enableSharpYUV: false,
        bitDepth: 8,
      });
      if (!avif) throw new Error('AVIF encoding failed.');
      const buffer = avif.slice().buffer;
      postMessage({ avif: buffer }, [buffer]);
    } catch (e) {
      postMessage({ error: e instanceof Error ? e.message : 'AVIF encoding failed.' });
    }
  },
);
