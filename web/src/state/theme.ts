// The Tags tab's "theme" (the current search: tags, excluded tags, name text) and its data.
// The data only changes when a new dump is uploaded, so results are cached for the session
// and the previous result stays on screen while a new one loads.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  configured, hitVectors, quarterTotals, tagTable, themeDist, themeGames, themeSeries, themeVectors, type Theme,
} from '../lib/api';
import { useMeta } from '../lib/data';
import type { Floor } from '../lib/floor';
import { monthEnd } from '../lib/gameFilters';
import type { Range } from '../lib/range';
import { dateToQ } from '../lib/trends';
import { idsParam } from '../lib/url';
import { useFloor } from './floor';

const HOUR = 60 * 60 * 1000;
const cached = { staleTime: HOUR, gcTime: HOUR, placeholderData: keepPreviousData, enabled: configured } as const;

export function themeFromParams(sp: URLSearchParams): Theme {
  const t: Theme = {};
  const inc = idsParam(sp, 'tags'), exc = idsParam(sp, 'xtags');
  if (inc.length) t.inc = inc;
  if (exc.length) t.exc = exc;
  if (sp.get('any') === '1') t.matchAll = false;
  const q = (sp.get('q') ?? '').trim();
  if (q) { t.q = q; if (sp.get('desc') === '1') t.desc = true; }
  return t;
}

export const hasTheme = (t: Theme) => !!(t.inc?.length || t.q);

/** The current theme from the URL, memoised on its content. */
export function useSearchTheme(): Theme {
  const [sp] = useSearchParams();
  const t = themeFromParams(sp);
  const key = JSON.stringify(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  return useMemo(() => t, [key]);
}

/** Range in the database's date form. */
export function rangeDates(r: Range): { from?: string; to?: string } {
  const d: { from?: string; to?: string } = {};
  if (r.from) d.from = `${r.from}-01`;
  if (r.to) d.to = monthEnd(r.to);
  return d;
}

/** Quarter the data runs to, the axis start, and the hit threshold from the build settings. */
export function useAxis() {
  const meta = useMeta();
  const dataQ = meta.data ? dateToQ(meta.data.fetched_to) : null;
  return { dataQ, firstQ: meta.data?.settings.firstQ ?? 2012 * 4, hitReviews: meta.data?.settings.hitReviews ?? 2000,
    wText: meta.data?.settings.wText ?? 0.3, minSim: meta.data?.settings.minSim ?? 0.49 };
}

const fk = (f: Floor) => JSON.stringify(f);

export function useQuarterTotals() {
  const [floor] = useFloor();
  return useQuery({ queryKey: ['quarter_totals', fk(floor)], queryFn: () => quarterTotals(floor), ...cached });
}

export function useThemeSeries(theme: Theme, enabled = true) {
  const [floor] = useFloor();
  return useQuery({ queryKey: ['theme_series', JSON.stringify(theme), fk(floor)], queryFn: () => themeSeries(theme, floor),
    ...cached, enabled: configured && enabled });
}

export function useTagTable(theme: Theme, range: Range) {
  const [floor] = useFloor();
  const p = { ...theme, ...rangeDates(range) };
  return useQuery({ queryKey: ['tag_table', JSON.stringify(p), fk(floor)], queryFn: () => tagTable(p, floor), ...cached });
}

export function useThemeGames(theme: Theme, enabled = true) {
  const [floor] = useFloor();
  return useQuery({ queryKey: ['theme_games', JSON.stringify(theme), fk(floor)], queryFn: () => themeGames(theme, floor),
    ...cached, enabled: configured && enabled });
}

export function useThemeDist(theme: Theme, range: Range, enabled = true) {
  const [floor] = useFloor();
  const p = { ...theme, ...rangeDates(range) };
  return useQuery({ queryKey: ['theme_dist', JSON.stringify(p), fk(floor)], queryFn: () => themeDist(p, floor),
    ...cached, enabled: configured && enabled });
}

export function useThemeVectors(theme: Theme, riseQ: number | null, enabled = true) {
  const [floor] = useFloor();
  return useQuery({
    queryKey: ['theme_vectors', JSON.stringify(theme), riseQ, fk(floor)],
    queryFn: () => themeVectors({ ...theme, riseQ: riseQ! }, floor),
    ...cached, placeholderData: undefined, enabled: configured && enabled && riseQ != null,
  });
}

export function useHitVectors(riseQ: number | null, enabled = true) {
  const [floor] = useFloor();
  return useQuery({
    queryKey: ['hit_vectors', riseQ, fk(floor)], queryFn: () => hitVectors({ riseQ: riseQ! }, floor),
    ...cached, placeholderData: undefined, enabled: configured && enabled && riseQ != null,
  });
}
