// Coming-soon radar: which tags are over-represented among upcoming games compared with the last
// 12 months' releases, and which recent hits the upcoming games copy most.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { configured, fetchGameNames } from '../../lib/api';
import type { CopyInput } from '../../lib/copies';
import { useTags } from '../../lib/data';
import { fmtDate, fmtInt, fmtPct } from '../../lib/format';
import { radarTags, type RadarRow } from '../../lib/home';
import { qLabel } from '../../lib/trends';
import { useCopyWorker } from '../../hooks/useCopyWorker';
import { HIT_LOOKBACK, HIT_REVIEWS, useSoonRadar, useSoonVectors } from '../../state/home';
import { GameLink, QueryState, Section, Seg, TagNames, Th, useChoice, useInView } from '../tags/common';
import { TagLink } from './bits';

type Scope = '12m' | 'all';
const SCOPES: [Scope, string][] = [['12m', 'Dated, next 12 months'], ['all', 'All coming soon']];
const within = (s: Scope) => (s === '12m' ? 365 : null);
const scopeNote = (s: Scope) => (s === '12m' ? 'coming-soon games with a release date in the next 12 months'
  : 'every coming-soon game, including the many with no date (some will never come out)');

type K = 'name' | 'soon' | 'shareSoon' | 'ratio';

export function SoonTags() {
  const { byId } = useTags();
  const [scope, setScope] = useChoice<Scope>('sr', ['12m', 'all'] as const, '12m');
  const q = useSoonRadar(within(scope));
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'ratio', dir: -1 });
  const [n, setN] = useState(20);
  const rows = useMemo(() => {
    if (!q.data) return [];
    const r = radarTags(q.data, 20).filter(x => x.ratio >= 1.2);
    const val = (x: RadarRow) => (sort.k === 'name' ? (byId.get(x.id)?.name ?? '').toLowerCase() : x[sort.k]);
    return r.sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [q.data, sort, byId]);

  return (
    <Section title="Tags on the rise among upcoming games"
      controls={<Seg label="Which upcoming games" value={scope} onChange={v => { setScope(v); setN(20); }} options={SCOPES} />}
      sub={<>Tags more common among {scopeNote(scope)} ({q.data ? fmtInt(q.data.n_soon) : '…'} games) than among the last 12 months’ releases
        ({q.data ? fmtInt(q.data.n_recent) : '…'}). 20+ upcoming games, at least 1.2× as common.</>}>
      <QueryState q={q} height={320}>
        {rows.length ? (
          <div className="tscroll">
            <table className="dtable">
              <thead><tr>
                <Th k="name" label="Tag" sort={sort} setSort={setSort} />
                <Th k="soon" label="Upcoming" sort={sort} setSort={setSort} num />
                <Th k="shareSoon" label="Share" sort={sort} setSort={setSort} num title="Share of upcoming games (of the last 12 months’ releases)" />
                <Th k="ratio" label="×" sort={sort} setSort={setSort} num title="Share among upcoming games ÷ share among recent releases" />
              </tr></thead>
              <tbody>{rows.slice(0, n).map(r => (
                <tr key={r.id}>
                  <td><TagLink id={r.id} /></td>
                  <td className="num">{fmtInt(r.soon)}</td>
                  <td className="num">{fmtPct(r.shareSoon, 1)} <span className="faint">({fmtPct(r.shareRecent, 1)})</span></td>
                  <td className="num">×{r.ratio.toFixed(1)}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > n && <button className="btn small look-more" onClick={() => setN(x => x + 40)}>Show more ({fmtInt(rows.length - n)} left)</button>}
          </div>
        ) : <div className="empty">No tags stand out.</div>}
      </QueryState>
    </Section>
  );
}

export function SoonCopies({ dataQ, wText, minSim }: { dataQ: number; wText: number; minSim: number }) {
  const { tags } = useTags();
  const [scope, setScope] = useChoice<Scope>('sr', ['12m', 'all'] as const, '12m');
  const [ref, seen] = useInView<HTMLDivElement>();
  const { soon, hits } = useSoonVectors(dataQ, within(scope), seen);
  const input = useMemo<CopyInput | null>(() => (soon.data && hits.data && tags.length ? {
    tags: tags.map(t => ({ id: t.id, idf: t.idf, content: t.content, adult: t.adult })),
    news: soon.data.new, cands: hits.data.cand, nNew: 0, nSoon: soon.data.n_soon, wText, minSim, withAdult: false, by: 'soon',
  } : null), [soon.data, hits.data, tags, wText, minSim]);
  const { out, busy } = useCopyWorker(input);
  const r = out?.result;
  const top = useMemo(() => r?.rows.slice(0, 20) ?? [], [r]);
  const want = useMemo(() => [...new Set(top.flatMap(x => x.copies.slice(0, 3).map(([id]) => id)))].sort((a, b) => a - b), [top]);
  const names = useQuery({ queryKey: ['names', want.join(',')], queryFn: () => fetchGameNames(want), enabled: configured && want.length > 0, staleTime: 3600e3 });
  const error = soon.error ?? hits.error;
  const loading = seen && (soon.isFetching || hits.isFetching || busy);

  return (
    <Section title="Upcoming games that copy recent hits"
      controls={<Seg label="Which upcoming games" value={scope} onChange={setScope} options={SCOPES} />}
      sub={<>Hits from {qLabel(dataQ + 1 - HIT_LOOKBACK)} on ({fmtInt(HIT_REVIEWS)}+ reviews), ranked by how many {scopeNote(scope)} closely
        match them (other developers only). {r?.sampled ? 'Counts are estimated from a sample.' : ''}</>}>
      <div ref={ref} aria-busy={loading}>
        {error ? <div className="empty">Couldn’t load: {(error as Error).message}</div>
          : !r ? <div className="skel" style={{ height: 320 }} aria-label="Loading" />
          : top.length ? (
            <div className={`tscroll${busy ? ' stale' : ''}`}>
              <table className="dtable">
                <thead><tr><th>Hit</th><th>Released</th><th className="num">Upcoming look-alikes</th><th>For example</th></tr></thead>
                <tbody>{top.map(x => (
                  <tr key={x.appid}>
                    <td className="wrap"><GameLink appid={x.appid} name={x.name} /><div className="tset-sub"><TagNames ids={x.tags} max={3} /></div></td>
                    <td>{fmtDate(x.releaseDate)}</td>
                    <td className="num">{r.sampled ? '~' : ''}{fmtInt(x.soon)}</td>
                    <td className="wrap soon-eg">{x.copies.slice(0, 3).map(([id]) => {
                      const g = names.data?.get(id);
                      return g ? <span key={id}><GameLink appid={id} name={g.name} /></span> : <span key={id} className="faint">…</span>;
                    })}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="faint">{fmtInt(r.nSoon)} upcoming games checked against {fmtInt(r.nCand)} hits · {out!.ms} ms</p>
            </div>
          ) : <div className="empty">No upcoming games closely match a recent hit.</div>}
      </div>
    </Section>
  );
}
