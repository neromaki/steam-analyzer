// Key figures for the game: how big its cluster of similar games is, when that cluster took
// off, and whether the game started a wave of look-alikes, rode one, or neither.
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fmtInt, fmtPct } from '../../lib/format';
import type { Nb, VerdictKind, Wave } from '../../lib/lineage';
import { qLabel } from '../../lib/trends';
import type { GameSettings, Neighbors } from '../../state/game';

const VERDICT: Record<VerdictKind, [string, string]> = {
  started: ['Started a wave', 'Close look-alikes became much more common after it came out'],
  rode: ['Rode a wave', 'Its cluster was already taking off before it came out'],
  neither: ['No wave', 'Look-alikes didn’t become much more common after it'],
  early: ['Too soon to tell', 'Less than a year of releases since the wave window opened'],
  unknown: ['Not released', 'Waves are measured from the release date'],
};

const yrs = (q: number) => `${q / 4} years`;

export default function Summary({ nb, self, w, tq, verdict, released, dataDate, s }: {
  nb: UseQueryResult<Neighbors>; self: Nb; w: Wave | null; tq: number | null; verdict: VerdictKind; released: boolean; dataDate: string;
  s: GameSettings;
}) {
  if (!nb.data) return <div className="kpis skel" style={{ height: 64 }} aria-label="Loading" />;
  const rows = nb.data.rows;
  const before = rows.filter(r => !r.soon && r.date && self.date && r.date < self.date).length;
  const soon = rows.filter(r => r.soon || !r.date || r.date > dataDate).length;
  const after = rows.length - before - soon;
  const [vt, vd] = VERDICT[verdict];
  const tiles: [string, ReactNode, ReactNode?][] = [
    ['Similar games', fmtInt(nb.data.n), `${fmtInt(before)} before · ${fmtInt(after)} after · ${fmtInt(soon)} coming soon${nb.data.truncated ? ' (top 3,000 shown)' : ''}`],
    ['Cluster take-off', tq != null ? qLabel(tq) : 'None', tq != null ? 'share of releases sustainably 1.5× its prior level' : 'no sustained rise in similar games'],
    ['Wave', <span className={`verdict v-${verdict}`}>{vt}</span>, vd],
  ];
  if (released && w) {
    tiles.push(
      ['Lift', w.lift != null ? `×${w.lift.toFixed(1)}` : '–',
        w.before != null && w.after != null ? `${fmtPct(w.before, 2)} of releases before → ${fmtPct(w.after, 2)} after` : 'not enough data yet'],
      ['Followers', fmtInt(w.nAfter), `look-alikes by other developers within ${yrs(s.wave.after[1])}${w.excess >= 1 ? `, ~${fmtInt(Math.round(w.excess))} more than expected` : ''}`],
    );
  }
  return (
    <div className={`kpis${nb.isPlaceholderData ? ' stale' : ''}`}>
      {tiles.map(([l, v, d]) => (
        <div key={l} className="kpi"><span className="kpi-label">{l}</span><span className="kpi-value">{v}</span>{d && <span className="kpi-delta">{d}</span>}</div>
      ))}
    </div>
  );
}
