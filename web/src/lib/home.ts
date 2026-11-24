// Home page maths: which quarters are safe to compare, rising tags by quarter, waves that are
// still running and the coming-soon tag radar. Pure functions; the data comes from tag_quarters,
// soon_radar and the leaderboard table.
//
// The quality floor lets games from the last `graceDays` through without the review minimum
// (they haven't had time to collect reviews). That inflates the latest quarters, so quarter-on-
// quarter comparisons stop at the last complete quarter the grace period doesn't reach.
import type { LeaderRow } from './api';
import type { Floor } from './floor';
import { dateToQ } from './trends';

const DAY = 24 * 60 * 60 * 1000;

/** First quarter with games let through by the grace period (null when there's no review minimum). */
export function graceQ(dataDate: string, floor: Floor): number | null {
  if (!(floor.minReviews > 0 && floor.graceDays > 0)) return null;
  const from = new Date(Date.parse(dataDate) - floor.graceDays * DAY).toISOString().slice(0, 10);
  return dateToQ(from);
}

/** The last complete quarter that the grace period doesn't touch. */
export function lastCleanQ(dataDate: string, floor: Floor): number {
  const complete = dateToQ(dataDate) - 1;
  const g = graceQ(dataDate, floor);
  return g == null ? complete : Math.min(complete, g - 1);
}

export interface TagQuarters { q0: number; lq: number; totals: number[]; rows: [number, number, number][] }

export interface RisingRow {
  id: number;
  now: number; before: number;            // games with the tag in each window
  shareNow: number; shareBefore: number;  // % of releases
  change: number;                         // percentage points
  growth: number;                         // share now ÷ share before (+1 smoothing on the earlier count)
  spark: number[];                        // share per quarter, oldest first, ending at the window
}

/** Tags gaining share: the 4 quarters to `endQ` vs the 4 before. */
export function risingByQuarter(d: TagQuarters, endQ: number, minGames: number, sparkLen = 12): RisingRow[] {
  const tot = (q: number) => d.totals[q - d.q0] ?? 0;
  const sum = (f: (q: number) => number, a: number, b: number) => { let s = 0; for (let q = a; q <= b; q++) s += f(q); return s; };
  const tNow = sum(tot, endQ - 3, endQ), tBefore = sum(tot, endQ - 7, endQ - 4);
  const byTag = new Map<number, Map<number, number>>();
  for (const [t, q, n] of d.rows) {
    let m = byTag.get(t);
    if (!m) byTag.set(t, (m = new Map()));
    m.set(q, n);
  }
  const s0 = Math.max(d.q0, endQ - sparkLen + 1);
  const out: RisingRow[] = [];
  for (const [id, m] of byTag) {
    const at = (q: number) => m.get(q) ?? 0;
    const now = sum(at, endQ - 3, endQ), before = sum(at, endQ - 7, endQ - 4);
    if (now < minGames || !tNow || !tBefore) continue;
    const shareNow = (now / tNow) * 100, shareBefore = (before / tBefore) * 100;
    const spark: number[] = [];
    for (let q = s0; q <= endQ; q++) spark.push(tot(q) ? (at(q) / tot(q)) * 100 : 0);
    out.push({ id, now, before, shareNow, shareBefore, change: shareNow - shareBefore,
      growth: (now / tNow) / ((before + 1) / tBefore), spark });
  }
  return out;
}

export interface CurrentWave {
  row: LeaderRow;
  hq: number;          // release quarter
  nowShare: number;    // % of releases that closely match it, over the 4 quarters to endQ
  gain: number;        // percentage points above its share before release
  nowLift: number;     // now ÷ before
  spark: number[];     // share per quarter from 2 years before release to endQ
}

/**
 * Hits whose look-alikes are still well above their pre-release level: the latest 4 clean
 * quarters' share vs the 2 years before release (both from the leaderboard's share series).
 */
export function currentWaves(rows: LeaderRow[], releaseQ: Map<number, number>, endQ: number, minLift = 1.5): CurrentWave[] {
  const eps = 0.025; // ≈ half a game in a quarter of ~2,000 releases, in % — same idea as the pipeline's
  const out: CurrentWave[] = [];
  for (const row of rows) {
    const hq = releaseQ.get(row.appid);
    if (hq == null || endQ - 3 < hq + 1) continue;
    const at = (q: number) => row.share[q - row.first_q];
    const xs: number[] = [];
    for (let q = endQ - 3; q <= endQ; q++) { const v = at(q); if (v != null) xs.push(v); }
    if (xs.length < 4) continue;
    const nowShare = xs.reduce((a, b) => a + b, 0) / xs.length;
    const nowLift = (nowShare + eps) / (row.share_before + eps);
    if (nowLift < minLift) continue;
    const spark: number[] = [];
    for (let q = Math.max(row.first_q, hq - 8); q <= endQ; q++) spark.push(at(q) ?? 0);
    out.push({ row, hq, nowShare, gain: nowShare - row.share_before, nowLift, spark });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

export interface RadarData { n_soon: number; n_recent: number; rows: [number, number, number][] }
export interface RadarRow { id: number; soon: number; recent: number; shareSoon: number; shareRecent: number; ratio: number }

/** Tags more common among upcoming games than among the last 12 months' releases. */
export function radarTags(d: RadarData, minSoon: number): RadarRow[] {
  if (!d.n_soon || !d.n_recent) return [];
  return d.rows.filter(([, ns]) => ns >= minSoon).map(([id, soon, recent]) => ({
    id, soon, recent,
    shareSoon: (soon / d.n_soon) * 100, shareRecent: (recent / d.n_recent) * 100,
    ratio: (soon / d.n_soon) / ((recent + 1) / d.n_recent),
  }));
}
