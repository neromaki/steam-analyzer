// Waves still running: leaderboard hits whose close look-alikes are, today, still well above the
// share of releases they had before the hit came out.
import { useMemo } from 'react';
import type { GameBasic, LeaderRow } from '../../lib/api';
import { fmtDate, fmtInt, fmtPct } from '../../lib/format';
import { currentWaves } from '../../lib/home';
import { qLabel } from '../../lib/trends';
import { GameLink, Section } from '../tags/common';
import { Spark } from './bits';

const SHOW = 15;

export default function CurrentWaves({ rows, games, endQ, loading, error }: {
  rows: LeaderRow[] | undefined; games: Map<number, GameBasic> | undefined; endQ: number; loading: boolean; error: Error | null;
}) {
  const waves = useMemo(() => {
    if (!rows || !games) return null;
    const rq = new Map<number, number>();
    for (const [id, g] of games) if (g.release_q != null) rq.set(id, g.release_q);
    return currentWaves(rows, rq, endQ).slice(0, SHOW);
  }, [rows, games, endQ]);

  return (
    <Section title="Biggest current waves"
      sub={<>Hits whose close look-alikes are still a much bigger share of releases ({qLabel(endQ - 3)} – {qLabel(endQ)}) than in
        the 2 years before the hit came out. From the top 300 trend-setters below; the line runs from 2 years before release (tick) to now.</>}>
      {error ? <div className="empty">Couldn’t load: {error.message}</div>
        : !waves ? <div className="skel" style={{ height: 320 }} aria-label={loading ? 'Loading' : undefined} />
        : waves.length ? (
          <div className="tscroll">
            <table className="dtable">
              <thead><tr><th>Game</th><th>Released</th><th className="num" title="Share of releases that closely match it: 2 years before release → latest 4 quarters">Look-alikes</th><th className="num">Now</th><th>Trend</th></tr></thead>
              <tbody>{waves.map(w => {
                const g = games!.get(w.row.appid)!;
                return (
                  <tr key={w.row.appid}>
                    <td className="wrap"><GameLink appid={g.appid} name={g.name} /><div className="tset-sub faint">{g.developer} · {fmtInt(g.reviews)} reviews</div></td>
                    <td>{fmtDate(g.release_date)}</td>
                    <td className="num">{fmtPct(w.row.share_before, 2)} → {fmtPct(w.nowShare, 2)}</td>
                    <td className="num">×{w.nowLift.toFixed(1)}</td>
                    <td><Spark values={w.spark} mark={Math.min(8, w.hq - w.row.first_q)} label={`${g.name} look-alike share`} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty">No hits with a wave still running.</div>}
    </Section>
  );
}
