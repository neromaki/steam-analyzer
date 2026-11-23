// Small, rarely-changing lookups cached for the whole session.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { configured, fetchMeta, fetchTags, type Tag } from './api';

const DAY = 24 * 60 * 60 * 1000;

export function useTags() {
  const q = useQuery({ queryKey: ['tags'], queryFn: fetchTags, staleTime: DAY, gcTime: DAY, enabled: configured });
  const byId = useMemo(() => new Map((q.data ?? []).map(t => [t.id, t])), [q.data]);
  return { tags: q.data ?? [], byId, isLoading: q.isLoading, error: q.error };
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: fetchMeta, staleTime: DAY, gcTime: DAY, enabled: configured });
}

/** Tags whose name contains `q`, prefix matches first, then by number of games. */
export function matchTags(tags: Tag[], q: string, limit = 6, exclude: Set<number> = new Set()): Tag[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const hits: [number, Tag][] = [];
  for (const t of tags) {
    if (exclude.has(t.id)) continue;
    const i = t.name.toLowerCase().indexOf(s);
    if (i >= 0) hits.push([i === 0 ? 0 : 1, t]);
  }
  hits.sort((a, b) => a[0] - b[0] || b[1].n_games - a[1].n_games);
  return hits.slice(0, limit).map(h => h[1]);
}
