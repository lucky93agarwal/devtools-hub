# Background remover: model and licence check (day 19)

Checked on 16 October 2026. Licences were read from each project's own source
(the Hugging Face API licence field, the GitHub licence file, or npm), not from
third-party listings, which got at least one of them wrong.

## Candidates

| Model | Licence (source) | Download | Input | Result |
|---|---|---|---|---|
| U2-Netp | Apache-2.0 (xuebinqin/U-2-Net) | 4.4 MB | 320x320 | **Chosen.** Runs on the CPU in about 5 s for a 1600x1600 photo on an M-series Mac. Small enough for this site to serve. |
| BiRefNet_lite fp16 | MIT (onnx-community/BiRefNet_lite-ONNX, ZhengPeng7/BiRefNet_lite) | 109 MB | 1024x1024 fixed | Did not run in Chrome 152 on Apple Metal: the WebGPU engine needs 11 storage buffers per shader (Apple GPUs allow 10), and the CPU and JSEP paths ran out of WebAssembly memory. Kept in the code for later tests (`?model=birefnet-lite` on the test page). |
| MODNet | Apache-2.0 (Xenova/modnet) | 6.3 MB (quantised) | 512 | Not chosen: trained for people (portraits) only. |
| BRIA RMBG-1.4 / 2.0 | Non-commercial ("other", BRIA licence) | - | - | Excluded. |
| ISNet (onnx-community/ISNet-ONNX) | AGPL-3.0 | - | - | Excluded. A third-party listing called it Apache-2.0. |
| @imgly/background-removal | AGPL-3.0 | - | - | Excluded. |

Runtime: onnxruntime-web 1.30.0 (MIT), CPU (WebAssembly) build.

## Hosting

Cloudflare Workers static assets allow at most 25 MiB per file. U2-Netp (4.4 MB)
and the ONNX Runtime CPU WebAssembly file (13.6 MB) fit, so the site serves both
itself and nothing is fetched from another domain. BiRefNet (109 MB) and the
WebGPU runtime (27 MB) would have to come from Hugging Face and jsDelivr, or from
Cloudflare R2.

The model's licence is published next to it at `/models/u2netp.LICENSE.txt`.

## Open points for day 20 and later

- U2-Netp is small and fast but less precise on hair and fine edges than BiRefNet.
- Retest BiRefNet when ONNX Runtime or Chrome raise the storage buffer limit, or try
  it in Safari and on Windows GPUs, which may allow more.
- Test speed and memory on a real phone.
- Run the model in a Web Worker so the page stays responsive during the 5 s.
