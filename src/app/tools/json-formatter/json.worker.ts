/// <reference lib="webworker" />
// Formats or minifies JSON off the main thread, so large files do not freeze the page.
import { JsonJob, runJsonJob } from './json-tools';

addEventListener('message', ({ data }: MessageEvent<{ id: number; job: JsonJob }>) => {
  postMessage({ id: data.id, result: runJsonJob(data.job) });
});
