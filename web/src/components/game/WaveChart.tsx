// Follower wave: the share of each quarter's releases that closely match this game (other
// developers), with its release marked and the before/after windows shaded. A wave looks like
// a flat line that climbs in the quarters after release.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fmtInt, fmtPct } from '../../lib/format';
import type { Nb, Wave } from '../../lib/lineage';
import { monthToQ, qLabel } from '../../lib/trends';
import type { GameSettings, Neighbors } from '../../state/game';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import { ChartOrTable, QueryState, Section } from '../tags/common';

export default function WaveChart({ w, nb, self, tq, s }: {
  w: Wave | null; nb: UseQueryResult<Neighbors>; self: Nb; tq: number | null; s: GameSettings;
}) {
  const c = useChartColors();
  const { range } = useScopedRange('wave');

  // Visible slice of the wave's quarters.
  const view = useMemo(() => {
    if (!w) return null;
    const lo = range.from ? monthToQ(range.from) : -Infinity, hi = range.to ? monthToQ(range.to) : Infinity;
    const idx = w.keys.map((q, i) => [q, i] as const).filter(([q]) => q >= lo && q <= hi).map(([, i]) => i);
    return { idx, keys: idx.map(i => w.keys[i]) };
  }, [w, range.from, range.to]);

  const option = useMemo<EOption | null>(() => {
    if (!w || !view?.keys.length) return null;
    const b = baseOption(c);
    const labels = view.keys.map(qLabel);
    const at = (q: number) => { const k = Math.min(Math.max(q, view.keys[0]), view.keys[view.keys.length - 1]); return qLabel(k); };
    const { before, after } = s.wave;
    const area = (from: number, to: number, name: string, col: string) => [{ name, xAxis: at(from), itemStyle: { color: col } }, { xAxis: at(to) }];
    const marks: unknown[] = [];
    if (w.hq - 1 >= view.keys[0]) marks.push(area(w.hq - before, w.hq - 1, 'before', c.grid));
    if (w.hq + after[0] <= view.keys[view.keys.length - 1]) marks.push(area(w.hq + after[0], w.hq + after[1], 'after', c.grid));
    const lines: unknown[] = [];
    if (w.hq >= view.keys[0] && w.hq <= view.keys[view.keys.length - 1]) {
      lines.push({ xAxis: qLabel(w.hq), label: { formatter: 'Release', color: c.strong }, lineStyle: { color: c.strong, type: 'solid', width: 1.5 } });
    }
    if (tq != null && tq >= view.keys[0] && tq <= view.keys[view.keys.length - 1]) {
      lines.push({ xAxis: qLabel(tq), label: { formatter: 'Cluster take-off', color: c.muted }, lineStyle: { color: c.muted, type: [4, 4], width: 1 } });
    }
    return {
      ...b,
      grid: { ...(b.grid as object), top: 28 },
      tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: c.axis } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = view.idx[ps[0].dataIndex];
          return `<b>${qLabel(w.keys[i])}</b><br>${fmtPct(w.share[i], 2)} of releases<br><span style="opacity:.7">${fmtInt(w.counts[i])} of ${fmtInt(w.total[i])} games</span>`;
        } },
      xAxis: { ...(b.xAxis as object), type: 'category', data: labels, boundaryGap: false, axisLabel: { color: c.muted, fontSize: 11, hideOverlap: true } },
      yAxis: { ...(b.yAxis as object), type: 'value', axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => `${+v.toFixed(2)}%` } },
      series: [{
        type: 'line', name: 'Look-alike share', data: view.idx.map(i => w.share[i]), showSymbol: false,
        lineStyle: { width: 2, color: c.series[1] }, itemStyle: { color: c.series[1] }, areaStyle: { color: c.series[1], opacity: 0.1 },
        markArea: { silent: true, label: { color: c.muted, fontSize: 11, position: 'insideTop' }, itemStyle: { opacity: 0.55 }, data: marks },
        markLine: { symbol: 'none', silent: true, label: { fontSize: 11, position: 'insideEndTop' }, data: lines },
      }],
    };
  }, [w, view, c, s.wave, tq]);

  const yrs = (q: number) => `${q / 4} year${q === 4 ? '' : 's'}`;
  return (
    <Section title="Follower wave" rangeId="wave"
      sub={<>Share of each quarter’s releases that closely match {self.name} (other developers only). Shaded: {yrs(s.wave.before)} before
        and 6 months–{yrs(s.wave.after[1])} after release, the windows the lift compares.</>}>
      <QueryState q={nb} height={300}>
        {!w ? <div className="empty">{self.soon || !self.date ? 'Not released yet: the wave is measured from release.' : 'Loading…'}</div>
          : !option ? <div className="empty">Nothing in this date range.</div>
          : (
            <>
              <ChartOrTable
                chart={<EChart option={option} height={280} label={`Share of releases similar to ${self.name}`} />}
                table={
                  <table className="dtable">
                    <thead><tr><th>Quarter</th><th className="num">Look-alikes</th><th className="num">Releases</th><th className="num">Share</th></tr></thead>
                    <tbody>{[...view!.idx].reverse().map(i => (
                      <tr key={w.keys[i]}><td>{qLabel(w.keys[i])}{w.keys[i] === w.hq ? ' (release)' : ''}</td><td className="num">{fmtInt(w.counts[i])}</td>
                        <td className="num">{fmtInt(w.total[i])}</td><td className="num">{fmtPct(w.share[i], 2)}</td></tr>
                    ))}</tbody>
                  </table>
                } />
              <dl className="wave-figs">
                <div><dt>Before</dt><dd>{w.before != null ? fmtPct(w.before, 2) : '–'}</dd></div>
                <div><dt>After</dt><dd>{w.after != null ? fmtPct(w.after, 2) : '–'}</dd></div>
                <div><dt>Lift</dt><dd>{w.lift != null ? `×${w.lift.toFixed(1)}` : '–'}</dd></div>
                <div><dt>Extra games</dt><dd>{fmtInt(Math.round(w.excess))}</dd></div>
                <div><dt>Followers</dt><dd>{fmtInt(w.nAfter)}</dd></div>
              </dl>
            </>
          )}
      </QueryState>
    </Section>
  );
}
