import { useMeta } from '../lib/data';
import { fmtDate, fmtInt } from '../lib/format';

// The general analysis (trends overview, trend-setters leaderboard, coming-soon radar)
// lands here in milestone 6.
export default function Home() {
  const meta = useMeta();
  return (
    <div className="page">
      <h1>Steam release trends</h1>
      <p className="muted">
        Search for a game or a tag above to see what's rising, who started it, and what the new games copy.
      </p>
      {meta.data && (
        <p className="faint">
          {fmtInt(meta.data.n_games)} games, Steam data up to {fmtDate(meta.data.fetched_to)}.
        </p>
      )}
      {meta.error && <div className="banner error">Couldn't reach the database: {meta.error.message}</div>}
    </div>
  );
}
