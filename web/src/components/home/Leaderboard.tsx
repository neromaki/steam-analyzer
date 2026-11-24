// Trend-setters leaderboard: the hits that set off the biggest waves of look-alikes, across all of
// Steam (precomputed by the pipeline for the three floor presets). Filter by release year and
// tag; sort by any column.
import { useMemo, useState } from 'react';
import type { GameBasic, LeaderRow } from '../../lib/api';
import { useTags } from '../../lib/data';
import { PRESET_LABELS, type PresetName } from '../../lib/floor';
import { fmtDate, fmtInt, fmtPct } from '../../lib/format';
import { inMonths } from '../../lib/lineage';
import { useUpdateParams } from '../../lib/url';
import { useScopedRange } from '../../state/range';
import { useSearchParams } from 'react-router-dom';
import { GameLink, Section, TagNames, Th } from '../tags/common';
import { Spark } from './bits';

type K = 'rank' | 'name' | 'date' | 'reviews' | 'lift' | 'excess' | 'after';
const PAGE = 50;

interface Row { r: LeaderRow; g: GameBasic }

export default function Leaderboard({ rows, games, preset, exact, loading, error }: {
  rows: LeaderRow[] | undefined; games: Map<number, GameBasic> | undefined; preset: PresetName; exact: boolean;
  loading: boolean; error: Error | null;
}) {
  const { byId } = useTags();
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const year = sp.get('ly') ?? '';
  const tag = Number(sp.get('lt')) || 0;
  const { range } = useScopedRange('board');
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'rank', dir: 1 });
  const [n, setN] = useState(PAGE);

  const all = useMemo<Row[]>(() => (rows && games ? rows.flatMap(r => { const g = games.get(r.appid); return g ? [{ r, g }] : []; }) : []), [rows, games]);
  // Filter options from the board itself: its years and its most common tags.
  const years = useMemo(() => [...new Set(all.map(x => x.g.release_date?.slice(0, 4)).filter(Boolean) as string[])].sort().reverse(), [all]);
  const tagOpts = useMemo(() => {
    const c = new Map<number, number>();
    for (const x of all) for (const t of x.g.tag_ids.slice(0, 8)) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c].filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, 80);
  }, [all]);

  const shown = useMemo(() => {
    const f = all.filter(x => (!year || x.g.release_date?.startsWith(year)) && (!tag || x.g.tag_ids.slice(0, 8).includes(tag))
      && inMonths(x.g.release_date, range));
    const val = (x: Row): number | string => {
      switch (sort.k) {
        case 'rank': return x.r.rank;
        case 'name': return x.g.name.toLowerCase();
        case 'date': return x.g.release_date ?? '';
        case 'reviews': return x.g.reviews;
        case 'lift': return x.r.lift;
        case 'excess': return x.r.excess;
        case 'after': return x.r.n_after;
      }
    };
    return f.sort((a, b) => {
      const p = val(a), q = val(b);
      return (typeof p === 'string' ? p.localeCompare(q as string) : (p as number) - (q as number)) * sort.dir || a.r.rank - b.r.rank;
    });
  }, [all, year, tag, range, sort]);

  const set = (k: string, v: string) => { update(p => (v ? p.set(k, v) : p.delete(k))); setN(PAGE); };
  return (
    <Section title="Trend-setters leaderboard" rangeId="board"
      controls={<>
        <label className="gc-inline"><span className="muted">Released</span>
          <select className="input" value={year} onChange={e => set('ly', e.target.value)}>
            <option value="">Any year</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
          </select></label>
        <label className="gc-inline"><span className="muted">Tag</span>
          <select className="input" value={tag || ''} onChange={e => set('lt', e.target.value)}>
            <option value="">Any tag</option>{tagOpts.map(([t, k]) => <option key={t} value={t}>{byId.get(t)?.name ?? t} ({k})</option>)}
          </select></label>
      </>}
      sub={<>Hits (2,000+ reviews) ranked by the wave of look-alikes they set off: how much more common close look-alikes by other
        developers became in the 6 months–3 years after release (lift) and how many more there were than expected (extra games).
        Worked out for the {PRESET_LABELS[preset]} floor{exact ? '' : ' (your floor is custom, so the nearest preset is shown)'}.</>}>
      {error ? <div className="empty">Couldn’t load: {error.message}</div>
        : !rows || !games ? <div className="skel" style={{ height: 400 }} aria-label={loading ? 'Loading' : undefined} />
        : shown.length ? (
          <div className="tscroll look-scroll">
            <table className="dtable">
              <thead><tr>
                <Th k="rank" label="#" sort={sort} setSort={setSort} num />
                <Th k="name" label="Game" sort={sort} setSort={setSort} />
                <Th k="date" label="Released" sort={sort} setSort={setSort} />
                <Th k="reviews" label="Reviews" sort={sort} setSort={setSort} num />
                <Th k="lift" label="Lift" sort={sort} setSort={setSort} num title="Look-alike share after ÷ before" />
                <th className="num" title="Share of releases that closely match it: 2 years before → 6 months–3 years after">Share</th>
                <Th k="excess" label="Extra games" sort={sort} setSort={setSort} num title="Look-alikes above what the earlier share would predict" />
                <Th k="after" label="Followers" sort={sort} setSort={setSort} num title="Look-alikes by other developers within 3 years" />
                <th>Wave</th>
              </tr></thead>
              <tbody>{shown.slice(0, n).map(({ r, g }) => {
                const hq = g.release_q ?? r.first_q;
                const s0 = Math.max(0, hq - 8 - r.first_q);
                return (
                  <tr key={r.appid}>
                    <td className="num faint">{r.rank}</td>
                    <td className="wrap"><GameLink appid={g.appid} name={g.name} /><div className="tset-sub"><span className="faint">{g.developer} · </span><TagNames ids={g.tag_ids} max={3} /></div></td>
                    <td>{fmtDate(g.release_date)}</td>
                    <td className="num">{fmtInt(g.reviews)}</td>
                    <td className="num">×{r.lift.toFixed(1)}</td>
                    <td className="num faint">{fmtPct(r.share_before, 2)} → {fmtPct(r.share_after, 2)}</td>
                    <td className="num">{fmtInt(Math.round(r.excess))}</td>
                    <td className="num">{fmtInt(r.n_after)}</td>
                    <td><Spark values={r.share.slice(s0, hq - r.first_q + 13)} mark={hq - r.first_q - s0} label={`${g.name} look-alike share`} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
            {shown.length > n && <button className="btn small look-more" onClick={() => setN(x => x + PAGE * 2)}>Show more ({fmtInt(shown.length - n)} left)</button>}
          </div>
        ) : <div className="empty">No trend-setters match these filters.</div>}
    </Section>
  );
}
