// Runs the copy analysis off the main thread (a few hundred ms for big themes).
import { copyAnalysis, type CopyInput } from './copies';

self.onmessage = (e: MessageEvent<{ id: number; input: CopyInput }>) => {
  const t0 = performance.now();
  const result = copyAnalysis(e.data.input);
  self.postMessage({ id: e.data.id, result, ms: Math.round(performance.now() - t0) });
};
