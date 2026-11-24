// Rising tags: which tags are taking a bigger share of releases. Either the latest 4 quarters the
// floor's grace period doesn't reach vs the 4 before, or this year so far vs the same dates last
// year (newer, but its newest games haven't been held to the review minimum yet).
import { useMemo, useState } from 'react';
import type { Counts } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtInt, fmtPct } from '../../lib/format';
import { risingByQuarter, type RisingRow, type TagQuarters } from '../../lib/home';
import { qLabel, tagStats, type TagCountRow } from '../../lib/trends';
import { QueryState, Section, Seg, Th, useChoice } from '../tags/common';
import type { UseQueryResult } from '@tanstack/react-query';
import { Spark, TagLink } from './bits';

type K = 'name' | 'now' | 'shareNow' | 'change' | 'growth';
const MINS = ['20', '50', '100', '200'] as const;

export default function RisingTags({ tq, table, endQ, cy, ytdLabel }: {
  tq: UseQueryResult<TagQuarters>;
  table: UseQueryResult<{ global: Counts; totals: Counts; rows: TagCountRow[] }>;
  endQ: number; cy: number; ytdLabel: string;
}) {
  const { byId } = useTags();
  const [mode, setMode] = useChoice('rt', ['q', 'ytd'] as const, 'q');
  const [minS, setMin] = useChoice('rm', MINS, '50');
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'growth', dir: -1 });
  const [n, setN] = useState(20);
  const min = +minS;

  const rows = useMemo<RisingRow[]>(() => {
    if (mode === 'q') return tq.data ? risingByQuarter(tq.data, endQ, min) : [];
    if (!table.data) return [];
    return tagStats(table.data.rows, table.data.global, table.data.totals).filter(t => t.ytd >= min)
      .map(t => ({ id: t.id, now: t.ytd, before: t.prev, shareNow: t.shareYtd, shareBefore: t.sharePrev, change: t.change, growth: t.growth, spark: [] }));
  }, [mode, tq.data, table.data, endQ, min]);

  const sorted = useMemo(() => {
    const val = (r: RisingRow) => (sort.k === 'name' ? (byId.get(r.id)?.name ?? '').toLowerCase() : r[sort.k]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [rows, sort, byId]);

  const q = mode === 'q' ? tq : table;
  const when = mode === 'q' ? `${qLabel(endQ - 3)} – ${qLabel(endQ)} vs the 4 quarters before`
    : `${cy} to ${ytdLabel} vs the same dates in ${cy - 1}`;
  return (
    <Section title="Rising tags"
      controls={<>
        <Seg label="Compare" value={mode} onChange={v => { setMode(v); setN(20); }} options={[['q', 'Last 4 quarters'], ['ytd', 'This year so far']]} />
        <label className="gc-inline"><span className="muted">Min. games</span>
          <select className="input" value={minS} onChange={e => setMin(e.target.value as typeof MINS[number])}>
            {MINS.map(m => <option key={m} value={m}>{m}</option>)}
          </select></label>
      </>}
      sub={<>Share of releases with each tag, {when}. Growth = share now ÷ share before.
        {mode === 'q' ? ' Stops at the last quarter the floor’s grace period doesn’t reach.' : ' The newest games skip the review minimum, which flatters tags common among small games.'}</>}>
      <QueryState q={q} height={320}>
        {sorted.length ? (
          <div className="tscroll">
            <table className="dtable">
              <thead><tr>
                <Th k="name" label="Tag" sort={sort} setSort={setSort} />
                <Th k="now" label="Games" sort={sort} setSort={setSort} num />
                <Th k="shareNow" label="Share" sort={sort} setSort={setSort} num title="Share of releases now (before)" />
                <Th k="change" label="Change" sort={sort} setSort={setSort} num title="Percentage points" />
                <Th k="growth" label="Growth" sort={sort} setSort={setSort} num />
                {mode === 'q' && <th>Last 3 years</th>}
              </tr></thead>
              <tbody>{sorted.slice(0, n).map(r => (
                <tr key={r.id}>
                  <td><TagLink id={r.id} /></td>
                  <td className="num">{fmtInt(r.now)}</td>
                  <td className="num">{fmtPct(r.shareNow, 2)} <span className="faint">({fmtPct(r.shareBefore, 2)})</span></td>
                  <td className={`num ${r.change >= 0 ? 'up' : 'down'}`}>{r.change >= 0 ? '+' : '−'}{Math.abs(r.change).toFixed(2)}</td>
                  <td className="num">×{r.growth.toFixed(2)}</td>
                  {mode === 'q' && <td><Spark values={r.spark} label={`${byId.get(r.id)?.name ?? ''} share by quarter`} /></td>}
                </tr>
              ))}</tbody>
            </table>
            {sorted.length > n && <button className="btn small look-more" onClick={() => setN(x => x + 40)}>Show more ({fmtInt(sorted.length - n)} left)</button>}
          </div>
        ) : <div className="empty">No tags with {min}+ games.</div>}
      </QueryState>
    </Section>
  );
}
