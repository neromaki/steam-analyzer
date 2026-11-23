import { describe, expect, it } from 'vitest';
import type { QTotal, Tag } from './api';
import fx from './__fixtures__/wave450390.json';
import { countsMap, inMonths, originator, setterCandidates, tagOverlap, totalsByQ, verdict, wave, type Nb } from './lineage';

const nb = (appid: number, date: string | null, reviews: number, extra: Partial<Nb> = {}): Nb => ({
  appid, name: `g${appid}`, date, q: date ? +date.slice(0, 4) * 4 + Math.floor((+date.slice(5, 7) - 1) / 3) : null,
  soon: false, reviews, pct: 90, dev: `d${appid}`, tags: [], sim: 0.6, ts: 0.6, xs: 0.6, ...extra,
});

describe('wave', () => {
  // Fixture from the local copy: game_neighbors counts (minSim 0.55, as that build's leaderboard), quarter_totals
  // and the leaderboard row, all for the default floor.
  it('matches the pipeline leaderboard (The Lab, default floor)', () => {
    const tot = totalsByQ(fx.totals as QTotal[]);
    const dataQ = 2026 * 4 + 3;
    const w = wave(countsMap(fx.counts as [number, number, number][], true), tot, fx.hq, fx.expect.firstQ, dataQ);
    expect(w.lift!).toBeCloseTo(fx.expect.lift, 3);
    expect(w.before!).toBeCloseTo(fx.expect.before, 5);
    expect(w.after!).toBeCloseTo(fx.expect.after, 4);
    expect(w.excess).toBeCloseTo(fx.expect.excess, 1);
    expect(w.nAfter).toBe(fx.expect.nAfter);
    expect(w.qAfter).toBe(11);
  });

  it('has no lift without an after-window yet', () => {
    const tot = new Map([[100, 10], [101, 10], [102, 10]]);
    const w = wave(new Map([[101, 2]]), tot, 102, 100, 102, { before: 2, after: [2, 12] });
    expect(w.lift).toBeNull();
    expect(w.qAfter).toBe(0);
    expect(verdict(w, null)).toBe('early');
  });
});

describe('verdict', () => {
  const base = { keys: [], share: [], counts: [], total: [], hq: 100, before: 0.1, after: 1, excess: 20, nBefore: 1, nAfter: 30, qAfter: 10 };
  it('rode a wave that took off two+ quarters earlier', () => expect(verdict({ ...base, lift: 5 }, 97)).toBe('rode'));
  it('started one', () => expect(verdict({ ...base, lift: 5 }, 100)).toBe('started'));
  it('neither', () => expect(verdict({ ...base, lift: 1.2 }, null)).toBe('neither'));
  it('a big ratio on a handful of games is not a wave', () => expect(verdict({ ...base, lift: 3, excess: 2 }, null)).toBe('neither'));
});

describe('trend-setters', () => {
  const self = nb(1, '2020-05-01', 50000);
  const rows = [nb(2, '2016-01-10', 3000), nb(3, '2014-03-01', 900), nb(4, '2018-07-01', 12000), nb(5, '2022-01-01', 90000),
    nb(6, null, 5000, { soon: true })];
  it('keeps earlier hits and the game itself, earliest first', () => {
    expect(setterCandidates(self, rows, 2000, { from: null, to: null }, '2026-11-21').map(g => g.appid)).toEqual([2, 4, 1]);
  });
  it('follows the range', () => {
    expect(setterCandidates(self, rows, 500, { from: '2015-01', to: null }, '2026-11-21').map(g => g.appid)).toEqual([2, 4, 1]);
  });
  it('originator is the earliest by the take-off', () => {
    const c = setterCandidates(self, rows, 2000, { from: null, to: null }, '2026-11-21');
    expect(originator(c, null)?.appid).toBe(2);
    expect(originator(c, 2015 * 4)).toBeNull();
  });
  it('inMonths handles open ends', () => {
    expect(inMonths('2020-05-01', { from: '2020-05', to: '2020-05' })).toBe(true);
    expect(inMonths(null, { from: null, to: null })).toBe(true);
    expect(inMonths(null, { from: '2020-01', to: null })).toBe(false);
  });
});

describe('tagOverlap', () => {
  const tag = (id: number, idf: number, content = true): Tag => ({ id, name: `t${id}`, ix: id, idf, content, adult: false, n_games: 1 });
  const byId = new Map([tag(1, 1), tag(2, 2), tag(3, 1), tag(9, 1, false)].map(t => [t.id, t]));
  it('splits the tag score across shared tags', () => {
    const r = tagOverlap({ tag_ids: [1, 2, 9], tag_w: [100, 50, 100] }, { tag_ids: [2, 3, 9], tag_w: [100, 80, 100] }, byId);
    // a = (1, 1)/√2, b = (2, 0.8)/√4.64 → only tag 2 is shared
    expect(r.score).toBeCloseTo((1 / Math.SQRT2) * (2 / Math.sqrt(4.64)), 6);
    expect(r.shared.map(s => [s.id, s.contrib])).toEqual([[2, 1]]);
    expect(r.onlyA.map(s => s.id)).toEqual([1]);
    expect(r.onlyB.map(s => s.id)).toEqual([3]);
  });
});
