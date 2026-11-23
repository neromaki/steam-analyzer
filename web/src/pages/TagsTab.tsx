// Search › Tags: everything about the current search's tags. Each section loads on its own,
// keeps its previous result while the search changes, and follows the page's date range
// unless overridden.
import { useMemo } from 'react';
import ByYear from '../components/tags/ByYear';
import Compare from '../components/tags/Compare';
import Copies from '../components/tags/Copies';
import Distributions from '../components/tags/Distributions';
import HitTimeline from '../components/tags/HitTimeline';
import RelatedTags from '../components/tags/RelatedTags';
import ShareChart from '../components/tags/ShareChart';
import TagTable from '../components/tags/TagTable';
import TrendSetters from '../components/tags/TrendSetters';
import type { Theme } from '../lib/api';
import { useMeta } from '../lib/data';
import { fmtInt, fmtPct } from '../lib/format';
import { qLabel, qYear, takeoffQ } from '../lib/trends';
import { useScopedRange } from '../state/range';
import { hasTheme, useAxis, useQuarterTotals, useSearchTheme, useTagTable, useThemeGames, useThemeSeries } from '../state/theme';

function Kpis({ theme, cy, tq }: { theme: Theme; cy: number; tq: number | null }) {
  const { range } = useScopedRange('tagtable'); // same call as the tag table
  const q = useTagTable(theme, range);
  if (!q.data) return <div className="kpis skel" style={{ height: 64 }} aria-label="Loading" />;
  const { totals: t, global: g } = q.data;
  const now = g.n_ytd ? (t.n_ytd / g.n_ytd) * 100 : 0, prev = g.n_prev_ytd ? (t.n_prev_ytd / g.n_prev_ytd) * 100 : 0;
  const tiles: [string, React.ReactNode, React.ReactNode?][] = [
    ['Released', fmtInt(t.n_all)],
    [`${cy} so far`, fmtInt(t.n_ytd), `${fmtInt(t.n_prev_ytd)} by this date in ${cy - 1}`],
    [`Share of ${cy} releases`, fmtPct(now, 2),
      <span className={now >= prev ? 'up' : 'down'}>{prev ? `×${(now / prev).toFixed(2)}` : 'new'} vs {fmtPct(prev, 2)}</span>],
    ['Coming soon', fmtInt(t.n_soon), `${fmtPct(g.n_soon ? (t.n_soon / g.n_soon) * 100 : 0, 2)} of all coming-soon games`],
    ['Take-off', tq != null ? qLabel(tq) : 'None', tq != null ? 'share sustainably above 1.5× its prior level' : 'no sustained rise detected'],
  ];
  return (
    <div className={`kpis${q.isPlaceholderData ? ' stale' : ''}`}>
      {tiles.map(([l, v, d]) => (
        <div key={l} className="kpi"><span className="kpi-label">{l}</span><span className="kpi-value">{v}</span>{d && <span className="kpi-delta">{d}</span>}</div>
      ))}
    </div>
  );
}

export default function TagsTab() {
  const theme = useSearchTheme();
  const themed = hasTheme(theme);
  const meta = useMeta();
  const { dataQ, firstQ, hitReviews, wText, minSim } = useAxis();
  const totals = useQuarterTotals();
  const series = useThemeSeries(theme, themed);
  const games = useThemeGames(theme, themed);
  const tq = useMemo(() => (series.data && totals.data && dataQ != null
    ? takeoffQ(series.data.series, totals.data, dataQ, firstQ) : null), [series.data, totals.data, dataQ, firstQ]);

  if (dataQ == null) return <div className="skel" style={{ height: 300 }} aria-label="Loading" />;
  const cy = qYear(dataQ);
  const ytdLabel = meta.data ? new Date(`${meta.data.fetched_to}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  const tot = totals.data ?? [];

  return (
    <div className="tags-tab">
      {themed && <Kpis theme={theme} cy={cy} tq={tq} />}
      {themed && <ShareChart theme={theme} series={series} totals={tot} dataQ={dataQ} firstQ={firstQ} tq={tq} ytdLabel={ytdLabel} />}
      <div className={themed ? 'tags-grid' : undefined}>
        <TagTable theme={theme} cy={cy} />
        {themed && <RelatedTags theme={theme} cy={cy} />}
      </div>
      {themed ? (
        <>
          <HitTimeline games={games} tq={tq} />
          <Copies theme={theme} tq={tq} dataQ={dataQ} firstQ={firstQ} wDefault={wText} sDefault={minSim} />
          <div className="tags-grid even">
            <TrendSetters games={games} tq={tq} hitReviews={hitReviews} />
            <ByYear theme={theme} series={series} totals={tot} games={games} dataQ={dataQ} firstQ={firstQ} />
          </div>
          <Distributions theme={theme} />
        </>
      ) : (
        <div className="panel empty">Add a tag (from the table above or the search bar) to see its share over time, hits, trend-setters and what its new games copy.</div>
      )}
      <Compare theme={theme} totals={tot} dataQ={dataQ} firstQ={firstQ} />
    </div>
  );
}
