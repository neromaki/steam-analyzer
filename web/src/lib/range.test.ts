import { describe, expect, it } from 'vitest';
import {
  anyOverrides, clearAll, clearOverride, effective, isOverridden, rangeFromParams, rangeToParams,
  setGlobal, setGlobally, setOverride, type RangeState,
} from './range';

const g = { from: '2019-01', to: '2026-11' };
const a = { from: '2023-01', to: '2024-12' };
const b = { from: '2015-01', to: '2018-12' };
const base: RangeState = { global: g, overrides: {} };

describe('range scoping', () => {
  it('uses the global range unless overridden', () => {
    const s = setOverride(base, 'wave', a);
    expect(effective(s, 'wave')).toEqual(a);
    expect(effective(s, 'lineage')).toEqual(g);
    expect(isOverridden(s, 'wave')).toBe(true);
  });

  it('clear override returns that chart to the global range only', () => {
    const s = clearOverride(setOverride(setOverride(base, 'wave', a), 'table', b), 'wave');
    expect(effective(s, 'wave')).toEqual(g);
    expect(effective(s, 'table')).toEqual(b);
  });

  it('set globally moves the override to global, clears it, and keeps other overrides', () => {
    const s = setGlobally(setOverride(setOverride(base, 'wave', a), 'table', b), 'wave');
    expect(s.global).toEqual(a);
    expect(isOverridden(s, 'wave')).toBe(false);
    expect(effective(s, 'table')).toEqual(b);   // untouched
    expect(effective(s, 'lineage')).toEqual(a); // follows new global
  });

  it('updating the global range does not touch overrides', () => {
    const s = setGlobal(setOverride(base, 'table', b), a);
    expect(effective(s, 'table')).toEqual(b);
  });

  it('clear all removes every override', () => {
    const s = clearAll(setOverride(setOverride(base, 'wave', a), 'table', b));
    expect(anyOverrides(s)).toBe(false);
    expect(effective(s, 'table')).toEqual(g);
  });

  it('round-trips through URL params and leaves other params alone', () => {
    const s = setOverride(setOverride(base, 'wave', a), 'table', { from: null, to: '2020-06' });
    const sp = rangeToParams(s, new URLSearchParams('q=trains&ov.old=2000-01..2001-01'));
    expect(sp.get('q')).toBe('trains');
    expect(sp.get('ov.old')).toBeNull();
    expect(rangeFromParams(sp)).toEqual(s);
  });
});
