// Tags that go with the search: most distinctive (far more common here than among all games)
// or rising within it (gaining share this year vs the same dates last year). Click to add.
import { useMemo } from 'react';
import type { Theme } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtInt, fmtPct } from '../../lib/format';
import { relatedTags } from '../../lib/trends';
import { useMeta } from '../../lib/data';
import { useScopedRange } from '../../state/range';
import { useTagTable } from '../../state/theme';
import { QueryState, Section, Seg, useAddTag, useChoice } from './common';

export default function RelatedTags({ theme, cy }: { theme: Theme; cy: number }) {
  // Same call as the tag table (the counts used here don't depend on its date range).
  const { range } = useScopedRange('tagtable');
  const q = useTagTable(theme, range);
  const [mode, setMode] = useChoice('rel', ['distinctive', 'rising'] as const, 'distinctive');
  const { tags, byId } = useTags();
  const meta = useMeta();
  const add = useAddTag();
  const rows = useMemo(() => (q.data && tags.length && meta.data
    ? relatedTags(q.data.rows, q.data.totals, new Map(tags.map(t => [t.id, t.n_games])), meta.data.n_games, mode, new Set(theme.inc ?? []))
    : []), [q.data, tags, meta.data, mode, theme.inc]);

  return (
    <Section title="Related tags"
      controls={<Seg label="Ranking" value={mode} onChange={setMode} options={[['distinctive', 'Most distinctive'], ['rising', 'Rising within search']]} />}
      sub={mode === 'distinctive' ? 'Tags far more common in this search than among all games (×1.3 or more). Click one to add it.'
        : `Tags gaining share within this search in ${cy} so far vs the same dates in ${cy - 1}. Click one to add it.`}>
      <QueryState q={q} height={300}>
        <div className="tscroll rel-scroll">
          <table className="dtable">
            <thead><tr><th>Tag</th><th className="num">Games</th><th className="num">Of search</th><th className="num">vs all games</th>
              <th className="num">{cy} so far</th><th className="num">{cy - 1}</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="click" tabIndex={0} onClick={() => add(r.id)} onKeyDown={e => e.key === 'Enter' && add(r.id)}>
                <td>{byId.get(r.id)?.name ?? r.id}</td><td className="num">{fmtInt(r.n)}</td>
                <td className="num">{fmtPct(r.inTheme, 1)}</td><td className="num">×{r.lift.toFixed(1)}</td>
                <td className="num">{fmtPct(r.recent, 1)}</td><td className="num">{fmtPct(r.before, 1)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!rows.length && <div className="empty">No related tags stand out.</div>}
        </div>
      </QueryState>
    </Section>
  );
}
