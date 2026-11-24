// Trend-setters for a game: similar hits released before it (and the game itself), earliest
// first. The earliest one released by the cluster's take-off is the likely originator. Each row
// shows its own follower wave. "Show all" lists every earlier similar game with 200+ reviews in a
// table you can sort yourself.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fmtDate, fmtInt } from '../../lib/format';
import { countsMap, originator, setterCandidates, wave, type Nb, type Wave } from '../../lib/lineage';
import { qLabel } from '../../lib/trends';
import { useWaves, type GameSettings, type Neighbors } from '../../state/game';
import { useScopedRange } from '../../state/range';
import { useAxis } from '../../state/theme';
import { GameLink, QueryState, Section, Th } from '../tags/common';

type K = 'name' | 'date' | 'reviews' | 'sim' | 'lift' | 'after';
const MAX_WAVES = 48; // follower waves fetched (12 per call): the default rows, or the most-reviewed when showing all

export default function GameSetters({ nb, self, selfWave, tq, s, tot, dataDate, onPick, lens }: {
  nb: UseQueryResult<Neighbors>; self: Nb; selfWave: Wave | null; tq: number | null; s: GameSettings;
  tot: Map<number, number> | null; dataDate: string; onPick: (g: Nb) => void; lens: boolean;
}) {
  const { range } = useScopedRange('gsetters');
  const { dataQ, firstQ } = useAxis();
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'date', dir: 1 });
  const rows = useMemo(() => nb.data?.rows ?? [], [nb.data]);

  const hits = useMemo(() => setterCandidates(self, rows, s.hitReviews, range, dataDate), [self, rows, s.hitReviews, range, dataDate]);
  const every = useMemo(() => setterCandidates(self, rows, Math.min(200, s.hitReviews), range, dataDate), [self, rows, s.hitReviews, range, dataDate]);
  const orig = originator(hits, tq);
  const shown = all ? every : hits.slice(0, 10);

  // Waves for the rows on screen (the game's own comes from the page).
  const want = useMemo(() => {
    const pool = all ? [...every].sort((a, b) => b.reviews - a.reviews) : shown;
    return pool.filter(g => g.appid !== self.appid).slice(0, MAX_WAVES).map(g => g.appid).sort((a, b) => a - b);
  }, [all, every, shown, self.appid]);
  // A lens is one cluster, so each game's lift there is how much that cluster grew after it came out
  // (no extra queries). Otherwise each game's own look-alikes, fetched a few at a time.
  const { waves, loading, error } = useWaves(want, s, !!nb.data && !lens);
  const waveOf = useMemo(() => {
    const m = new Map<number, Wave>();
    if (selfWave) m.set(self.appid, selfWave);
    if (tot && dataQ != null) {
      const cluster = lens && nb.data ? countsMap(nb.data.counts, true) : null;
      for (const g of every) {
        const c = cluster ?? waves.get(g.appid);
        if (c && g.q != null && !m.has(g.appid)) m.set(g.appid, wave(c, tot, g.q, firstQ, dataQ, s.wave));
      }
    }
    return m;
  }, [waves, every, tot, dataQ, firstQ, s.wave, selfWave, self.appid, lens, nb.data]);

  const sorted = useMemo(() => {
    if (!all) return shown;
    const val = (g: Nb): number | string => {
      const w = waveOf.get(g.appid);
      switch (sort.k) {
        case 'name': return g.name.toLowerCase();
        case 'date': return g.date ?? '';
        case 'reviews': return g.reviews;
        case 'sim': return g.sim;
        case 'lift': return w?.lift ?? -1;
        case 'after': return w?.nAfter ?? -1;
      }
    };
    return [...shown].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [all, shown, sort, waveOf]);

  const waveCell = (g: Nb) => {
    const w = waveOf.get(g.appid);
    if (!w) return <span className="faint">{loading ? '…' : '–'}</span>;
    return <>{w.lift != null ? <span className={w.lift >= 2 ? 'up' : undefined}>×{w.lift.toFixed(1)}</span> : <span className="faint">–</span>}</>;
  };
  const afterCell = (g: Nb) => {
    const w = waveOf.get(g.appid);
    return w ? fmtInt(w.nAfter) : <span className="faint">{loading ? '…' : '–'}</span>;
  };
  const name = (g: Nb) => (
    <td className="wrap">
      {g.appid === self.appid ? <b>{g.name}</b> : <GameLink appid={g.appid} name={g.name} />}
      {g.appid === orig?.appid && <span className="badge accent" title={tq != null ? `Earliest hit released by the cluster’s take-off (${qLabel(tq)})` : 'Earliest hit in the cluster'}>
        {tq != null ? 'Likely originator' : 'Earliest hit'}</span>}
      {g.appid === self.appid && <span className="badge">this game</span>}
      <div className="tset-sub faint">{g.dev}</div>
    </td>
  );
  const simCell = (g: Nb) => (g.appid === self.appid ? <span className="faint">–</span>
    : <button className="linkish" onClick={() => onPick(g)} title="Why it’s similar">{g.sim.toFixed(2)}</button>);

  return (
    <Section title="Trend-setters" rangeId="gsetters"
      controls={<button className="btn small" aria-pressed={all} onClick={() => setAll(a => !a)}>
        {all ? 'Earliest hits only' : `Show all (${fmtInt(every.length)})`}</button>}
      sub={<>{all ? 'Every similar game released up to this one with 200+ reviews. Click a heading to sort.'
        : `Similar hits (${fmtInt(s.hitReviews)}+ reviews) released up to this game, earliest first.`}
        {lens ? <>{' '}Lift = how much more common games matching the lens became 6 months–{s.wave.after[1] / 4} years after it came out; followers = how many came out.</>
          : <>{' '}Lift = how much more common close look-alikes became 6 months–{s.wave.after[1] / 4} years after it; followers = how many came out.</>}
        {all && !lens && every.length > MAX_WAVES + 1 ? ` Waves load for the ${MAX_WAVES} most-reviewed.` : ''}{error ? ` Couldn’t load some waves: ${error.message}` : ''}</>}>
      <QueryState q={nb} height={240}>
        {shown.length ? (
          <div className={all ? 'tscroll tset-scroll' : undefined}>
            <table className="dtable">
              <thead>
                {all ? (
                  <tr>
                    <Th k="name" label="Game" sort={sort} setSort={setSort} />
                    <Th k="date" label="Released" sort={sort} setSort={setSort} />
                    <Th k="reviews" label="Reviews" sort={sort} setSort={setSort} num />
                    <Th k="sim" label="Similarity" sort={sort} setSort={setSort} num />
                    <Th k="lift" label="Lift" sort={sort} setSort={setSort} num title="Look-alike share after ÷ before" />
                    <Th k="after" label="Followers" sort={sort} setSort={setSort} num />
                  </tr>
                ) : (
                  <tr><th>Game</th><th>Released</th><th className="num">Reviews</th><th className="num">Similarity</th><th className="num">Lift</th><th className="num">Followers</th></tr>
                )}
              </thead>
              <tbody>{sorted.map(g => (
                <tr key={g.appid} className={g.appid === self.appid ? 'sel' : undefined}>
                  {name(g)}<td>{fmtDate(g.date)}</td><td className="num">{fmtInt(g.reviews)}</td>
                  <td className="num">{simCell(g)}</td><td className="num">{waveCell(g)}</td><td className="num">{afterCell(g)}</td>
                </tr>
              ))}</tbody>
            </table>
            {!all && hits.length > 10 && <p className="faint tset-more">{fmtInt(hits.length - 10)} more: use Show all.</p>}
          </div>
        ) : (
          <div className="empty">No similar hits released before this game{range.from || range.to ? ' in this date range' : ''}. Try a lower hit threshold or similarity.</div>
        )}
      </QueryState>
    </Section>
  );
}
