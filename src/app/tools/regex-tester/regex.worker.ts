/// <reference lib="webworker" />
// Runs a regular expression off the main thread, so a pattern that never finishes cannot freeze the page.
import { run } from './regex';

addEventListener('message', ({ data }: MessageEvent<{ id: number; pattern: string; flags: string; text: string; replacement: string | null }>) => {
  try {
    postMessage({ id: data.id, result: run(data.pattern, data.flags, data.text, data.replacement) });
  } catch (error) {
    postMessage({ id: data.id, error: (error as Error).message });
  }
});
