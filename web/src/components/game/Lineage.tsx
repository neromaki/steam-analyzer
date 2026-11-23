// Lineage: every similar game on one timeline. Left of the line came before this game, right
// came after; coming-soon games sit in a band at the right edge. Height = how similar, dot size
// = reviews. Click a dot to see why it's similar.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fmtDate, fmtInt } from '../../lib/format';
import { inMonths, isReleased, type Nb } from '../../lib/lineage';
import type { Neighbors } from '../../state/game';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import { ChartOrTable, GameLink, QueryState, Section, Seg, useChoice } from '../tags/common';

const DAY = 86400e3;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MINREV = { any: 0, '100': 100, '1k': 1000 } as const;
type MinRev = keyof typeof MINREV;

export default function Lineage({ nb, self, dataDate, onPick }: {
  nb: UseQueryResult<Neighbors>; self: Nb; dataDate: string; onPick: (g: Nb) => void;
}) {
  const c = useChartColors();
  const { range } = useScopedRange('lineage');
  const [mr, setMr] = useChoice<MinRev>('lr', ['any', '100', '1k'] as const, 'any');
  const soonX = Date.parse(dataDate) + 180 * DAY;

  const groups = useMemo(() => {
    const rows = (nb.data?.rows ?? []).filter(g => g.reviews >= MINREV[mr] || !isReleased(g, dataDate));
    const rel = rows.filter(g => isReleased(g, dataDate) && inMonths(g.date, range));
    const showSoon = !range.to;
    return {
      before: rel.filter(g => self.date && g.date! < self.date),
      after: rel.filter(g => !self.date || g.date! >= self.date),
      soon: showSoon ? rows.filter(g => !isReleased(g, dataDate)) : [],
    };
  }, [nb.data, mr, range, dataDate, self.date]);

  const option = useMemo<EOption>(() => {
    const b = baseOption(c);
    const all = [...groups.before, ...groups.after, ...groups.soon];
    const maxRev = Math.max(1, ...all.map(g => g.reviews));
    const size = (rev: number) => 7 + 25 * Math.sqrt(rev / maxRev);
    // Coming-soon games spread across the band so they don't stack on one line.
    const x = (g: Nb) => (isReleased(g, dataDate) ? Date.parse(g.date!) : soonX + (((Math.imul(g.appid, 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 140 * DAY);
    const pt = (g: Nb) => ({ value: [x(g), g.sim, g.reviews], g });
    const ser = (name: string, rows: Nb[], col: string) => ({
      name, type: 'scatter', data: rows.map(pt), symbolSize: (v: number[]) => size(v[2]),
      itemStyle: { color: col, opacity: 0.72, borderColor: c.panel, borderWidth: 1.5 }, emphasis: { focus: 'self' },
    });
    const selfX = self.date && isReleased(self, dataDate) ? Date.parse(self.date) : soonX;
    const series: Record<string, unknown>[] = [
      ser('Before it', groups.before, c.series[0]),
      ser('After it', groups.after, c.series[1]),
      ser('Coming soon', groups.soon, c.series[2]),
    ];
    series[0].markLine = {
      symbol: 'none', silent: true, lineStyle: { color: c.strong, width: 1.5 },
      label: { formatter: 'This game', color: c.strong, fontSize: 11, position: 'insideEndTop' }, data: [{ xAxis: selfX }],
    };
    if (groups.soon.length) {
      series[2].markArea = {
        silent: true, itemStyle: { color: c.grid, opacity: 0.6 },
        label: { color: c.muted, fontSize: 11, position: 'insideTop' },
        data: [[{ name: 'Coming soon', xAxis: soonX - 90 * DAY }, { xAxis: soonX + 90 * DAY }]],
      };
    }
    return {
      ...b,
      grid: { ...(b.grid as object), top: 36 },
      legend: { top: 0, left: 0, textStyle: { color: c.text }, itemWidth: 10, itemHeight: 10 },
      tooltip: { ...(b.tooltip as object), trigger: 'item',
        formatter: (p: { data: { g: Nb } }) => {
          const g = p.data.g;
          return `<b>${esc(g.name)}</b><br>${fmtDate(g.date, g.soon)} · ${fmtInt(g.reviews)} reviews${g.reviews >= 10 ? ` · ${g.pct}% positive` : ''}`
            + `<br>Similarity ${g.sim.toFixed(2)} <span style="opacity:.7">(tags ${g.ts.toFixed(2)}, text ${g.xs.toFixed(2)})</span>`
            + `<br><span style="opacity:.7">${esc(g.dev || '')}</span>`;
        } },
      xAxis: { ...(b.xAxis as object), type: 'time', splitLine: { show: false },
        min: range.from ? Date.parse(`${range.from}-01`) : undefined, max: groups.soon.length ? soonX + 100 * DAY : undefined },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'Similarity', nameTextStyle: { color: c.muted, fontSize: 11, align: 'left' },
        min: (v: { min: number }) => Math.floor(v.min * 20) / 20, max: 1, axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => v.toFixed(2) } },
      series,
    };
  }, [groups, c, self, dataDate, soonX, range.from]);

  const n = groups.before.length + groups.after.length + groups.soon.length;
  const tableRows = useMemo(() => [...groups.before, ...groups.after].sort((a, b) => (a.date! < b.date! ? -1 : 1)).concat(groups.soon), [groups]);

  return (
    <Section title="Lineage" rangeId="lineage"
      controls={<Seg label="Minimum reviews" value={mr} onChange={setMr} options={[['any', 'All'], ['100', '100+ reviews'], ['1k', '1,000+']]} />}
      sub={<>Every similar game by release date: before this game on the left, after it on the right, coming soon at the edge.
        Height is how similar it is; dot size is reviews. Click a dot to see why it’s similar.</>}>
      <QueryState q={nb} height={340}>
        {n ? (
          <ChartOrTable
            chart={<EChart option={option} height={340} label="Similar games by release date and similarity"
                           onClick={p => onPick((p.data as { g: Nb }).g)} />}
            table={
              <table className="dtable">
                <thead><tr><th>Game</th><th>Released</th><th className="num">Reviews</th><th className="num">Similarity</th></tr></thead>
                <tbody>{tableRows.slice(0, 500).map(g => (
                  <tr key={g.appid}><td className="wrap"><GameLink appid={g.appid} name={g.name} /></td><td>{fmtDate(g.date, g.soon)}</td>
                    <td className="num">{fmtInt(g.reviews)}</td><td className="num">{g.sim.toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
            } />
        ) : <div className="empty">No similar games{mr !== 'any' ? ' with that many reviews' : ''} in this date range. Try a lower similarity.</div>}
      </QueryState>
    </Section>
  );
}
