// Home page data: tag counts per quarter, the coming-soon radar, the leaderboard (with the games'
// basics) and the vectors for "upcoming games that copy recent hits".
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  configured, fetchGamesBasic, fetchLeaderboard, hitVectors, soonRadar, tagQuarters, tagTable, themeVectors,
} from '../lib/api';
import { presetOf, type PresetName } from '../lib/floor';
import { useFloor } from './floor';

const HOUR = 60 * 60 * 1000;
const cached = { staleTime: HOUR, gcTime: HOUR, placeholderData: keepPreviousData } as const;
const fk = (x: unknown) => JSON.stringify(x);

/** 16 quarters: enough for 4 vs 4 quarters ending up to 2 before the latest, plus a sparkline. */
export function useTagQuarters() {
  const [floor] = useFloor();
  return useQuery({ queryKey: ['tag_quarters', 16, fk(floor)], queryFn: () => tagQuarters({ quarters: 16 }, floor), ...cached, enabled: configured });
}

/** Per-tag counts over all games (this year so far vs the same dates last year). */
export function useAllTagTable() {
  const [floor] = useFloor();
  return useQuery({ queryKey: ['tag_table', '{}', fk(floor)], queryFn: () => tagTable({}, floor), ...cached, enabled: configured });
}

export function useSoonRadar(within: number | null) {
  const [floor] = useFloor();
  const p = within == null ? {} : { within };
  return useQuery({ queryKey: ['soon_radar', fk(p), fk(floor)], queryFn: () => soonRadar(p, floor), ...cached, enabled: configured });
}

/** The leaderboard for the floor's preset (it's precomputed for the three presets only). */
export function useLeaderboard() {
  const [floor] = useFloor();
  const exact = presetOf(floor);
  const preset: PresetName = exact ?? 'default';
  const lb = useQuery({ queryKey: ['leaderboard', preset], queryFn: () => fetchLeaderboard(preset), staleTime: HOUR, gcTime: HOUR, enabled: configured });
  const ids = (lb.data ?? []).map(r => r.appid);
  const games = useQuery({
    queryKey: ['games_basic', preset, ids.length], queryFn: () => fetchGamesBasic(ids), staleTime: HOUR, gcTime: HOUR,
    enabled: configured && ids.length > 0,
  });
  return { lb, games, preset, exact: exact != null };
}

export const SOON_SAMPLE = 2000, HIT_LOOKBACK = 12, HIT_REVIEWS = 2000;

/** Coming-soon games (a sample) and recent hits, for the copy analysis. */
export function useSoonVectors(dataQ: number | null, within: number | null, enabled: boolean) {
  const [floor] = useFloor();
  const riseQ = dataQ == null ? null : dataQ + 1; // nothing released after this: coming-soon games only
  const p = { riseQ: riseQ!, maxNew: SOON_SAMPLE * 2, ...(within == null ? {} : { soonWithin: within }) };
  const soon = useQuery({
    queryKey: ['theme_vectors', 'soon', fk(p), fk(floor)], queryFn: () => themeVectors(p, floor),
    staleTime: HOUR, gcTime: HOUR, enabled: configured && enabled && riseQ != null,
  });
  const hp = { riseQ: riseQ!, lookback: HIT_LOOKBACK, minReviews: HIT_REVIEWS };
  const hits = useQuery({
    queryKey: ['hit_vectors', fk(hp), fk(floor)], queryFn: () => hitVectors(hp, floor),
    staleTime: HOUR, gcTime: HOUR, enabled: configured && enabled && riseQ != null,
  });
  return { soon, hits };
}
