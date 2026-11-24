import { describe, expect, it } from 'vitest';
import type { LeaderRow } from './api';
import { OFF, PRESETS } from './floor';
import { currentWaves, graceQ, lastCleanQ, radarTags, risingByQuarter, type TagQuarters } from './home';

const Q = (y: number, q: number) => y * 4 + q - 1;

describe('clean quarters', () => {
  it('stops before the grace period under the default floor', () => {
    // 21 Nov 2026 − 90 days = 23 Aug 2026 (Q3), so Q3 is affected and Q2 is the last clean one.
    expect(graceQ('2026-11-21', PRESETS.default)).toBe(Q(2026, 3));
    expect(lastCleanQ('2026-11-21', PRESETS.default)).toBe(Q(2026, 2));
  });
  it('uses the last complete quarter with the floor off', () => {
    expect(graceQ('2026-11-21', OFF)).toBeNull();
    expect(lastCleanQ('2026-11-21', OFF)).toBe(Q(2026, 3));
  });
});

describe('risingByQuarter', () => {
  // 12 quarters of 100 releases; tag 1 goes 5 → 20 a quarter, tag 2 stays at 10.
  const q0 = Q(2024, 1);
  const d: TagQuarters = { q0, lq: q0 + 11, totals: Array(12).fill(100), rows: [] };
  for (let i = 0; i < 12; i++) d.rows.push([1, q0 + i, i < 8 ? 5 : 20], [2, q0 + i, 10]);

  it('compares the 4 quarters to endQ with the 4 before', () => {
    const r = risingByQuarter(d, q0 + 11, 1);
    const t1 = r.find(x => x.id === 1)!, t2 = r.find(x => x.id === 2)!;
    expect(t1.now).toBe(80);
    expect(t1.before).toBe(20);
    expect(t1.shareNow).toBeCloseTo(20);
    expect(t1.change).toBeCloseTo(15);
    expect(t1.growth).toBeCloseTo((80 / 400) / (21 / 400));
    expect(t2.change).toBeCloseTo(0);
    expect(t1.spark).toHaveLength(12);
    expect(t1.spark[11]).toBeCloseTo(20);
  });
  it('drops tags below the minimum', () => {
    expect(risingByQuarter(d, q0 + 11, 50).map(x => x.id)).toEqual([1]);
  });
});

describe('currentWaves', () => {
  const row = (appid: number, share: number[], before: number): LeaderRow => ({
    preset: 'default', rank: 1, appid, lift: 2, share_before: before, share_after: 1, excess: 10, n_after: 10, score: 1,
    first_q: Q(2020, 1), share, followers: [],
  });
  const flat = (v: number, n: number) => Array(n).fill(v);
  it('keeps hits still well above their pre-release share, biggest gain first', () => {
    const a = row(1, [...flat(0.1, 12), ...flat(1, 12)], 0.1);   // released 2023 Q1, still at 1%
    const b = row(2, [...flat(0.1, 12), ...flat(0.5, 12)], 0.1);
    const faded = row(3, [...flat(0.1, 12), ...flat(1, 6), ...flat(0.1, 6)], 0.1);
    const rq = new Map([[1, Q(2023, 1)], [2, Q(2023, 1)], [3, Q(2023, 1)]]);
    const w = currentWaves([b, faded, a], rq, Q(2025, 4));
    expect(w.map(x => x.row.appid)).toEqual([1, 2]);
    expect(w[0].nowShare).toBeCloseTo(1);
    expect(w[0].gain).toBeCloseTo(0.9);
    expect(w[0].spark[0]).toBeCloseTo(0.1);
  });
  it('skips games too new to have a window after release', () => {
    expect(currentWaves([row(1, flat(1, 24), 0.1)], new Map([[1, Q(2025, 3)]]), Q(2025, 4))).toEqual([]);
  });
});

describe('radarTags', () => {
  it('compares shares of upcoming and recent games', () => {
    const r = radarTags({ n_soon: 1000, n_recent: 2000, rows: [[1, 100, 100], [2, 5, 50]] }, 10);
    expect(r).toHaveLength(1);
    expect(r[0].shareSoon).toBeCloseTo(10);
    expect(r[0].shareRecent).toBeCloseTo(5);
    expect(r[0].ratio).toBeCloseTo(0.1 / (101 / 2000));
  });
});
