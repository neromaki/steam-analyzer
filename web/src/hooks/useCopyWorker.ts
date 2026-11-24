// Runs the copy analysis (lib/copies.ts) in a worker; the latest request wins.
import { useEffect, useRef, useState } from 'react';
import type { CopyInput, CopyResult } from '../lib/copies';

export function useCopyWorker(input: CopyInput | null) {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [out, setOut] = useState<{ result: CopyResult; ms: number; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    worker.current = new Worker(new URL('../lib/copies.worker.ts', import.meta.url), { type: 'module' });
    worker.current.onmessage = (e: MessageEvent<{ id: number; result: CopyResult; ms: number }>) => {
      if (e.data.id === seq.current) { setOut(e.data); setBusy(false); }
    };
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!input || !worker.current) return;
    const id = ++seq.current;
    setBusy(true);
    worker.current.postMessage({ id, input });
  }, [input]);
  return { out, busy };
}

