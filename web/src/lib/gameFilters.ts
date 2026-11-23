// Games-tab filters, kept in the URL so any results view can be shared.
//   tags=492,1036  xtags=…  any=1 (match any tag)  q=…  desc=1 (descriptions too)
//   status=released|upcoming  rmin=80  pmin=2  pmax=20  vmin=100  vmax=…  sort=rating  dir=asc
// The release-date range comes from the page's range scope (id "games"), not from here.
import type { GameQuery } from './api';
import type { Range } from './range';
import { idsParam, setIds } from './url';

export type GameSort = NonNullable<GameQuery['sort']>;
export type Status = 'all' | 'released' | 'upcoming';

export interface GameFilters {
  tags: number[];
  xtags: number[];
  any: boolean;
  q: string;
  desc: boolean;
  status: Status;
  minRating: number | null;
  priceMin: number | null;
  priceMax: number | null;
  revMin: number | null;
  revMax: number | null;
  sort: GameSort;
  dir: 'asc' | 'desc';
}

const SORTS: GameSort[] = ['reviews', 'rating', 'released', 'name'];
/** Each sort's natural direction: names A→Z, everything else biggest/newest first. */
export const defaultDir = (s: GameSort): 'asc' | 'desc' => (s === 'name' ? 'asc' : 'desc');

/** URL keys owned by the Games tab filters (cleared by "Reset filters"; tags and q stay). */
export const FILTER_KEYS = ['xtags', 'any', 'desc', 'status', 'rmin', 'pmin', 'pmax', 'vmin', 'vmax'] as const;

function num(sp: URLSearchParams, k: string): number | null {
  const v = sp.get(k);
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function filtersFromParams(sp: URLSearchParams): GameFilters {
  const s = sp.get('sort') as GameSort | null;
  const sort = s && SORTS.includes(s) ? s : 'reviews';
  const d = sp.get('dir');
  const st = sp.get('status');
  return {
    tags: idsParam(sp, 'tags'),
    xtags: idsParam(sp, 'xtags'),
    any: sp.get('any') === '1',
    q: sp.get('q') ?? '',
    desc: sp.get('desc') === '1',
    status: st === 'released' || st === 'upcoming' ? st : 'all',
    minRating: num(sp, 'rmin'),
    priceMin: num(sp, 'pmin'),
    priceMax: num(sp, 'pmax'),
    revMin: num(sp, 'vmin'),
    revMax: num(sp, 'vmax'),
    sort,
    dir: d === 'asc' || d === 'desc' ? d : defaultDir(sort),
  };
}

/** Write a patch of filters into `sp`, dropping anything at its default so URLs stay short. */
export function applyFilters(sp: URLSearchParams, patch: Partial<GameFilters>) {
  const put = (k: string, v: string | null) => { if (v == null) sp.delete(k); else sp.set(k, v); };
  const setNum = (k: string, v: number | null | undefined) => put(k, v == null || v <= 0 ? null : String(v));
  const setFlag = (k: string, v: boolean) => put(k, v ? '1' : null);
  if (patch.tags) setIds(sp, 'tags', patch.tags);
  if (patch.xtags) setIds(sp, 'xtags', patch.xtags);
  if (patch.any != null) setFlag('any', patch.any);
  if (patch.q != null) put('q', patch.q.trim() || null);
  if (patch.desc != null) setFlag('desc', patch.desc);
  if (patch.status) put('status', patch.status === 'all' ? null : patch.status);
  if ('minRating' in patch) setNum('rmin', patch.minRating);
  if ('priceMin' in patch) setNum('pmin', patch.priceMin);
  if ('priceMax' in patch) setNum('pmax', patch.priceMax);
  if ('revMin' in patch) setNum('vmin', patch.revMin);
  if ('revMax' in patch) setNum('vmax', patch.revMax);
  if (patch.sort || patch.dir) {
    const sort = patch.sort ?? filtersFromParams(sp).sort;
    const dir = patch.dir ?? defaultDir(sort);
    put('sort', sort === 'reviews' ? null : sort);
    put('dir', dir === defaultDir(sort) ? null : dir);
  }
}

/** How many filters differ from the defaults (tags and the text search don't count). */
export function activeFilterCount(f: GameFilters): number {
  return [f.xtags.length > 0, f.any, f.desc, f.status !== 'all', f.minRating != null,
    f.priceMin != null || f.priceMax != null, f.revMin != null || f.revMax != null].filter(Boolean).length;
}

/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

/** The search_games parameters for these filters and date range (without paging). */
export function toQuery(f: GameFilters, range: Range): GameQuery {
  const q: GameQuery = { sort: f.sort, dir: f.dir };
  if (f.tags.length) q.inc = f.tags;
  if (f.xtags.length) q.exc = f.xtags;
  if (f.any) q.matchAll = false;
  if (f.q.trim()) q.q = f.q.trim();
  if (f.desc && q.q) q.desc = true;
  if (f.status !== 'all') q.status = f.status;
  // "Upcoming only" ignores the date range: most coming-soon games have no firm date.
  if (f.status !== 'upcoming') {
    if (range.from) q.from = `${range.from}-01`;
    if (range.to) q.to = monthEnd(range.to);
  }
  if (f.minRating != null) q.minRating = f.minRating;
  if (f.priceMin != null) q.priceMin = f.priceMin;
  if (f.priceMax != null) q.priceMax = f.priceMax;
  if (f.revMin != null) q.revMin = f.revMin;
  if (f.revMax != null) q.revMax = f.revMax;
  return q;
}
