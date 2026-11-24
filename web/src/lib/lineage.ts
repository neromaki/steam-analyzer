// Game-page maths: the similar-games cluster's share of releases, a game's follower wave (same
// formula as the leaderboard in pipeline/build_db.py), the started/rode/neither verdict,
// trend-setter candidates and the tag overlap behind "why similar". Pure functions.
import type { Neighbor, QTotal, Tag } from './api';
import type { Range } from './range';
import { takeoff } from './trends';

/** A similar game (a game_neighbors row, named). */
export interface Nb {
  appid: number; name: string; date: string | null; q: number | null; soon: boolean;
  reviews: number; pct: number; dev: string; tags: number[];
  sim: number; ts: number; xs: number; // blended, tag and description similarity
}

export const toNb = (r: Neighbor): Nb => ({
  appid: r[0], name: r[1], date: r[2], q: r[3], soon: r[4], reviews: r[5], pct: r[6], dev: r[7], tags: r[8] ?? [],
  sim: r[9], ts: r[10], xs: r[11],
});

/** Released and dated: has a place on the timeline. */
export const isReleased = (g: { date: string | null; soon: boolean }, dataDate: string) => !g.soon && !!g.date && g.date <= dataDate;

/** In a month range (open ends allowed). Undated games are out unless the range is fully open. */
export function inMonths(date: string | null, r: Range): boolean {
  if (!r.from && !r.to) return true;
  if (!date) return false;
  const m = date.slice(0, 7);
  return (!r.from || m >= r.from) && (!r.to || m <= r.to);
}

/** Floored released games per quarter (quarter_totals splits each quarter by same-dates). */
export function totalsByQ(totals: QTotal[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const [q, , n] of totals) m.set(q, (m.get(q) ?? 0) + n);
  return m;
}

// ---------------------------------------------------------------- cluster share

export interface Share { keys: number[]; share: number[]; counts: number[]; total: number[] }

/** % of each quarter's releases that are in `counts` (quarter → games), from lo to hi. */
export function shareByQ(counts: Map<number, number>, tot: Map<number, number>, lo: number, hi: number): Share {
  const keys: number[] = [], share: number[] = [], cs: number[] = [], total: number[] = [];
  for (let q = lo; q <= hi; q++) {
    const n = counts.get(q) ?? 0, t = tot.get(q) ?? 0;
    keys.push(q); cs.push(n); total.push(t); share.push(t ? (n / t) * 100 : 0);
  }
  return { keys, share, counts: cs, total };
}

/** Quarter the cluster's share took off (the Tags tab's rule), or null. */
export function clusterTakeoff(counts: Map<number, number>, tot: Map<number, number>, firstQ: number, dataQ: number): number | null {
  const s = shareByQ(counts, tot, firstQ, dataQ);
  const i = takeoff(s.share, s.counts);
  return i == null ? null : s.keys[i];
}

// ---------------------------------------------------------------- follower wave

export interface WaveOpts { before: number; after: [number, number] } // quarters
export const WAVE_DEFAULTS: WaveOpts = { before: 8, after: [2, 12] };

export interface Wave extends Share {
  hq: number;
  before: number | null;  // mean share (%) over the quarters before release
  after: number | null;   // mean share (%) over the after-window
  lift: number | null;    // after ÷ before, with half a game of smoothing
  excess: number;         // look-alikes above what the before-share predicts, over the after-window
  nBefore: number; nAfter: number;
  qAfter: number;         // quarters of the after-window the data covers so far
}

/**
 * A game's follower wave: share of releases that closely match it (other developers), per
 * quarter, and how that share after release compares with before. `counts`: quarter → matches.
 */
