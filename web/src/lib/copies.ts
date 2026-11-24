// "What the theme's new games copy": for each hit from the years before the rise, count the
// theme's games released since then (and coming soon) that closely match it. Ported from the
// original dashboard's copyAnalysis(), now with the blended tag + description similarity the
// game pages use. Runs in a worker (copies.worker.ts); pure so it can be tested directly.
import type { CandRow, VecRow } from './api';

export interface CopyTag { id: number; idf: number; content: boolean; adult: boolean }

export interface CopyInput {
  tags: CopyTag[];
  news: VecRow[];      // the theme's new games (possibly a sample) and coming-soon games
  cands: CandRow[];    // candidate hits
  nNew: number;        // full counts, to scale sampled results
  nSoon: number;
  wText: number;       // weight of description similarity (0 = tags only)
  minSim: number;
  withAdult: boolean;  // allow adult games as hits
  by?: 'new' | 'soon'; // rank by released copies (default) or coming-soon ones
}

export interface CopyRow {
  appid: number; name: string; releaseDate: string; releaseQ: number; reviews: number; pct: number;
  developer: string; tags: number[];
  n: number;           // copies released since the rise (scaled if sampled)
  soon: number;        // coming-soon copies (scaled)
  copies: [number, number][]; // [appid, reviews] of sampled copies, most reviewed first
}

export interface CopyResult { rows: CopyRow[]; nNew: number; nSoon: number; nCand: number; sampled: boolean }

interface Vec { ix: Int32Array; v: Float32Array; text: Float32Array | null }

function fingerprint(tagIds: number[], tagW: number[], text: number[] | null, tix: Map<number, number>, idf: Float64Array): Vec {
  const ix: number[] = [], v: number[] = [];
  let ss = 0;
  tagIds.forEach((t, j) => {
    const k = tix.get(t);
    if (k == null) return; // not a content tag
    const w = ((tagW[j] ?? 0) / 100) * idf[k];
    if (w <= 0) return;
    ix.push(k); v.push(w); ss += w * w;
  });
  const n = Math.sqrt(ss) || 1;
  let tx: Float32Array | null = null;
  if (text && text.length) {
    let s2 = 0;
    for (const x of text) s2 += x * x;
    const tn = Math.sqrt(s2) || 1;
    tx = Float32Array.from(text, x => x / tn);
  }
  return { ix: Int32Array.from(ix), v: Float32Array.from(v, x => x / n), text: tx };
}

export function copyAnalysis(inp: CopyInput): CopyResult {
  const content = inp.tags.filter(t => t.content);
  const tix = new Map(content.map((t, i) => [t.id, i]));
  const idf = Float64Array.from(content, t => t.idf);
  const adult = new Set(inp.tags.filter(t => t.adult).map(t => t.id));
  const T = content.length, w = inp.wText;

  const cands = inp.cands.filter(c => inp.withAdult || !c[5].slice(0, 8).some(t => adult.has(t)));
  const C = cands.length;
  const cv = cands.map(c => fingerprint(c[5], c[6], w > 0 ? c[7] : null, tix, idf));
  const D = cv.find(x => x.text)?.text?.length ?? 0;
  // Tag-major dense matrix so each new game's tags read contiguous rows.
  const dense = new Float32Array(T * C);
  cv.forEach((f, c) => { for (let j = 0; j < f.ix.length; j++) dense[f.ix[j] * C + c] = f.v[j]; });
  const textM = w > 0 && D ? new Float32Array(C * D) : null;
  if (textM) cv.forEach((f, c) => { if (f.text) textM.set(f.text, c * D); });
  const devs = cands.map(c => (c[4] || '').toLowerCase());
  const candQ = cands.map(c => c[1] ?? 0);

  const copies: [number, number][][] = cands.map(() => []);
  const soon = new Int32Array(C);
  const acc = new Float32Array(C);
  let nNewS = 0, nSoonS = 0;
  for (const g of inp.news) {
    const isSoon = g[2];
    if (isSoon) nSoonS++; else nNewS++;
    const f = fingerprint(g[5], g[6], w > 0 ? g[7] : null, tix, idf);
    acc.fill(0);
    for (let j = 0; j < f.ix.length; j++) {
      const off = f.ix[j] * C, x = f.v[j];
      for (let c = 0; c < C; c++) acc[c] += x * dense[off + c];
    }
    const dev = (g[4] || '').toLowerCase(), q = g[1] ?? 0;
    for (let c = 0; c < C; c++) {
      let s = acc[c];
      if (textM && f.text) {
        let d = 0;
        const base = c * D, t = f.text;
        for (let k = 0; k < D; k++) d += t[k] * textM[base + k];
        s = (1 - w) * s + w * d;
      }
      if (s < inp.minSim || devs[c] === dev) continue;
      if (isSoon) { soon[c]++; if (inp.by === 'soon') copies[c].push([g[0], g[3]]); }
      else if (q > candQ[c]) copies[c].push([g[0], g[3]]);
    }
  }
  const scaleN = inp.nNew / Math.max(1, nNewS), scaleS = inp.nSoon / Math.max(1, nSoonS);
  const rows: CopyRow[] = cands.map((c, i) => ({
    appid: c[0], name: c[8], releaseDate: c[9], releaseQ: c[1] ?? 0, reviews: c[3], pct: c[10], developer: c[4],
    tags: c[5].slice(0, 6),
    n: Math.round(copies[i].length * scaleN), soon: Math.round(soon[i] * scaleS),
    copies: copies[i].sort((a, b) => b[1] - a[1]),
  }));
  const ranked = inp.by === 'soon'
    ? rows.filter(r => r.soon > 0).sort((a, b) => b.soon - a.soon || b.reviews - a.reviews)
    : rows.filter(r => r.n > 0).sort((a, b) => b.n - a.n || b.reviews - a.reviews);
  return { rows: ranked, nNew: inp.nNew, nSoon: inp.nSoon, nCand: C, sampled: nNewS < inp.nNew || nSoonS < inp.nSoon };
}
