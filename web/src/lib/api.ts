// Typed wrappers around the database functions in supabase/migrations/*_rpc.sql.
import { createClient } from '@supabase/supabase-js';
import type { Floor } from './floor';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = !!(url && key);
export const supabase = configured ? createClient(url!, key!, { auth: { persistSession: false } }) : null;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ---------------------------------------------------------------- shared shapes

export interface Tag { id: number; name: string; ix: number; idf: number; content: boolean; adult: boolean; n_games: number }

export interface Meta { built_at: string; fetched_to: string; n_games: number; settings: { wText: number; minSim: number; hitReviews: number; firstQ: number } }

/** The search "theme": which games a page is about. */
export interface Theme {
  inc?: number[];      // tag ids the games must have
  exc?: number[];      // tag ids they must not have
  matchAll?: boolean;  // all included tags (default) or any
  core?: boolean;      // included tags must be among the game's top 5
  q?: string;          // name substring
  rx?: string;         // regex (Postgres syntax)
  desc?: boolean;      // also search descriptions
}

// ---------------------------------------------------------------- lookups

export async function fetchTags(): Promise<Tag[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('tags').select('*').order('n_games', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Tag[];
}

export async function fetchMeta(): Promise<Meta> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('meta').select('*').single();
  if (error) throw new Error(error.message);
  return data as Meta;
}

// [appid, name, release_date, reviews, coming_soon, header_image]
export type Suggestion = [number, string, string | null, number, boolean, string | null];
export const suggest = (q: string) => rpc<Suggestion[]>('suggest', { q });

// ---------------------------------------------------------------- games results

export interface GameQuery extends Theme {
  status?: 'all' | 'released' | 'upcoming';
  from?: string; to?: string;            // 'YYYY-MM-DD'
  minRating?: number;
  priceMin?: number; priceMax?: number;
  revMin?: number; revMax?: number;
  sort?: 'reviews' | 'rating' | 'released' | 'name';
  dir?: 'asc' | 'desc';
  limit?: number; offset?: number;
  count?: 'both' | 'none' | 'only';     // rows and total, rows only, or total only
}
// [appid, name, release_date, coming_soon, early_access, is_free, price_gbp, reviews, pct_positive,
//  rating, developer, header_image, tags[1:6]]
export type GameRow = [number, string, string | null, boolean, boolean, boolean, number | null, number, number,
  number | null, string, string | null, number[]];
export const searchGames = (p: GameQuery, f: Floor) =>
  rpc<{ total: number | null; rows?: GameRow[] }>('search_games', { p, f });

// ---------------------------------------------------------------- theme analysis

/** [quarter (year*4+q), ytd (same dates as this year so far), n] */
export type QTotal = [number, boolean, number];
export const quarterTotals = (f: Floor) => rpc<QTotal[]>('quarter_totals', { f });

/** series: [q, ytd, n_any, n_core] */
export const themeSeries = (p: Theme, f: Floor) =>
  rpc<{ series: [number, boolean, number, number][]; soon: number; soon_core: number }>('theme_series', { p, f });

export interface Counts { n_all: number; n_range: number; n_ytd: number; n_prev_ytd: number; n_soon: number }
/** rows: [tagid, n_all, n_range, n_ytd, n_prev_ytd, n_soon] */
export const tagTable = (p: Theme & { from?: string; to?: string }, f: Floor) =>
  rpc<{ cy: number; global: Counts; totals: Counts; rows: [number, number, number, number, number, number][] }>('tag_table', { p, f });

// [appid, name, release_date, release_q, coming_soon, early_access, reviews, pct_positive, developer, tags[1:6]]
export type ThemeGame = [number, string, string | null, number | null, boolean, boolean, number, number, string, number[]];
export const themeGames = (p: Theme & { top?: number }, f: Floor) =>
  rpc<{ n_released: number; n_soon: number; top: ThemeGame[]; newest: ThemeGame[]; soon: ThemeGame[] }>('theme_games', { p, f });

export const themeDist = (p: Theme & { from?: string; to?: string }, f: Floor) =>
  rpc<{ reviews: [number, number][]; rating: [number, number][]; price: [number, number][]; monthly: [string, number][] }>('theme_dist', { p, f });

// [appid, release_q, coming_soon, reviews, developer, tag_ids, tag_w, text (ints, x127)]
export type VecRow = [number, number | null, boolean, number, string, number[], number[], number[]];
// VecRow + [name, release_date, pct_positive]
export type CandRow = [...VecRow, string, string, number];
/** The theme's games released since riseQ (sampled to maxNew) and coming soon. */
export const themeVectors = (p: Theme & { riseQ: number; maxNew?: number }, f: Floor) =>
  rpc<{ n_new: number; n_soon: number; new: VecRow[] }>('theme_vectors', { p, f });
/** Candidate hits from the years before riseQ: the same for every theme, so cache per quarter. */
export const hitVectors = (p: { riseQ: number; lookback?: number; minReviews?: number }, f: Floor) =>
  rpc<{ cand: CandRow[] }>('hit_vectors', { p, f });

// ---------------------------------------------------------------- game page

export interface Game {
  appid: number; name: string; release_date: string | null; release_q: number | null; coming_soon: boolean;
  early_access: boolean; is_free: boolean; price_gbp: number | null; reviews: number; pct_positive: number;
  rating: number | null; developer: string; publisher: string; header_image: string | null;
  short_description: string; tag_ids: number[]; tag_w: number[]; is_adult: boolean;
}
export const fetchGame = (appid: number) => rpc<Game | null>('game', { p_appid: appid });

// [appid, name, release_date, release_q, coming_soon, reviews, pct_positive, developer, tags[1:8], sim, tag_sim, text_sim]
export type Neighbor = [number, string, string | null, number | null, boolean, number, number, string, number[], number, number, number];
export interface SimParams { wText: number; minSim: number }
/** Every game at least minSim similar (the `limit` most similar as rows), and per-quarter counts of
 *  all released matches: [release_q, n_all, n_other_developers]. */
export const gameNeighbors = (appid: number, p: SimParams & { limit?: number }, f: Floor) =>
  rpc<{ n: number; counts: [number, number, number][]; rows: Neighbor[] }>('game_neighbors', { p_appid: appid, p, f });
/** Follower counts per quarter (other developers, released) for up to 12 games: [[appid, [[q, n]]]]. */
export const gameWaves = (appids: number[], p: SimParams, f: Floor) =>
  rpc<[number, [number, number][]][]>('game_waves', { p_appids: appids, p, f });

export interface LeaderRow {
  preset: string; rank: number; appid: number; lift: number; share_before: number; share_after: number;
  excess: number; n_after: number; score: number; first_q: number; share: number[]; followers: number[];
}
export async function fetchLeaderboard(preset: string): Promise<LeaderRow[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('leaderboard').select('*').eq('preset', preset).order('rank');
  if (error) throw new Error(error.message);
  return data as LeaderRow[];
}

/** Names (and basics) for a handful of games, e.g. the copies listed under a hit. */
export async function fetchGameNames(appids: number[]): Promise<Map<number, { name: string; release_date: string | null; reviews: number }>> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!appids.length) return new Map();
  const { data, error } = await supabase.from('games').select('appid,name,release_date,reviews').in('appid', appids);
  if (error) throw new Error(error.message);
  return new Map((data as { appid: number; name: string; release_date: string | null; reviews: number }[]).map(r => [r.appid, r]));
}
