// Paged Games results: the table asks for whichever 100-row pages are on screen, and the
// total is fetched separately (it only changes when the filters do, not the sort or scroll).
// While a new search loads, the previous results stay on screen (marked stale) instead of
// blanking the table.
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { configured, searchGames, type GameQuery, type GameRow } from '../lib/api';
import type { Floor } from '../lib/floor';

export const PAGE = 100;

const pageKey = (key: string, floorKey: string, page: number) => ['games', key, floorKey, page] as const;

export function useGameResults(query: GameQuery, floor: Floor, pages: number[]) {
  const qc = useQueryClient();
  const key = JSON.stringify(query);
  const floorKey = JSON.stringify(floor);
  const { sort: _s, dir: _d, ...countQuery } = query; // eslint-disable-line @typescript-eslint/no-unused-vars
  const countKey = JSON.stringify(countQuery);

  const count = useQuery({
    queryKey: ['games-count', countKey, floorKey],
    queryFn: () => searchGames({ ...countQuery, count: 'only' }, floor).then(r => r.total ?? 0),
    placeholderData: keepPreviousData,
    enabled: configured,
  });

  const results = useQueries({
    queries: pages.map(p => ({
      queryKey: pageKey(key, floorKey, p),
      queryFn: () => searchGames({ ...query, count: 'none', limit: PAGE, offset: p * PAGE }, floor).then(r => r.rows ?? []),
      enabled: configured,
    })),
  });

  // Which search's rows are on screen: the current one once its visible pages have arrived.
  const current = `${key}|${floorKey}`;
  const [shown, setShown] = useState({ id: current, key, floorKey });
  const ready = results.length > 0 && results.every(r => r.data);
  useEffect(() => {
    if (ready && shown.id !== current) setShown({ id: current, key, floorKey });
  }, [ready, current, shown.id, key, floorKey]);
  const stale = shown.id !== current;

  // A handful of pages at most, so this is cheap to rebuild each render.
  const loaded = new Map<number, GameRow[]>();
  pages.forEach((p, i) => {
    const d = stale ? qc.getQueryData<GameRow[]>(pageKey(shown.key, shown.floorKey, p)) : results[i].data;
    if (d) loaded.set(p, d);
  });

  const first = loaded.get(0);
  // Until the count arrives, size the list from what has loaded so far.
  const total = count.data ?? (first ? (first.length < PAGE ? first.length : PAGE) : 0);
  const error = count.error ?? results.find(r => r.error)?.error ?? null;

  return {
    total,
    counting: count.isFetching,
    stale: stale || count.isPlaceholderData,
    loading: count.data == null && loaded.size === 0 && results.some(r => r.isLoading),
    error,
    retry: () => { void count.refetch(); results.forEach(r => r.error && void r.refetch()); },
    rowAt: (i: number): GameRow | undefined => loaded.get(Math.floor(i / PAGE))?.[i % PAGE],
  };
}
