import { describe, expect, it } from 'vitest';
import type { QTotal } from './api';
import { monthToQ, qLabel, relatedTags, shareSeries, tagStats, takeoff, type SeriesRow, type TagCountRow } from './trends';

const Q = (y: number, q: number) => y * 4 + q;

describe('quarters', () => {
  it('numbers and labels quarters like release_q', () => {
    expect(monthToQ('2024-01')).toBe(Q(2024, 0));
    expect(monthToQ('2024-12')).toBe(Q(2024, 3));
    expect(qLabel(Q(2025, 1))).toBe('2025 Q2');
  });
});

describe('shareSeries', () => {
  // 100 releases a quarter, theme has 10 (2 core); this year (2026) to Q2 only.
  const totals: QTotal[] = [];
  const rows: SeriesRow[] = [];
  for (let y = 2024; y <= 2026; y++) for (let q = 0; q < 4; q++) {
    if (y === 2026 && q > 1) continue;
    const ytd = q <= 1; // pretend "same dates" = first half
    totals.push([Q(y, q), ytd, 100]);
    rows.push([Q(y, q), ytd, 10, 2]);
  }
  const dataQ = Q(2026, 1);

  it('by year marks the partial current year', () => {
    const s = shareSeries(rows, totals, 'year', { from: null, to: null }, dataQ, Q(2024, 0));
    expect(s.labels).toEqual(['2024', '2025', '2026*']);
    expect(s.any).toEqual([10, 10, 10]);
    expect(s.core).toEqual([2, 2, 2]);
    expect(s.total).toEqual([400, 400, 200]);
  });

  it('same-dates counts only ytd rows', () => {
    const s = shareSeries(rows, totals, 'ytd', { from: null, to: null }, dataQ, Q(2024, 0));
    expect(s.total).toEqual([200, 200, 200]);
  });

  it('trims to the range', () => {
    const s = shareSeries(rows, totals, 'quarter', { from: '2025-04', to: '2025-09' }, dataQ, Q(2024, 0));
    expect(s.labels).toEqual(['2025 Q2', '2025 Q3']);
    expect(s.nAny).toEqual([10, 10]);
  });
});

describe('takeoff', () => {
  it('finds a sustained rise and ignores a blip', () => {
    const flat = new Array(16).fill(1);
    // the rolling mean first reaches 1.5x at index 16 (3,1,1,1); that window starts at 13
    expect(takeoff([...flat, ...new Array(8).fill(3)], new Array(24).fill(20))).toBe(13);
    expect(takeoff([...flat, 5, 1, 1, 1, 1, 1, 1, 1], new Array(24).fill(20))).toBeNull();
  });
  it('needs 10+ games in the window', () => {
    const v = [...new Array(16).fill(1), ...new Array(8).fill(3)];
    expect(takeoff(v, new Array(24).fill(1))).toBeNull();
  });
});

describe('tag table maths', () => {
  const g = { n_all: 1000, n_range: 1000, n_ytd: 200, n_prev_ytd: 100, n_soon: 50 };
  it('computes share, change and smoothed growth', () => {
    const [s] = tagStats([[7, 50, 40, 20, 4, 3]], g, g);
    expect(s.shareYtd).toBe(10);
    expect(s.sharePrev).toBe(4);
    expect(s.change).toBeCloseTo(6);
    expect(s.growth).toBeCloseTo((20 / 200) / (5 / 100)); // ×2
    expect(s.total).toBe(40);
  });

  it('related tags: distinctive needs lift, rising needs recent games', () => {
    const theme: TagCountRow[] = [[1, 50, 0, 10, 2, 0], [2, 50, 0, 1, 1, 0], [3, 4, 0, 4, 0, 0]];
    const tt = { n_all: 100, n_range: 0, n_ytd: 20, n_prev_ytd: 20, n_soon: 0 };
    const all = new Map([[1, 100], [2, 500], [3, 10]]);
    const at = 1000;
    expect(relatedTags(theme, tt, all, at, 'distinctive', new Set()).map(r => r.id)).toEqual([1]); // 2 has lift 1, 3 has n<5
    expect(relatedTags(theme, tt, all, at, 'rising', new Set()).map(r => r.id)).toEqual([1]);
    expect(relatedTags(theme, tt, all, at, 'distinctive', new Set([1]))).toEqual([]);
  });
});
