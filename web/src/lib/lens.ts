// Lens helpers: a game page refined by example games (more like these) and counter-examples
// (less like these), with optional per-tag factors. The lens itself is built in the database
// (lens_neighbors); these are the URL encoding and the "why it matches" maths. Pure functions.
import type { LensTag, Tag } from './api';
import { fingerprint } from './lineage';

export interface Lens { like: number[]; not: number[]; tw: Map<number, number> }

/** Tag factors as stored in the URL: `lw=1716:2,32322:0`. */
export function parseFactors(s: string | null): Map<number, number> {
  const m = new Map<number, number>();
  for (const part of (s ?? '').split(',')) {
    const [a, b] = part.split(':');
    const id = Number(a), f = Number(b);
    if (Number.isInteger(id) && id > 0 && b != null && b !== '' && Number.isFinite(f) && f >= 0 && f <= 4 && f !== 1) m.set(id, f);
  }
  return m;
}

export function fmtFactors(m: Map<number, number>): string {
  return [...m].filter(([, f]) => f !== 1).sort((a, b) => a[0] - b[0]).map(([id, f]) => `${id}:${f}`).join(',');
}

/** The tag button's cycle: as is → counts double → ignored → as is. */
export const nextFactor = (f: number | undefined) => (f == null || f === 1 ? 2 : f === 2 ? 0 : 1);

export const isActive = (l: Lens) => l.like.length > 0 || l.not.length > 0 || l.tw.size > 0;

/** Add a game to one side of the lens (taking it off the other). */
export function addExample(l: Lens, appid: number, side: 'like' | 'not', anchor: number): Lens {
  if (appid === anchor) return l;
  const like = l.like.filter(x => x !== appid), not = l.not.filter(x => x !== appid);
  (side === 'like' ? like : not).push(appid);
  return { ...l, like, not };
}

export const removeExample = (l: Lens, appid: number): Lens => ({ ...l, like: l.like.filter(x => x !== appid), not: l.not.filter(x => x !== appid) });

/**
 * Which tags make a game match the lens: the lens's tags it shares (lens weight, the game's
 * vote weight and their part of the tag score) and the lens's tags it lacks.
 */
export function lensOverlap(lens: LensTag[], b: { tag_ids: number[]; tag_w: number[] }, byId: Map<number, Tag>) {
  const vb = fingerprint(b.tag_ids, b.tag_w, byId);
  const wb = new Map(b.tag_ids.map((id, i) => [id, b.tag_w[i] ?? 0]));
  const top = Math.max(1e-9, ...lens.map(t => t[1]));
  let score = 0;
  const shared: { id: number; wa: number; wb: number; contrib: number }[] = [];
  const missing: { id: number; w: number }[] = [];
  for (const [id, q] of lens) {
    if (q <= 0) continue;
    const y = vb.get(id);
    const wa = Math.round((q / top) * 100);
    if (y == null) { missing.push({ id, w: wa }); continue; }
    score += q * y;
    shared.push({ id, wa, wb: wb.get(id)!, contrib: q * y });
  }
  shared.forEach(s => { s.contrib = score ? s.contrib / score : 0; });
  shared.sort((p, q) => q.contrib - p.contrib);
  const inLens = new Set(lens.filter(t => t[1] > 0).map(t => t[0]));
  const onlyB = [...vb.keys()].filter(id => !inLens.has(id)).map(id => ({ id, w: wb.get(id)! })).sort((p, q) => q.w - p.w);
  return { score, shared, onlyA: missing, onlyB };
}
