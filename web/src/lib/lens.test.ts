import { describe, expect, it } from 'vitest';
import type { LensTag, Tag } from './api';
import { addExample, fmtFactors, isActive, lensOverlap, nextFactor, parseFactors, removeExample, type Lens } from './lens';

const tag = (id: number, idf = 1, content = true): Tag => ({ id, name: `t${id}`, ix: id, idf, content, adult: false, n_games: 1 });

describe('tag factors in the URL', () => {
  it('round-trips and drops junk and factor 1', () => {
    const m = parseFactors('5:2,3:0,x:1,7:1,8:9,9:');
    expect([...m]).toEqual([[5, 2], [3, 0]]);
    expect(fmtFactors(m)).toBe('3:0,5:2');
    expect(parseFactors(null).size).toBe(0);
  });
  it('cycles as is → double → ignored → as is', () => {
    expect(nextFactor(undefined)).toBe(2);
    expect(nextFactor(2)).toBe(0);
    expect(nextFactor(0)).toBe(1);
  });
});

describe('examples', () => {
  const l: Lens = { like: [1, 2], not: [3], tw: new Map() };
  it('moves a game between sides and never adds the anchor', () => {
    expect(addExample(l, 3, 'like', 99)).toMatchObject({ like: [1, 2, 3], not: [] });
    expect(addExample(l, 1, 'not', 99)).toMatchObject({ like: [2], not: [3, 1] });
    expect(addExample(l, 99, 'like', 99)).toBe(l);
    expect(removeExample(l, 2)).toMatchObject({ like: [1], not: [3] });
  });
  it('is active with any example or factor', () => {
    expect(isActive({ like: [], not: [], tw: new Map() })).toBe(false);
    expect(isActive({ like: [], not: [], tw: new Map([[1, 0]]) })).toBe(true);
  });
});

describe('lensOverlap', () => {
  const byId = new Map([1, 2, 3, 4].map(i => [i, tag(i)]));
  byId.set(5, tag(5, 1, false)); // not a content tag
  // Lens weights on tags 1 (0.8), 2 (0.6) and 3 (0, pushed down by counter-examples).
  const lens: LensTag[] = [[1, 0.8, 0.5, 3, null], [2, 0.6, 0.3, 2, null], [3, 0, 0.2, 1, null]];

  it('splits the tag score across shared tags', () => {
    const r = lensOverlap(lens, { tag_ids: [1, 2, 4, 5], tag_w: [100, 100, 50, 100] }, byId);
    expect(r.shared.map(s => s.id)).toEqual([1, 2]);
    expect(r.shared[0].contrib + r.shared[1].contrib).toBeCloseTo(1);
    expect(r.shared[0].wa).toBe(100);
    expect(r.shared[1].wa).toBe(75);
    expect(r.onlyA).toEqual([]);
    expect(r.onlyB.map(t => t.id)).toEqual([4]);
    // fingerprint (1,1,0.5)/1.5 → 0.8*(2/3) + 0.6*(2/3)
    expect(r.score).toBeCloseTo((0.8 + 0.6) * (2 / 3));
  });

  it('lists lens tags the game lacks, ignoring zero-weight ones', () => {
    const r = lensOverlap(lens, { tag_ids: [1], tag_w: [100] }, byId);
    expect(r.onlyA).toEqual([{ id: 2, w: 75 }]);
  });
});