export function wave(counts: Map<number, number>, tot: Map<number, number>, hq: number, firstQ: number, dataQ: number,
                     o: WaveOpts = WAVE_DEFAULTS): Wave {
  const lo = Math.min(firstQ, hq - o.before);
  const s = shareByQ(counts, tot, lo, dataQ);
  const at = (q: number) => q - lo;
  const frac = (q: number) => (s.total[at(q)] ? s.counts[at(q)] / s.total[at(q)] : 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const span = (a: number, b: number) => { const l: number[] = []; for (let q = Math.max(lo, a); q <= Math.min(dataQ, b); q++) l.push(q); return l; };
  const bq = span(hq - o.before, hq - 1), aq = span(hq + o.after[0], hq + o.after[1]);
  const sb = mean(bq.map(frac)), sa = mean(aq.map(frac));
  const tWin = mean(span(hq - o.before, hq).map(q => s.total[at(q)])) ?? 0;
  const eps = 0.5 / Math.max(1, tWin);
  const lift = sa != null && sb != null ? (sa + eps) / (sb + eps) : null;
  const winTot = aq.reduce((t, q) => t + s.total[at(q)], 0);
  const excess = sa != null && sb != null ? Math.max(0, (sa - sb) * winTot) : 0;
  const sum = (qs: number[]) => qs.reduce((t, q) => t + s.counts[at(q)], 0);
  return {
    ...s, hq, before: sb == null ? null : sb * 100, after: sa == null ? null : sa * 100, lift, excess,
    nBefore: sum(bq), nAfter: sum(span(hq + 1, hq + o.after[1])), qAfter: aq.length,
  };
}

/** Counts from game_neighbors (released matches per quarter): [q, n_all, n_other]. */
export function countsMap(rows: [number, number, number][], other: boolean): Map<number, number> {
  return new Map(rows.map(([q, a, o]) => [q, other ? o : a]));
}

export type VerdictKind = 'started' | 'rode' | 'neither' | 'early' | 'unknown';

/**
 * Did the game start a wave, ride one, or neither? Rode: its cluster had already taken off
 * at least two quarters before it came out. Started: look-alikes became 1.5x+ more common
 * afterwards (and at least 5 more games than expected). Too early: under a year of data after.
 */
export function verdict(w: Wave | null, tq: number | null): VerdictKind {
  if (!w) return 'unknown';
  if (tq != null && tq <= w.hq - 2) return 'rode';
  if (w.lift == null || w.qAfter < 4) return 'early';
  return w.lift >= 1.5 && w.excess >= 5 ? 'started' : 'neither';
}

// ---------------------------------------------------------------- trend-setters

/**
 * Trend-setter candidates for a game: itself and the similar games released before it with at
 * least `minReviews` reviews (within the range), earliest first.
 */
export function setterCandidates(self: Nb, rows: Nb[], minReviews: number, r: Range, dataDate: string): Nb[] {
  if (!self.date) return [];
  return [self, ...rows]
    .filter(g => isReleased(g, dataDate) && g.date! <= self.date! && g.reviews >= minReviews && inMonths(g.date, r))
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : b.reviews - a.reviews));
}

/** The likely originator: the earliest candidate released by the take-off quarter (or the earliest, if none). */
export function originator(cands: Nb[], tq: number | null): Nb | null {
  const ok = cands.filter(g => g.q != null && (tq == null || g.q <= tq));
  return ok[0] ?? null;
}

// ---------------------------------------------------------------- why similar

export interface TagPart { id: number; wa: number; wb: number; contrib: number } // contrib: share of the tag score

/** Normalised fingerprint (vote weight × idf over content tags), as in the pipeline. */
export function fingerprint(ids: number[], w: number[], byId: Map<number, Tag>): Map<number, number> {
  const v = new Map<number, number>();
  let ss = 0;
  ids.forEach((id, i) => {
    const t = byId.get(id);
    if (!t?.content) return;
    const x = ((w[i] ?? 0) / 100) * t.idf;
    if (x > 0) { v.set(id, x); ss += x * x; }
  });
  const n = Math.sqrt(ss) || 1;
  for (const [k, x] of v) v.set(k, x / n);
  return v;
}

/**
 * Which tags make two games similar: shared content tags with each game's vote weight (0–100)
 * and their part of the tag similarity, plus the tags only one of them has.
 */
export function tagOverlap(a: { tag_ids: number[]; tag_w: number[] }, b: { tag_ids: number[]; tag_w: number[] }, byId: Map<number, Tag>) {
  const va = fingerprint(a.tag_ids, a.tag_w, byId), vb = fingerprint(b.tag_ids, b.tag_w, byId);
  const wa = new Map(a.tag_ids.map((id, i) => [id, a.tag_w[i] ?? 0])), wb = new Map(b.tag_ids.map((id, i) => [id, b.tag_w[i] ?? 0]));
  let score = 0;
  const shared: TagPart[] = [];
  for (const [id, x] of va) {
    const y = vb.get(id);
    if (y == null) continue;
    score += x * y;
    shared.push({ id, wa: wa.get(id)!, wb: wb.get(id)!, contrib: x * y });
  }
  shared.forEach(s => { s.contrib = score ? s.contrib / score : 0; });
  shared.sort((p, q) => q.contrib - p.contrib);
  const only = (v: Map<number, number>, other: Map<number, number>, w: Map<number, number>) =>
    [...v.keys()].filter(id => !other.has(id)).map(id => ({ id, w: w.get(id)! })).sort((p, q) => q.w - p.w);
  return { score, shared, onlyA: only(va, vb, wa), onlyB: only(vb, va, wb) };
}
