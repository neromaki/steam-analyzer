// Share of releases over time for the search: games with the tags anywhere vs as a core
// (top-5) tag, by year / same dates each year / quarter, with the detected take-off marked.
import { useMemo } from 'react';
import type { QTotal, Theme } from '../../lib/api';
import { fmtInt, fmtPct } from '../../lib/format';
import { GRANS, qLabel, qYear, shareSeries, type SeriesRow } from '../../lib/trends';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import { ChartOrTable, QueryState, Section, Seg, useChoice } from './common';
import type { UseQueryResult } from '@tanstack/react-query';

export default function ShareChart({ theme, series, totals, dataQ, firstQ, tq, ytdLabel }: {
  theme: Theme;
  series: UseQueryResult<{ series: SeriesRow[]; soon: number; soon_core: number }>;
  totals: QTotal[];
  dataQ: number; firstQ: number; tq: number | null; ytdLabel: string;
}) {
  const { range } = useScopedRange('share');
  const [gran, setGran] = useChoice('sg', ['year', 'ytd', 'quarter'] as const, 'year');
  const c = useChartColors();
  const hasCore = !!theme.inc?.length;
  const s = useMemo(() => series.data ? shareSeries(series.data.series, totals, gran, range, dataQ, firstQ) : null,
    [series.data, totals, gran, range, dataQ, firstQ]);

  const option = useMemo<EOption | null>(() => {
    if (!s) return null;
    const b = baseOption(c);
    const markIdx = tq == null ? -1 : s.keys.indexOf(gran === 'quarter' ? tq : qYear(tq));
    const line = (name: string, data: number[], color: string) => ({
      name, type: 'line', data, showSymbol: s.keys.length < 40, symbolSize: 6, lineStyle: { width: 2, color },
      itemStyle: { color, borderColor: c.panel, borderWidth: 2 }, emphasis: { disabled: true },
    });
    const ser: object[] = [line(hasCore ? 'Tagged anywhere' : 'Matches the search', s.any, c.series[0])];
    if (hasCore) ser.push(line('Core (top-5 tag)', s.core, c.series[1]));
    if (markIdx >= 0) {
      (ser[0] as Record<string, unknown>).markLine = {
        symbol: 'none', silent: true, lineStyle: { color: c.muted, type: [4, 4], width: 1 },
        label: { formatter: 'take-off', color: c.muted, fontSize: 11 }, data: [{ xAxis: markIdx }],
      };
    }
    return {
      ...b,
      grid: { ...(b.grid as object), top: hasCore ? 36 : 16 },
      legend: hasCore ? { top: 0, left: 0, textStyle: { color: c.text }, itemWidth: 14, itemHeight: 2, icon: 'rect' } : undefined,
      tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: c.axis } },
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
          const i = ps[0].dataIndex;
          return `<b>${s.labels[i]}</b><br>` + ps.map(p => {
            const n = p.seriesName.startsWith('Core') ? s.nCore[i] : s.nAny[i];
            return `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${p.color}"></span> ${p.seriesName}: <b>${fmtPct(p.value, 2)}</b> (${fmtInt(n)})`;
          }).join('<br>') + `<br><span style="opacity:.7">of ${fmtInt(s.total[i])} releases</span>`;
        } },
      xAxis: { ...(b.xAxis as object), type: 'category', data: s.labels, boundaryGap: false },
      yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => `${+v.toFixed(2)}%` } },
      series: ser,
    };
  }, [s, c, tq, gran, hasCore]);

  const note = gran === 'year' ? `* this year is partial (to ${ytdLabel}); “Year, same dates” compares like with like.`
    : gran === 'ytd' ? `Each year counts releases from 1 Jan to ${ytdLabel} only.` : 'The latest quarter may be partial.';

  return (
    <Section title="Share of releases over time" rangeId="share"
      controls={<Seg label="Granularity" value={gran} options={GRANS} onChange={setGran} />}
      sub={<>{tq != null
        ? <>Take-off around <b>{qLabel(tq)}</b>: the rolling quarterly share passed 1.5× its prior two-year level and stayed up.</>
        : 'No sustained take-off in the quarterly share.'} {note}</>}>
      <QueryState q={series} height={300}>
        {s && option && (
          <ChartOrTable
            chart={<EChart option={option} height={300} label="Share of releases over time" />}
            table={
              <table className="dtable">
                <thead><tr><th>{gran === 'quarter' ? 'Quarter' : 'Year'}</th><th className="num">Games</th><th className="num">Share</th>
                  {hasCore && <><th className="num">Core</th><th className="num">Core share</th></>}<th className="num">All releases</th></tr></thead>
                <tbody>{s.labels.map((l, i) => (
                  <tr key={l}><td>{l}</td><td className="num">{fmtInt(s.nAny[i])}</td><td className="num">{fmtPct(s.any[i], 2)}</td>
                    {hasCore && <><td className="num">{fmtInt(s.nCore[i])}</td><td className="num">{fmtPct(s.core[i], 2)}</td></>}
                    <td className="num">{fmtInt(s.total[i])}</td></tr>
                )).reverse()}</tbody>
              </table>
            } />
        )}
      </QueryState>
    </Section>
  );
}
