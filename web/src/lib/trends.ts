// Trend maths for the Tags tab: share-of-releases series, take-off detection, the tag table's
// growth figures and related tags. Pure functions; the data comes from the theme RPCs.
// Quarters are numbered year*4 + (0..3), as release_q in the database.
import type { Counts, QTotal } from './api';
import type { Range } from './range';

export type Gran = 'year' | 'ytd' | 'quarter';
export const GRANS: [Gran, string][] = [['year', 'By year'], ['ytd', 'Year, same dates'], ['quarter', 'By quarter']];

export const qYear = (q: number) => Math.floor(q / 4);
export const qLabel = (q: number) => `${qYear(q)} Q${(q % 4) + 1}`;
/** 'YYYY-MM' → quarter number. */
export function monthToQ(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 4 + Math.floor((m - 1) / 3);
}
/** ISO date → quarter number. */
export const dateToQ = (iso: string) => monthToQ(iso.slice(0, 7));

/** [q, ytd, n_any, n_core] from theme_series. */
export type SeriesRow = [number, boolean, number, number];

export interface ShareSeries {
  keys: number[];      // year or quarter number per point
  labels: string[];
  any: number[];       // % of floored releases
  core: number[];
  nAny: number[];
  nCore: number[];
  total: number[];
}

/**
 * Share of releases over time. `gran`: by year (current year partial, marked *), by year
 * counting only the same dates as this year so far, or by quarter. `range` trims the axis;
 * with an open start the axis begins at `firstQ`.
 */
export function shareSeries(rows: SeriesRow[], totals: QTotal[], gran: Gran, range: Range,
                            dataQ: number, firstQ: number): ShareSeries {
  const lo = range.from ? monthToQ(range.from) : firstQ;
  const hi = Math.min(range.to ? monthToQ(range.to) : dataQ, dataQ);
  const keyOf = (q: number) => (gran === 'quarter' ? q : qYear(q));
  const keep = (q: number, ytd: boolean) => q >= lo && q <= hi && (gran !== 'ytd' || ytd);
  const k0 = keyOf(lo), k1 = keyOf(hi);
  const n = Math.max(0, k1 - k0 + 1);
  const tot = new Array(n).fill(0), a = new Array(n).fill(0), c = new Array(n).fill(0);
  for (const [q, ytd, cnt] of totals) if (keep(q, ytd)) tot[keyOf(q) - k0] += cnt;
  for (const [q, ytd, na, nc] of rows) if (keep(q, ytd)) { a[keyOf(q) - k0] += na; c[keyOf(q) - k0] += nc; }
  const keys = Array.from({ length: n }, (_, i) => k0 + i);
  const cy = qYear(dataQ);
  const labels = keys.map(k => (gran === 'quarter' ? qLabel(k) : gran === 'year' && k === cy ? `${k}*` : String(k)));
  const pct = (x: number, t: number) => (t ? (x / t) * 100 : 0);
  return { keys, labels, any: a.map((x, i) => pct(x, tot[i])), core: c.map((x, i) => pct(x, tot[i])), nAny: a, nCore: c, total: tot };
}

/**
 * Take-off: the first quarter where the 4-quarter rolling share beats 1.5x its level over
 * the prior two years and stays at least 1.2x from then on, with 10+ games in that window
 * (a couple of games from nothing isn't a trend). Returns the index of the window's first
 * quarter, or null. Same rule as the original dashboard.
 */
export function takeoff(values: number[], counts?: number[]): number | null {
  const r = values.map((_, i) => (i < 3 ? NaN : (values[i] + values[i - 1] + values[i - 2] + values[i - 3]) / 4));
  for (let i = 12; i < r.length; i++) {
    if (counts && counts[i] + counts[i - 1] + counts[i - 2] + counts[i - 3] < 10) continue;
    const base = r.slice(i - 12, i - 3).filter(v => !Number.isNaN(v));
    if (!base.length) continue;
    const b = base.reduce((s, v) => s + v, 0) / base.length;
    if (b > 0 && r[i] >= 1.5 * b && r.slice(i).every(v => v >= 1.2 * b)) return i - 3;
  }
  return null;
}

/** Take-off quarter number for a theme (quarterly shares from firstQ), or null. */
export function takeoffQ(rows: SeriesRow[], totals: QTotal[], dataQ: number, firstQ: number, core = false): number | null {
  const s = shareSeries(rows, totals, 'quarter', { from: null, to: null }, dataQ, firstQ);
  const i = takeoff(core ? s.core : s.any, core ? s.nCore : s.nAny);
  return i == null ? null : s.keys[i];
}

// ---------------------------------------------------------------- tag table

/** [tagid, n_all, n_range, n_ytd, n_prev_ytd, n_soon] from tag_table. */
export type TagCountRow = [number, number, number, number, number, number];

export interface TagStat {
  id: number;
  total: number;      // released games in the range
  all: number;        // released games, all time
  ytd: number;        // released this year so far
  prev: number;       // same dates last year
  soon: number;
  shareYtd: number;   // % of all floored releases this year so far
  sharePrev: number;
  change: number;     // percentage points
  growth: number;     // share now ÷ share then (+1 smoothing on last year's count)
  inTheme: number;    // % of the theme's released games that have this tag
}

/** Growth uses the same +1 smoothing as rising() in steam_trends_analyse.py. */
export function tagStats(rows: TagCountRow[], global: Counts, totals: Counts): TagStat[] {
  const pct = (x: number, t: number) => (t ? (x / t) * 100 : 0);
  return rows.map(([id, all, range, ytd, prev, soon]) => {
    const shareYtd = pct(ytd, global.n_ytd), sharePrev = pct(prev, global.n_prev_ytd);
    const growth = global.n_prev_ytd && global.n_ytd ? (ytd / global.n_ytd) / ((prev + 1) / global.n_prev_ytd) : 0;
    return { id, total: range, all, ytd, prev, soon, shareYtd, sharePrev, change: shareYtd - sharePrev, growth,
      inTheme: pct(all, totals.n_all) };
  });
}

export interface Related { id: number; n: number; inTheme: number; lift: number; recent: number; before: number }

/**
 * Tags that go with the theme. "distinctive": much more common in the theme than among all
 * games (lift ≥ 1.3, ranked by n·ln(lift)); `allCounts` = games per tag across the catalogue. "rising": gaining share within the theme this
 * year so far vs the same dates last year.
 */
export function relatedTags(theme: TagCountRow[], themeTotals: Counts, allCounts: Map<number, number>, allTotal: number,
                            mode: 'distinctive' | 'rising', exclude: Set<number>, limit = 30): Related[] {
  const pct = (x: number, t: number) => (t ? (x / t) * 100 : 0);
  let rows = theme.filter(r => !exclude.has(r[0]) && r[1] >= 5).map(([id, n, , ytd, prev]) => {
    const inTheme = pct(n, themeTotals.n_all);
    const g = pct(allCounts.get(id) ?? 0, allTotal);
    return { id, n, inTheme, lift: g ? inTheme / g : 0, recent: pct(ytd, themeTotals.n_ytd), before: pct(prev, themeTotals.n_prev_ytd), ytd };
  });
  if (mode === 'distinctive') rows = rows.filter(r => r.lift >= 1.3).sort((a, b) => b.n * Math.log(b.lift) - a.n * Math.log(a.lift));
  else rows = rows.filter(r => r.ytd >= 5).sort((a, b) => (b.recent - b.before) - (a.recent - a.before));
  return rows.slice(0, limit).map(({ ytd: _y, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
}
