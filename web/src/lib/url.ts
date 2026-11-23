// URL state: every filter, sort, range and slider lives in the query string so any view can be
// shared. "Global" params (the quality floor) travel with every in-app link.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const GLOBAL_KEYS = ['floor', 'fl'] as const;

/** Update the current URL's params in one step (replaces the history entry by default). */
export function useUpdateParams() {
  const [, setSp] = useSearchParams();
  return useCallback(
    (fn: (sp: URLSearchParams) => void, opts: { push?: boolean } = {}) =>
      setSp(prev => {
        const next = new URLSearchParams(prev);
        fn(next);
        return next;
      }, { replace: !opts.push }),
    [setSp],
  );
}

/** Build an in-app link that keeps the global params from `current`. */
export function linkWith(path: string, current: URLSearchParams, params: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  for (const k of GLOBAL_KEYS) {
    const v = current.get(k);
    if (v != null) sp.set(k, v);
  }
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** `useLink()(path, params)` — linkWith bound to the current URL. */
export function useLink() {
  const [sp] = useSearchParams();
  return useCallback((path: string, params?: Record<string, string | null | undefined>) => linkWith(path, sp, params), [sp]);
}

/** Comma-separated id lists, e.g. `tags=492,1036`. */
export function idsParam(sp: URLSearchParams, key: string): number[] {
  return (sp.get(key) ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
}

export function setIds(sp: URLSearchParams, key: string, ids: number[]) {
  if (ids.length) sp.set(key, [...new Set(ids)].join(','));
  else sp.delete(key);
}
