// Each dot is one of the search's games: when it came out and how many reviews it has (log
// scale). A trend usually looks like one or two big hits, then a growing crowd of smaller
// look-alikes 1–3 years later.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ThemeGame } from '../../lib/api';
import { fmtDate, fmtInt } from '../../lib/format';
import { linkWith } from '../../lib/url';
import { useScopedRange } from '../../state/range';
import EChart, { baseOption, useChartColors, type EOption } from '../EChart';
import { ChartOrTable, GameLink, QueryState, Section } from './common';

const qStart = (q: number) => Date.UTC(Math.floor(q / 4), (q % 4) * 3, 1);
const inRange = (iso: string, from: string | null, to: string | null) =>
  (!from || iso.slice(0, 7) >= from) && (!to || iso.slice(0, 7) <= to);

export default function HitTimeline({ games, tq }: {
  games: UseQueryResult<{ top: ThemeGame[]; n_released: number }>; tq: number | null;
}) {
  const { range } = useScopedRange('hits');
  const c = useChartColors();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const pts = useMemo(() => (games.data?.top ?? []).filter(g => g[2] && g[6] >= 10 && inRange(g[2], range.from, range.to)),
    [games.data, range.from, range.to]);

  const option = useMemo<EOption>(() => {
    const b = baseOption(c);
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const g = pts[p.dataIndex];
          return `<b>${g[1].replace(/</g, '&lt;')}</b><br>${fmtDate(g[2])} · ${fmtInt(g[6])} reviews · ${g[7]}% positive<br><span style="opacity:.7">${(g[8] || '').replace(/</g, '&lt;')}</span>`;
        } },
      xAxis: { ...(b.xAxis as object), type: 'time', splitLine: { show: false } },
      yAxis: { ...(b.yAxis as object), type: 'log', min: 10, logBase: 10,
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmtInt(v) } },
      series: [{
        type: 'scatter', symbolSize: 8, large: pts.length > 2000,
        itemStyle: { color: c.series[0], opacity: 0.75, borderColor: c.panel, borderWidth: 1 },
        data: pts.map(g => [Date.parse(g[2]!), g[6]]),
        markLine: tq == null ? undefined : {
          symbol: 'none', silent: true, lineStyle: { color: c.muted, type: [4, 4], width: 1 },
          label: { formatter: 'take-off', color: c.muted, fontSize: 11 }, data: [{ xAxis: qStart(tq) }],
        },
      }],
    };
  }, [pts, c, tq]);

  return (
    <Section title="Hits over time" rangeId="hits"
      sub={<>Each dot is a game: when it came out, and its reviews (log scale). A trend usually looks like one or two big hits,
        then a growing crowd of smaller look-alikes 1–3 years later. Click a dot to open the game.
        {games.data && games.data.n_released > (games.data.top.length) ? ` Showing the ${fmtInt(games.data.top.length)} most-reviewed of ${fmtInt(games.data.n_released)}.` : ''}</>}>
      <QueryState q={games} height={300}>
        <ChartOrTable
          chart={<EChart option={option} height={300} label="Hits over time"
                         onClick={p => nav(linkWith(`/game/${pts[p.dataIndex][0]}`, sp))} />}
          table={
            <table className="dtable">
              <thead><tr><th>Game</th><th>Released</th><th className="num">Reviews</th><th className="num">Positive</th></tr></thead>
              <tbody>{pts.slice(0, 300).map(g => (
                <tr key={g[0]}><td><GameLink appid={g[0]} name={g[1]} /></td><td>{fmtDate(g[2])}</td>
                  <td className="num">{fmtInt(g[6])}</td><td className="num">{g[7]}%</td></tr>
              ))}</tbody>
            </table>
          } />
      </QueryState>
    </Section>
  );
}
