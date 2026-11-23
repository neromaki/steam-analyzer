// Compare: overlay the share of releases for several tags or tag sets. Each set keeps its
// colour slot when others are removed. URL: cmp=1:492,1036;3:1666 (slot:tag ids).
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { configured, themeSeries, type QTotal, type Theme } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtInt, fmtPct } from '../../lib/format';
import { GRANS, shareSeries, type Gran, type ShareSeries } from '../../lib/trends';
import { useUpdateParams } from '../../lib/url';
import { useFloor } from '../../state/floor';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import TagPicker from '../TagPicker';
import { ChartOrTable, Section, Seg, useChoice } from './common';

interface CmpSet { slot: number; ids: number[] }
const MAX = 8;

function parseCmp(s: string | null): CmpSet[] {
  const out: CmpSet[] = [];
  for (const part of (s ?? '').split(';')) {
    const [a, b] = part.split(':');
    const slot = +a, ids = (b ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (slot >= 1 && slot <= MAX && ids.length && !out.some(o => o.slot === slot)) out.push({ slot, ids });
  }
  return out;
}
const fmtCmp = (sets: CmpSet[]) => sets.map(s => `${s.slot}:${s.ids.join(',')}`).join(';');

export default function Compare({ theme, totals, dataQ, firstQ }: { theme: Theme; totals: QTotal[]; dataQ: number; firstQ: number }) {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const { byId } = useTags();
  const [floor] = useFloor();
  const c = useChartColors();
  const { range } = useScopedRange('compare');
  const [gran, setGran] = useChoice<Gran>('cg', ['year', 'ytd', 'quarter'] as const, 'year');
  const sets = parseCmp(sp.get('cmp'));
  const setSets = (s: CmpSet[]) => update(n => (s.length ? n.set('cmp', fmtCmp(s)) : n.delete('cmp')));
  const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
  const addSet = (ids: number[]) => {
    if (!ids.length || sets.length >= MAX || sets.some(s => key(s.ids) === key(ids))) return;
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find(n => !sets.some(s => s.slot === n))!;
    setSets([...sets, { slot, ids }]);
  };
  const name = (ids: number[]) => ids.map(id => byId.get(id)?.name ?? id).join(' + ');

  const qs = useQueries({
    queries: sets.map(s => ({
      queryKey: ['theme_series', JSON.stringify({ inc: s.ids }), JSON.stringify(floor)],
      queryFn: () => themeSeries({ inc: s.ids }, floor), staleTime: 3600e3, gcTime: 3600e3, enabled: configured,
    })),
  });
  const data = qs.map(q => q.data);
  // One string dependency: the number of sets (and so of queries) changes between renders.
  const dataKey = fmtCmp(sets) + '|' + qs.map(q => q.dataUpdatedAt).join(',');
  const series = useMemo(() => sets.map((s, i) => ({
    set: s, s: data[i] ? shareSeries(data[i]!.series, totals, gran, range, dataQ, firstQ) : null,
  })), [dataKey, totals, gran, range, dataQ, firstQ]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = series.filter((x): x is { set: CmpSet; s: ShareSeries } => !!x.s);
  const labels = ready[0]?.s.labels ?? [];

  const option = useMemo<EOption>(() => {
    const b = baseOption(c);
    return {
      ...b,
      grid: { ...(b.grid as object), top: 36 },
      legend: { top: 0, left: 0, textStyle: { color: c.text }, itemWidth: 14, itemHeight: 2, icon: 'rect' },
      tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: c.axis } },
        valueFormatter: (v: number) => fmtPct(v, 2) },
      xAxis: { ...(b.xAxis as object), type: 'category', data: labels, boundaryGap: false },
      yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => `${+v.toFixed(2)}%` } },
      series: ready.map(({ set, s }) => {
        const col = c.series[set.slot - 1];
        return { name: name(set.ids), type: 'line', data: s.any, showSymbol: labels.length < 40, symbolSize: 6,
          lineStyle: { width: 2, color: col }, itemStyle: { color: col, borderColor: c.panel, borderWidth: 2 }, emphasis: { focus: 'series' } };
      }),
    };
  }, [ready, labels, c, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAddTheme = !!theme.inc?.length && !theme.q && !sets.some(s => key(s.ids) === key(theme.inc!));
  return (
    <Section title="Compare" rangeId="compare"
      controls={<Seg label="Granularity" value={gran} options={GRANS} onChange={setGran} />}
      sub="Share of all releases for each tag or tag set (all of a set’s tags, anywhere in the game’s tags).">
      <div className="cmp-add">
        <div className="cmp-chips">
          {sets.map(s => (
            <span key={s.slot} className="chip">
              <i className="swatch" style={{ background: `var(--s${s.slot})` }} />
              {name(s.ids)}
              <button className="x" aria-label={`Remove ${name(s.ids)}`} onClick={() => setSets(sets.filter(x => x.slot !== s.slot))}>×</button>
            </span>
          ))}
        </div>
        {sets.length < MAX && (
          <>
            <TagPicker value={[]} onChange={ids => addSet(ids.slice(-1))} placeholder="Add a tag to compare…" />
            {canAddTheme && <button className="btn small" onClick={() => addSet(theme.inc!)}>Add this search</button>}
          </>
        )}
      </div>
      {!sets.length ? <div className="empty">Add tags or tag sets to compare their share of releases.</div>
        : !ready.length ? <div className="skel" style={{ height: 300 }} aria-label="Loading" />
        : (
          <ChartOrTable
            chart={<EChart option={option} height={320} label="Compare share of releases" />}
            table={
              <table className="dtable">
                <thead><tr><th>{gran === 'quarter' ? 'Quarter' : 'Year'}</th>{ready.map(({ set }) => <th key={set.slot} className="num">{name(set.ids)}</th>)}</tr></thead>
                <tbody>{labels.map((l, i) => (
                  <tr key={l}><td>{l}</td>{ready.map(({ set, s }) => <td key={set.slot} className="num" title={`${fmtInt(s.nAny[i])} games`}>{fmtPct(s.any[i], 2)}</td>)}</tr>
                )).reverse()}</tbody>
              </table>
            } />
        )}
    </Section>
  );
}
