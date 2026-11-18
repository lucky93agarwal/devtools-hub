/// <reference lib="webworker" />
// Fills the painted area off the main thread, so the page stays responsive.
import { InpaintOptions, inpaint } from './inpaint';

export interface InpaintRequest {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  mask: Uint8Array;
  options: InpaintOptions;
}

addEventListener('message', ({ data: request }: MessageEvent<InpaintRequest>) => {
  inpaint(request.data, request.width, request.height, request.mask, request.options);
  postMessage(request.data, [request.data.buffer]);
});
