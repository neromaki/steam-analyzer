// Year by year: how many of the search's games came out, their share of all releases
// (anywhere / core), and the year's most-reviewed ones.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { QTotal, Theme, ThemeGame } from '../../lib/api';
import { fmtInt, fmtPct } from '../../lib/format';
import { shareSeries, type SeriesRow } from '../../lib/trends';
import { useScopedRange } from '../../state/range';
import { GameLink, QueryState, Section } from './common';

export default function ByYear({ theme, series, totals, games, dataQ, firstQ }: {
  theme: Theme; series: UseQueryResult<{ series: SeriesRow[] }>; totals: QTotal[];
  games: UseQueryResult<{ top: ThemeGame[] }>; dataQ: number; firstQ: number;
}) {
  const { range } = useScopedRange('years');
  const hasCore = !!theme.inc?.length;
  const s = useMemo(() => series.data ? shareSeries(series.data.series, totals, 'year', range, dataQ, firstQ) : null,
    [series.data, totals, range, dataQ, firstQ]);
  const best = useMemo(() => {
    const m = new Map<number, ThemeGame[]>();
    for (const g of games.data?.top ?? []) {
      if (!g[2]) continue;
      const y = +g[2].slice(0, 4), l = m.get(y) ?? [];
      if (l.length < 3) { l.push(g); m.set(y, l); } // top is sorted by reviews already
    }
    return m;
  }, [games.data]);

  return (
    <Section title="By year" rangeId="years">
      <QueryState q={series} height={240}>
        {s && (
          <div className="tscroll by-year">
            <table className="dtable">
              <thead><tr><th>Year</th><th className="num">Games</th><th className="num">Share</th>
                {hasCore && <><th className="num">Core</th><th className="num">Core share</th></>}<th>Most reviewed</th></tr></thead>
              <tbody>{s.keys.map((y, i) => (
                <tr key={y}>
                  <td>{s.labels[i]}</td><td className="num">{fmtInt(s.nAny[i])}</td><td className="num">{fmtPct(s.any[i], 2)}</td>
                  {hasCore && <><td className="num">{fmtInt(s.nCore[i])}</td><td className="num">{fmtPct(s.core[i], 2)}</td></>}
                  <td className="wrap by-year-games">{(best.get(y) ?? []).map(g => (
                    <span key={g[0]}><GameLink appid={g[0]} name={g[1]} /> <span className="faint">{fmtInt(g[6])}</span></span>
                  ))}</td>
                </tr>
              )).reverse()}</tbody>
            </table>
          </div>
        )}
      </QueryState>
    </Section>
  );
}
