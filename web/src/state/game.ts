// Game page data: the game, its similar games, follower waves for trend-setters, and the
// page's similarity/wave settings (in the URL, carried along when moving between game pages).
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { configured, fetchGame, gameNeighbors, gameWaves, type SimParams } from '../lib/api';
import type { Floor } from '../lib/floor';
import { WAVE_DEFAULTS, toNb, type Nb, type WaveOpts } from '../lib/lineage';
import { linkWith } from '../lib/url';
import { useFloor } from './floor';
import { useAxis } from './theme';

const HOUR = 60 * 60 * 1000;
const fk = (x: unknown) => JSON.stringify(x);

/** Settings that follow you from game page to game page. */
export const GAME_KEYS = ['sim', 'wt', 'hr', 'wb', 'wa'] as const;

export interface GameSettings extends SimParams { hitReviews: number; wave: WaveOpts; defaults: SimParams & { hitReviews: number } }

const num = (sp: URLSearchParams, k: string, lo: number, hi: number, d: number) => {
  const v = Number(sp.get(k));
  return sp.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

export function useGameSettings(): GameSettings {
  const [sp] = useSearchParams();
  const ax = useAxis();
  const key = GAME_KEYS.map(k => sp.get(k) ?? '').join('|');
  return useMemo(() => ({
    minSim: num(sp, 'sim', 0.3, 0.9, ax.minSim),
    wText: num(sp, 'wt', 0, 1, ax.wText),
    hitReviews: num(sp, 'hr', 100, 100000, ax.hitReviews),
    wave: { before: num(sp, 'wb', 4, 12, WAVE_DEFAULTS.before), after: [WAVE_DEFAULTS.after[0], num(sp, 'wa', 8, 16, WAVE_DEFAULTS.after[1])] },
    defaults: { minSim: ax.minSim, wText: ax.wText, hitReviews: ax.hitReviews },
  }), [key, ax.minSim, ax.wText, ax.hitReviews]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Link to a game page keeping the floor and the game-page settings. */
export function useGameLink() {
  const [sp] = useSearchParams();
  return useCallback((appid: number) => linkWith(`/game/${appid}`, sp, Object.fromEntries(GAME_KEYS.map(k => [k, sp.get(k)]))), [sp]);
}

export function useGame(appid: number) {
  return useQuery({
    queryKey: ['game', appid], queryFn: () => fetchGame(appid), staleTime: HOUR, gcTime: HOUR,
    enabled: configured && Number.isInteger(appid) && appid > 0,
  });
}

export interface Neighbors { n: number; counts: [number, number, number][]; rows: Nb[]; truncated: boolean }

export const NB_LIMIT = 3000;

/** Query definition for a game's similar games (shared by the page and the influence graph). */
export function neighborsQuery(appid: number, s: SimParams, floor: Floor, limit = NB_LIMIT) {
  const p = { wText: s.wText, minSim: s.minSim, limit };
  return {
    queryKey: ['game_neighbors', appid, fk(p), fk(floor)],
    queryFn: async (): Promise<Neighbors> => {
      const r = await gameNeighbors(appid, p, floor);
      return { n: r.n, counts: r.counts, rows: r.rows.map(toNb), truncated: r.n > r.rows.length };
    },
    staleTime: HOUR, gcTime: HOUR,
  };
}

export function useNeighbors(appid: number, s: SimParams, enabled = true) {
  const [floor] = useFloor();
  return useQuery({
    ...neighborsQuery(appid, s, floor), placeholderData: keepPreviousData,
    enabled: configured && enabled && Number.isInteger(appid) && appid > 0,
  });
}

// Each game in a batch costs a full scan of the vectors. On the free tier's throttled CPU a
// batch of 4 can take several seconds, so batches stay small and only two run at once to keep
// every call well under the API's 15 s limit.
const CHUNK = 4, PARALLEL = 2;

/**
 * Follower counts (quarter → games) for a list of games, fetched a few at a time. Returns what
 * has loaded so far and whether more is coming.
 */
export function useWaves(appids: number[], s: SimParams, enabled = true) {
  const [floor] = useFloor();
  const qc = useQueryClient();
  const p = { wText: s.wText, minSim: s.minSim };
  const chunks = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < appids.length; i += CHUNK) out.push(appids.slice(i, i + CHUNK));
    return out;
  }, [appids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = chunks.map(ids => ['game_waves', ids.join(','), fk(p), fk(floor)]);
  // Batch i starts once all but the last PARALLEL - 1 batches before it have settled.
  const settled = (i: number) => { const st = qc.getQueryState(keys[i]); return !!st && (st.status !== 'pending'); };
  const qs = useQueries({
    queries: chunks.map((ids, i) => ({
      queryKey: keys[i],
      queryFn: () => gameWaves(ids, p, floor),
      staleTime: HOUR, gcTime: HOUR,
      enabled: configured && enabled && keys.slice(0, Math.max(0, i - PARALLEL + 1)).every((_, j) => settled(j)),
    })),
  });
  const stamp = qs.map(q => q.dataUpdatedAt).join(',');
  const waves = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const q of qs) for (const [id, c] of q.data ?? []) m.set(id, new Map(c));
    return m;
  }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  return { waves, loading: configured && enabled && qs.some(q => q.isPending || q.isFetching), error: qs.find(q => q.error)?.error as Error | undefined };
}
