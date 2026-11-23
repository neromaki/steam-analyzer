// Date-range scoping: one global range drives every chart and table on a page; any chart or
// table may override it locally. Pure functions (the React hook lives in RangeScope.tsx).
//
// Rules:
//  - effective(id) = override[id] ?? global
//  - clearOverride(id) removes just that override
//  - setGlobally(id) makes that override the global range and removes it, leaving every
//    other override untouched
//  - clearAll() removes every override
// State is serialised into the URL: `range=2019-01..2026-11` and `ov.<id>=2020-01..2022-12`.

export interface Range {
  from: string | null; // 'YYYY-MM' (inclusive), null = open
  to: string | null;
}

export interface RangeState {
  global: Range;
  overrides: Record<string, Range>;
}

export const OPEN: Range = { from: null, to: null };

export function effective(s: RangeState, id: string): Range {
  return s.overrides[id] ?? s.global;
}

export function isOverridden(s: RangeState, id: string): boolean {
  return id in s.overrides;
}

export function setOverride(s: RangeState, id: string, r: Range): RangeState {
  return { ...s, overrides: { ...s.overrides, [id]: r } };
}

export function clearOverride(s: RangeState, id: string): RangeState {
  if (!(id in s.overrides)) return s;
  const { [id]: _drop, ...rest } = s.overrides;
  return { ...s, overrides: rest };
}

export function setGlobally(s: RangeState, id: string): RangeState {
  const r = s.overrides[id];
  if (!r) return s;
  return clearOverride({ ...s, global: r }, id);
}

export function setGlobal(s: RangeState, r: Range): RangeState {
  return { ...s, global: r };
}

export function clearAll(s: RangeState): RangeState {
  return { ...s, overrides: {} };
}

export function anyOverrides(s: RangeState): boolean {
  return Object.keys(s.overrides).length > 0;
}

// ---------------------------------------------------------------- URL encoding

const enc = (r: Range) => `${r.from ?? ''}..${r.to ?? ''}`;
function dec(v: string | null): Range | null {
  if (!v || !v.includes('..')) return null;
  const [a, b] = v.split('..');
  const ok = (x: string) => /^\d{4}-\d{2}$/.test(x);
  return { from: ok(a) ? a : null, to: ok(b) ? b : null };
}

export function rangeFromParams(sp: URLSearchParams, defaultGlobal: Range = OPEN): RangeState {
  const overrides: Record<string, Range> = {};
  sp.forEach((v, k) => {
    if (k.startsWith('ov.')) {
      const r = dec(v);
      if (r) overrides[k.slice(3)] = r;
    }
  });
  return { global: dec(sp.get('range')) ?? defaultGlobal, overrides };
}

export function rangeToParams(s: RangeState, prev: URLSearchParams, defaultGlobal: Range = OPEN): URLSearchParams {
  const sp = new URLSearchParams(prev);
  [...sp.keys()].filter(k => k.startsWith('ov.')).forEach(k => sp.delete(k));
  if (s.global.from === defaultGlobal.from && s.global.to === defaultGlobal.to) sp.delete('range');
  else sp.set('range', enc(s.global));
  for (const [id, r] of Object.entries(s.overrides)) sp.set(`ov.${id}`, enc(r));
  return sp;
}

// ---------------------------------------------------------------- helpers

/** Absolute quarter index (year*4 + q) for a 'YYYY-MM' bound. */
export function monthToQ(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 4 + Math.floor((mo - 1) / 3);
}

export function inRange(dateIso: string | null | undefined, r: Range): boolean {
  if (!dateIso) return false;
  const m = dateIso.slice(0, 7);
  return (!r.from || m >= r.from) && (!r.to || m <= r.to);
}

export function rangeLabel(r: Range): string {
  if (!r.from && !r.to) return 'All time';
  return `${r.from ?? '…'} – ${r.to ?? 'now'}`;
}
