// The global "quality floor": hides low-effort games from every list and every analysis.
// Same presets as pipeline/build_db.py (PRESETS), so leaderboard rows line up.

export interface Floor {
  minReviews: number;   // games need at least this many reviews...
  graceDays: number;    // ...unless released within this many days
  minPrice: number;     // GBP; free-to-play games are exempt
  excludeAdult: boolean;
  earlyAccess: boolean; // include Early Access games
  excludeTags: number[];
  minRating: number;    // % positive (only for games with 10+ reviews)
}

export type PresetName = 'off' | 'default' | 'strict';

export const OFF: Floor = { minReviews: 0, graceDays: 0, minPrice: 0, excludeAdult: false, earlyAccess: true, excludeTags: [], minRating: 0 };

export const PRESETS: Record<PresetName, Floor> = {
  off: OFF,
  default: { ...OFF, minReviews: 10, graceDays: 90, minPrice: 2, excludeAdult: true },
  strict: { ...OFF, minReviews: 50, graceDays: 90, minPrice: 5, excludeAdult: true },
};

export const PRESET_LABELS: Record<PresetName, string> = { off: 'Off', default: 'Default', strict: 'Strict' };

const KEYS: (keyof Floor)[] = ['minReviews', 'graceDays', 'minPrice', 'excludeAdult', 'earlyAccess', 'excludeTags', 'minRating'];

export function sameFloor(a: Floor, b: Floor): boolean {
  return KEYS.every(k => {
    const x = a[k], y = b[k];
    return Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((v, i) => v === y[i]) : x === y;
  });
}

/** Which preset a floor equals, or null when customised. */
export function presetOf(f: Floor): PresetName | null {
  return (Object.keys(PRESETS) as PresetName[]).find(p => sameFloor(PRESETS[p], f)) ?? null;
}

// URL encoding: `floor=default` for presets, otherwise compact `fl=r10.g90.p2.a1.e1.r0.x123-456`.
export function floorToParams(f: Floor): Record<string, string | null> {
  const p = presetOf(f);
  if (p === 'default') return { floor: null, fl: null }; // default is implied
  if (p) return { floor: p, fl: null };
  const parts = [`r${f.minReviews}`, `g${f.graceDays}`, `p${f.minPrice}`, `a${+f.excludeAdult}`, `e${+f.earlyAccess}`,
    `q${f.minRating}`];
  if (f.excludeTags.length) parts.push(`x${f.excludeTags.join('-')}`);
  return { floor: null, fl: parts.join('.') };
}

export function floorFromParams(sp: URLSearchParams): Floor {
  const fl = sp.get('fl');
  if (fl) {
    const f: Floor = { ...OFF, excludeTags: [] };
    for (const part of fl.split('.')) {
      const k = part[0], v = part.slice(1);
      if (k === 'r') f.minReviews = +v || 0;
      else if (k === 'g') f.graceDays = +v || 0;
      else if (k === 'p') f.minPrice = +v || 0;
      else if (k === 'a') f.excludeAdult = v === '1';
      else if (k === 'e') f.earlyAccess = v !== '0';
      else if (k === 'q') f.minRating = +v || 0;
      else if (k === 'x') f.excludeTags = v.split('-').map(Number).filter(Number.isFinite);
    }
    return f;
  }
  const name = sp.get('floor') as PresetName | null;
  return PRESETS[name && name in PRESETS ? name : 'default'];
}

/** Body sent to the database functions (camelCase keys, as passes_floor expects). */
export function floorJson(f: Floor) {
  return { ...f };
}

export function describeFloor(f: Floor): string {
  const p = presetOf(f);
  if (p === 'off') return 'All games';
  const bits: string[] = [];
  if (f.minReviews) bits.push(`≥${f.minReviews} reviews${f.graceDays ? ` (except last ${f.graceDays} days)` : ''}`);
  if (f.minPrice) bits.push(`≥£${f.minPrice} or free`);
  if (f.excludeAdult) bits.push('no adult');
  if (!f.earlyAccess) bits.push('no Early Access');
  if (f.minRating) bits.push(`≥${f.minRating}% positive`);
  if (f.excludeTags.length) bits.push(`${f.excludeTags.length} tag(s) excluded`);
  return bits.join(', ') || 'All games';
}
