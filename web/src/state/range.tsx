// Date-range scoping for a page: one global range plus per-chart/table overrides, all in the URL.
// Pages wrap their content in <RangeScope>; charts and tables call useScopedRange(id).
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  OPEN, anyOverrides, clearAll, clearOverride, effective, isOverridden, rangeFromParams, rangeToParams,
  setGlobal, setGlobally, setOverride, type Range, type RangeState,
} from '../lib/range';

interface Ctx {
  state: RangeState;
  update: (fn: (s: RangeState) => RangeState) => void;
  defaultGlobal: Range;
}

const RangeCtx = createContext<Ctx | null>(null);

export function RangeScope({ children, defaultGlobal = OPEN }: { children: ReactNode; defaultGlobal?: Range }) {
  const [sp, setSp] = useSearchParams();
  const raw = sp.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from the query string only
  const state = useMemo(() => rangeFromParams(sp, defaultGlobal), [raw, defaultGlobal.from, defaultGlobal.to]);
  const update = useCallback(
    (fn: (s: RangeState) => RangeState) =>
      setSp(prev => rangeToParams(fn(rangeFromParams(prev, defaultGlobal)), prev, defaultGlobal), { replace: true }),
    [setSp, defaultGlobal],
  );
  const value = useMemo(() => ({ state, update, defaultGlobal }), [state, update, defaultGlobal]);
  return <RangeCtx.Provider value={value}>{children}</RangeCtx.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(RangeCtx);
  if (!c) throw new Error('useScopedRange/useGlobalRange must be used inside <RangeScope>.');
  return c;
}

/** The page-wide range and the "Clear all overrides" action. */
export function useGlobalRange() {
  const { state, update, defaultGlobal } = useCtx();
  return {
    range: state.global,
    defaultRange: defaultGlobal,
    set: (r: Range) => update(s => setGlobal(s, r)),
    hasOverrides: anyOverrides(state),
    overrideCount: Object.keys(state.overrides).length,
    clearAll: () => update(clearAll),
  };
}

/** The range one chart or table should use, and its override controls. */
export function useScopedRange(id: string) {
  const { state, update } = useCtx();
  return {
    range: effective(state, id),
    global: state.global,
    overridden: isOverridden(state, id),
    setLocal: (r: Range) => update(s => setOverride(s, id, r)),
    clear: () => update(s => clearOverride(s, id)),
    setGlobally: () => update(s => setGlobally(s, id)),
  };
}
