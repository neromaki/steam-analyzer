// Every tag among the theme's games (or all games): counts, share of this year's releases,
// change and growth vs the same dates last year. Sorts and filters live in the URL;
// clicking a row adds the tag to the search.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Theme } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtInt, fmtPct } from '../../lib/format';
import { tagStats, type TagStat } from '../../lib/trends';
import { useUpdateParams } from '../../lib/url';
import { useDraft } from '../../hooks/useDraft';
import { useScopedRange } from '../../state/range';
import { hasTheme, useTagTable } from '../../state/theme';
import { QueryState, Section, Th, useAddTag } from './common';

type K = 'name' | 'total' | 'ytd' | 'shareYtd' | 'change' | 'growth' | 'inTheme';
const KEYS: K[] = ['name', 'total', 'ytd', 'shareYtd', 'change', 'growth', 'inTheme'];

const MINS = [['tt.min', 'Games ≥'], ['tt.ytd', 'This year ≥'], ['tt.share', 'Share ≥ %'], ['tt.growth', 'Growth ≥ ×']] as const;

function MinField({ k, label }: { k: string; label: string }) {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const [draft, edit, flush] = useDraft(sp.get(k) ?? '', v => update(n => (v.trim() && +v > 0 ? n.set(k, v.trim()) : n.delete(k))), 400);
  return (
    <label className="tt-min">
      <span className="muted">{label}</span>
      <input className="input num-input" type="number" min={0} step="any" value={draft} placeholder="any"
             onChange={e => edit(e.target.value)} onBlur={flush} onKeyDown={e => e.key === 'Enter' && flush()} />
    </label>
  );
}

export default function TagTable({ theme, cy }: { theme: Theme; cy: number }) {
  const { range } = useScopedRange('tagtable');
  const q = useTagTable(theme, range);
  const { byId } = useTags();
  const add = useAddTag();
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const themed = hasTheme(theme);

  const sortK = (KEYS as string[]).includes(sp.get('tt.sort') ?? '') ? (sp.get('tt.sort') as K) : 'growth';
  const sort = { k: sortK, dir: (sp.get('tt.dir') === 'asc' ? 1 : -1) as 1 | -1 };
  const setSort = (s: { k: K; dir: 1 | -1 }) => update(n => {
    if (s.k === 'growth' && s.dir === -1) { n.delete('tt.sort'); n.delete('tt.dir'); return; }
    n.set('tt.sort', s.k); n.set('tt.dir', s.dir === 1 ? 'asc' : 'desc');
  });
  // A few games can't make a trend: hide tags with under 10 releases this year unless asked.
  const mins = {
    total: +(sp.get('tt.min') ?? 0), ytd: sp.has('tt.ytd') ? +(sp.get('tt.ytd') ?? 0) : 10,
    share: +(sp.get('tt.share') ?? 0), growth: +(sp.get('tt.growth') ?? 0),
  };
  const text = (sp.get('tt.q') ?? '').toLowerCase();
  const [qDraft, editQ, flushQ] = useDraft(sp.get('tt.q') ?? '', v => update(n => (v.trim() ? n.set('tt.q', v.trim()) : n.delete('tt.q'))), 250);

  const all = useMemo(() => (q.data ? tagStats(q.data.rows, q.data.global, q.data.totals) : []), [q.data]);
  const chosen = useMemo(() => new Set(theme.inc ?? []), [theme.inc]);
  const rows = useMemo(() => {
    const name = (s: TagStat) => byId.get(s.id)?.name ?? String(s.id);
    const r = all.filter(s => !chosen.has(s.id) && s.total >= mins.total && s.ytd >= mins.ytd && s.shareYtd >= mins.share
      && s.growth >= mins.growth && (!text || name(s).toLowerCase().includes(text)));
    const val = (s: TagStat) => (sort.k === 'name' ? name(s) : s[sort.k]);
    return r.sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [all, chosen, byId, mins.total, mins.ytd, mins.share, mins.growth, text, sort.k, sort.dir]);

  return (
    <Section title={themed ? 'Tags in this search' : 'All tags'} rangeId="tagtable" className="tt"
      sub={<>Share = % of all {cy} releases so far (with the quality floor), compared with the same dates in {cy - 1}.
        Growth smooths last year’s count by +1, so brand-new tags don’t divide by zero. “Games” counts releases in the table’s date range.
        {themed ? ' Click a tag to narrow the search to it.' : ' Click a tag to explore it.'}</>}>
      <div className="tt-filters">
        <input className="input" type="search" placeholder="Filter tags…" value={qDraft} aria-label="Filter tags by name"
               onChange={e => editQ(e.target.value)} onBlur={flushQ} />
        {MINS.map(([k, l]) => <MinField key={k} k={k} label={l} />)}
        <span className="muted tt-count">{q.data ? `${fmtInt(rows.length)} of ${fmtInt(all.length)} tags` : ''}</span>
      </div>
      <QueryState q={q} height={420}>
        <div className="tscroll tt-scroll">
          <table className="dtable">
            <thead>
              <tr>
                <Th k="name" label="Tag" sort={sort} setSort={setSort} />
                <Th k="total" label="Games" sort={sort} setSort={setSort} num title="Released in the date range" />
                <Th k="ytd" label={`${cy} so far`} sort={sort} setSort={setSort} num title={`Released this year so far (and the same dates in ${cy - 1})`} />
                <Th k="shareYtd" label="Share" sort={sort} setSort={setSort} num title={`% of all ${cy} releases so far`} />
                <Th k="change" label="Change" sort={sort} setSort={setSort} num title="Percentage points vs the same dates last year" />
                <Th k="growth" label="Growth" sort={sort} setSort={setSort} num title="Share now ÷ share then" />
                {themed && <Th k="inTheme" label="Of search" sort={sort} setSort={setSort} num title="% of this search’s released games with the tag" />}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 400).map(s => (
                <tr key={s.id} className="click" onClick={() => add(s.id)} tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && add(s.id)} title={`Add “${byId.get(s.id)?.name}” to the search`}>
                  <td>{byId.get(s.id)?.name ?? s.id}</td>
                  <td className="num">{fmtInt(s.total)}</td>
                  <td className="num">{fmtInt(s.ytd)} <span className="faint">({fmtInt(s.prev)})</span></td>
                  <td className="num">{fmtPct(s.shareYtd, 2)}</td>
                  <td className={`num ${s.change >= 0 ? 'up' : 'down'}`}>{s.change >= 0 ? '+' : ''}{s.change.toFixed(2)} pp</td>
                  <td className="num">×{s.growth.toFixed(2)}</td>
                  {themed && <td className="num">{fmtPct(s.inTheme, 1)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 400 && <p className="faint tt-more">Showing the first 400; filter or sort to see others.</p>}
          {!rows.length && <div className="empty">No tags match these filters.</div>}
        </div>
      </QueryState>
    </Section>
  );
}
