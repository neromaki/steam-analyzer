// Home: the state of Steam releases at a glance. Release volume, rising tags, waves still
// running, the all-time trend-setters and what's coming next.
import type { ReactNode } from 'react';
import { GlobalRangeBar } from '../components/RangeControls';
import CurrentWaves from '../components/home/CurrentWaves';
import Leaderboard from '../components/home/Leaderboard';
import RisingTags from '../components/home/RisingTags';
import { SoonCopies, SoonTags } from '../components/home/SoonRadar';
import Volume from '../components/home/Volume';
import { useMeta } from '../lib/data';
import { fmtDate, fmtInt } from '../lib/format';
import { graceQ, lastCleanQ } from '../lib/home';
import { qYear } from '../lib/trends';
import { useFloor } from '../state/floor';
import { useAllTagTable, useLeaderboard, useSoonRadar, useTagQuarters } from '../state/home';
import { RangeScope } from '../state/range';
import { useAxis, useQuarterTotals } from '../state/theme';

function Tiles({ ytdLabel, cy, graceHit, graceDays }: { ytdLabel: string; cy: number; graceHit: boolean; graceDays: number }) {
  const meta = useMeta();
  const table = useAllTagTable();
  const radar = useSoonRadar(365);
  const g = table.data?.global;
  const pct = g && g.n_prev_ytd ? (g.n_ytd / g.n_prev_ytd - 1) * 100 : null;
  const tiles: [string, ReactNode, ReactNode][] = [
    ['Games in the data', meta.data ? fmtInt(meta.data.n_games) : '…', meta.data ? `Steam data up to ${fmtDate(meta.data.fetched_to)}` : ''],
    [`Released in ${cy} so far`, g ? fmtInt(g.n_ytd) : '…',
      // While the floor's grace period lets this year's newest games skip the review minimum, a % change
      // against last year (whose games have had time to collect reviews) would mostly measure that.
      g ? <>{fmtInt(g.n_prev_ytd)} by {ytdLabel} {cy - 1}{graceHit ? `; includes the last ${graceDays} days’ games, which skip the review minimum`
        : pct != null && <> (<span className={pct >= 0 ? 'up' : 'down'}>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(0)}%</span>)</>}</> : ''],
    ['Coming soon', g ? fmtInt(g.n_soon) : '…', radar.data ? `${fmtInt(radar.data.n_soon)} dated in the next 12 months` : ''],
  ];
  return (
    <div className="kpis">
      {tiles.map(([l, v, d]) => (
        <div key={l} className="kpi"><span className="kpi-label">{l}</span><span className="kpi-value">{v}</span><span className="kpi-delta">{d}</span></div>
      ))}
    </div>
  );
}

function HomeBody() {
  const meta = useMeta();
  const [floor] = useFloor();
  const { dataQ, firstQ, wText, minSim } = useAxis();
  const totals = useQuarterTotals();
  const tq = useTagQuarters();
  const table = useAllTagTable();
  const { lb, games, preset, exact } = useLeaderboard();

  if (meta.error) return <div className="banner error">Couldn’t reach the database: {meta.error.message}</div>;
  if (!meta.data || dataQ == null) return <div className="skel" style={{ height: 400 }} aria-label="Loading" />;
  const dataDate = meta.data.fetched_to;
  const ytdLabel = new Date(`${dataDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const cy = qYear(dataQ);
  const endQ = lastCleanQ(dataDate, floor);
  const gq = graceQ(dataDate, floor);
  const lbErr = (lb.error ?? games.error) as Error | null;
  const lbLoading = lb.isFetching || games.isFetching;

  return (
    <>
      <div className="home-head">
        <div>
          <h1>Steam release trends</h1>
          <p className="muted">What’s being released, which tags are rising, which hits set off waves of look-alikes, and what’s coming next.
            Search for a game or tag above to dig into it.</p>
        </div>
        <GlobalRangeBar />
      </div>
      <Tiles ytdLabel={ytdLabel} cy={cy} graceHit={gq != null && qYear(gq) <= cy} graceDays={floor.graceDays} />
      <Volume totals={totals} dataQ={dataQ} firstQ={firstQ} gq={gq} ytdLabel={ytdLabel} graceDays={floor.graceDays} />
      <div className="tags-grid even">
        <RisingTags tq={tq} table={table} endQ={endQ} cy={cy} ytdLabel={ytdLabel} />
        <CurrentWaves rows={lb.data} games={games.data} endQ={endQ} loading={lbLoading} error={lbErr} />
      </div>
      <Leaderboard rows={lb.data} games={games.data} preset={preset} exact={exact} loading={lbLoading} error={lbErr} />
      <div className="tags-grid even">
        <SoonTags />
        <SoonCopies dataQ={dataQ} wText={wText} minSim={minSim} />
      </div>
    </>
  );
}

export default function Home() {
  return (
    <RangeScope>
      <div className="page home-page">
        <HomeBody />
      </div>
    </RangeScope>
  );
}
