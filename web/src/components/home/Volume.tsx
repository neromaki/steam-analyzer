// Releases over time (games that pass the quality floor), by year, same dates each year or quarter.
// Periods the floor's grace period reaches are drawn faded: their newest games haven't had time to
// collect reviews, so the floor lets them all through and the count runs high.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { QTotal } from '../../lib/api';
import { fmtInt } from '../../lib/format';
import { qYear, shareSeries, type SeriesRow } from '../../lib/trends';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import { ChartOrTable, QueryState, Section, Seg, useChoice } from '../tags/common';

export default function Volume({ totals, dataQ, firstQ, gq, ytdLabel, graceDays }: {
  totals: UseQueryResult<QTotal[]>; dataQ: number; firstQ: number; gq: number | null; ytdLabel: string; graceDays: number;
}) {
  const { range } = useScopedRange('volume');
  const [gran, setGran] = useChoice('vg', ['year', 'ytd', 'quarter'] as const, 'year');
  const c = useChartColors();
  const s = useMemo(() => {
    if (!totals.data) return null;
    const rows: SeriesRow[] = totals.data.map(([q, ytd, n]) => [q, ytd, n, 0]);
    return shareSeries(rows, totals.data, gran, range, dataQ, firstQ);
  }, [totals.data, gran, range, dataQ, firstQ]);
  // Which points the grace period (or a partial period) touches.
  const faded = useMemo(() => s?.keys.map(k => gq != null && (gran === 'quarter' ? k >= gq : k >= qYear(gq))) ?? [], [s, gq, gran]);

  const option = useMemo<EOption | null>(() => {
    if (!s) return null;
    const b = baseOption(c);
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return `<b>${s.labels[i]}</b><br>${fmtInt(s.nAny[i])} releases${faded[i] ? `<br><span style="opacity:.7">includes games from the last ${graceDays} days<br>not yet held to the review minimum</span>` : ''}`;
        } },
      xAxis: { ...(b.xAxis as object), type: 'category', data: s.labels, axisLabel: { color: c.muted, fontSize: 11, hideOverlap: true } },
      yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmtInt(v) } },
      series: [{
        type: 'bar', name: 'Releases', barMaxWidth: 28,
        data: s.nAny.map((v, i) => ({ value: v, itemStyle: { color: c.series[0], opacity: faded[i] ? 0.4 : 1, borderRadius: [3, 3, 0, 0] } })),
      }],
    };
  }, [s, c, faded, graceDays]);

  const note = gran === 'year' ? `* this year is partial (to ${ytdLabel}); “Year, same dates” compares like with like.`
    : gran === 'ytd' ? `Each year counts releases from 1 Jan to ${ytdLabel} only.` : 'The latest quarter is partial.';
  return (
    <Section title="Releases over time" rangeId="volume"
      controls={<Seg label="Granularity" value={gran} onChange={setGran} options={[['year', 'By year'], ['ytd', 'Year, same dates'], ['quarter', 'By quarter']]} />}
      sub={<>Games released on Steam that pass the quality floor. {note}{gq != null && <> Faded: includes games from the last {graceDays} days, which skip the review minimum, so the count runs high.</>}</>}>
      <QueryState q={totals} height={260}>
        {s && option && (
          <ChartOrTable
            chart={<EChart option={option} height={260} label="Releases per period" />}
            table={<table className="dtable"><thead><tr><th>Period</th><th className="num">Releases</th></tr></thead>
              <tbody>{s.labels.map((l, i) => <tr key={l}><td>{l}{faded[i] ? ' (incl. grace period)' : ''}</td><td className="num">{fmtInt(s.nAny[i])}</td></tr>)}</tbody></table>} />
        )}
      </QueryState>
    </Section>
  );
}
