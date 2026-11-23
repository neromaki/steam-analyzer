// Likely trend-setters: the search's big hits released up to the take-off, earliest first,
// so the first row is the earliest big hit in the cluster. "Show all" opens every candidate
// in a table you can sort yourself. Wave figures come from the global hit-wave leaderboard
// (precomputed for the floor presets) when the game is on it.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { configured, fetchLeaderboard, type ThemeGame } from '../../lib/api';
import { PRESET_LABELS, presetOf } from '../../lib/floor';
import { fmtDate, fmtInt } from '../../lib/format';
import { qLabel } from '../../lib/trends';
import { useFloor } from '../../state/floor';
import { useScopedRange } from '../../state/range';
import { GameLink, QueryState, Section, TagNames, Th } from './common';

type K = 'name' | 'date' | 'reviews' | 'pct' | 'lift' | 'after';

export default function TrendSetters({ games, tq, hitReviews }: {
  games: UseQueryResult<{ top: ThemeGame[] }>; tq: number | null; hitReviews: number;
}) {
  const [floor] = useFloor();
  const preset = presetOf(floor) ?? 'default';
  const lb = useQuery({ queryKey: ['leaderboard', preset], queryFn: () => fetchLeaderboard(preset), staleTime: 3600e3, enabled: configured });
  const wave = useMemo(() => new Map((lb.data ?? []).map(r => [r.appid, r])), [lb.data]);
  const { range } = useScopedRange('setters');
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'date', dir: 1 });

  // Candidates: released up to the take-off (or ever, if none), with enough reviews to be a hit.
  const { big, cands } = useMemo(() => {
    const top = (games.data?.top ?? []).filter(g => g[2] && (tq == null || (g[3] ?? 0) <= tq)
      && (!range.from || g[2].slice(0, 7) >= range.from) && (!range.to || g[2].slice(0, 7) <= range.to));
    const minRev = top.some(g => g[6] >= hitReviews) ? hitReviews : 200;
    const big = top.filter(g => g[6] >= minRev).sort((a, b) => (a[2]! < b[2]! ? -1 : 1));
    return { big, cands: top.filter(g => g[6] >= 200), minRev };
  }, [games.data, tq, hitReviews, range.from, range.to]);

  const sorted = useMemo(() => {
    const val = (g: ThemeGame): number | string => {
      const w = wave.get(g[0]);
      switch (sort.k) {
        case 'name': return g[1].toLowerCase();
        case 'date': return g[2] ?? '';
        case 'reviews': return g[6];
        case 'pct': return g[7];
        case 'lift': return w?.lift ?? -1;
        case 'after': return w?.n_after ?? -1;
      }
    };
    return [...cands].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [cands, sort, wave]);

  const rows = all ? sorted : big.slice(0, 8);
  const originator = big[0]?.[0];
  const waveCell = (g: ThemeGame) => {
    const w = wave.get(g[0]);
    return w ? <><span className={w.lift >= 2 ? 'up' : undefined}>×{w.lift.toFixed(1)}</span> <span className="faint">{fmtInt(w.n_after)}</span></> : <span className="faint">–</span>;
  };

  return (
    <Section title="Likely trend-setters" rangeId="setters"
      controls={<button className="btn small" aria-pressed={all} onClick={() => setAll(a => !a)}>
        {all ? 'Earliest hits only' : `Show all (${fmtInt(cands.length)})`}</button>}
      sub={<>{all ? `Every game in this search with 200+ reviews released ${tq != null ? `up to the take-off (${qLabel(tq)})` : 'so far'}. Click a heading to sort.`
        : `The search’s biggest hits released ${tq != null ? `up to the take-off (${qLabel(tq)})` : 'so far'}, earliest first: the first is the earliest big hit in the cluster.`}
        {' '}Wave = how much more common close look-alikes became 1–3 years after it (and how many followed), from the {PRESET_LABELS[preset].toLowerCase()}-floor leaderboard of the top 300 hits.</>}>
      <QueryState q={games} height={200}>
        {rows.length ? (
          <div className={all ? 'tscroll tset-scroll' : undefined}>
            <table className="dtable">
              <thead>
                {all ? (
                  <tr>
                    <Th k="name" label="Game" sort={sort} setSort={setSort} />
                    <Th k="date" label="Released" sort={sort} setSort={setSort} />
                    <Th k="reviews" label="Reviews" sort={sort} setSort={setSort} num />
                    <Th k="pct" label="Positive" sort={sort} setSort={setSort} num />
                    <Th k="lift" label="Wave" sort={sort} setSort={setSort} num title="Look-alike share after ÷ before" />
                    <Th k="after" label="Followers" sort={sort} setSort={setSort} num title="Look-alikes released 1–3 years after" />
                  </tr>
                ) : (
                  <tr><th>Game</th><th>Released</th><th className="num">Reviews</th><th className="num">Wave</th></tr>
                )}
              </thead>
              <tbody>
                {rows.map(g => (
                  <tr key={g[0]}>
                    <td className="wrap">
                      <GameLink appid={g[0]} name={g[1]} />
                      {!all && g[0] === originator && <span className="badge accent" title="Earliest big hit in this search before the take-off">Likely originator</span>}
                      <div className="tset-sub">{g[8] && <span className="faint">{g[8]} · </span>}<TagNames ids={g[9]} max={4} /></div>
                    </td>
                    <td>{fmtDate(g[2])}</td>
                    <td className="num">{fmtInt(g[6])}</td>
                    {all ? <><td className="num">{g[7]}%</td>
                      <td className="num">{wave.get(g[0]) ? `×${wave.get(g[0])!.lift.toFixed(1)}` : <span className="faint">–</span>}</td>
                      <td className="num">{wave.get(g[0]) ? fmtInt(wave.get(g[0])!.n_after) : <span className="faint">–</span>}</td></>
                      : <td className="num">{waveCell(g)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No games with 200+ reviews {tq != null ? 'before the take-off' : 'in this search'}.</div>}
      </QueryState>
    </Section>
  );
}
