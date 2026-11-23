// Look-alikes: the similar games themselves, split into released after it, before it and coming
// soon. Sortable; click a similarity to see why two games match.
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fmtDate, fmtInt } from '../../lib/format';
import { inMonths, isReleased, type Nb } from '../../lib/lineage';
import type { Neighbors } from '../../state/game';
import { useScopedRange } from '../../state/range';
import { GameLink, QueryState, Section, Seg, TagNames, Th, useChoice } from '../tags/common';

type K = 'name' | 'date' | 'reviews' | 'pct' | 'sim';
type Which = 'after' | 'before' | 'soon';
const PAGE = 100;

export default function LookAlikes({ nb, self, dataDate, onPick }: {
  nb: UseQueryResult<Neighbors>; self: Nb; dataDate: string; onPick: (g: Nb) => void;
}) {
  const { range } = useScopedRange('look');
  const [which, setWhich] = useChoice<Which>('la', ['after', 'before', 'soon'] as const, 'after');
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: 'sim', dir: -1 });
  const [n, setN] = useState(PAGE);

  const groups = useMemo(() => {
    const rows = nb.data?.rows ?? [];
    const rel = rows.filter(g => isReleased(g, dataDate) && inMonths(g.date, range));
    return {
      after: rel.filter(g => !self.date || g.date! >= self.date),
      before: rel.filter(g => self.date && g.date! < self.date),
      soon: rows.filter(g => !isReleased(g, dataDate)),
    } as Record<Which, Nb[]>;
  }, [nb.data, range, dataDate, self.date]);

  const sorted = useMemo(() => {
    const val = (g: Nb): number | string => {
      switch (sort.k) {
        case 'name': return g.name.toLowerCase();
        case 'date': return g.date ?? '9999';
        case 'reviews': return g.reviews;
        case 'pct': return g.reviews >= 10 ? g.pct : -1;
        case 'sim': return g.sim;
      }
    };
    return [...groups[which]].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir || b.sim - a.sim;
    });
  }, [groups, which, sort]);

  const label = (w: Which, l: string) => `${l} (${fmtInt(groups[w].length)})`;
  return (
    <Section title="Look-alikes" rangeId="look"
      controls={<Seg label="Which look-alikes" value={which} onChange={v => { setWhich(v); setN(PAGE); }}
        options={[['after', label('after', 'After it')], ['before', label('before', 'Before it')], ['soon', label('soon', 'Coming soon')]]} />}
      sub={<>Games at least this similar to {self.name}, by similarity. Click a similarity score to see which tags and how much of the description they share.
        {which === 'soon' ? ' Coming-soon games ignore the date range.' : ''}</>}>
      <QueryState q={nb} height={300}>
        {sorted.length ? (
          <div className="tscroll look-scroll">
            <table className="dtable">
              <thead><tr>
                <Th k="name" label="Game" sort={sort} setSort={setSort} />
                <Th k="date" label="Released" sort={sort} setSort={setSort} />
                <Th k="reviews" label="Reviews" sort={sort} setSort={setSort} num />
                <Th k="pct" label="Positive" sort={sort} setSort={setSort} num />
                <Th k="sim" label="Similarity" sort={sort} setSort={setSort} num title="Blended score: tags and description" />
                <th className="num" title="Tag score / description score">Tags · text</th>
              </tr></thead>
              <tbody>{sorted.slice(0, n).map(g => (
                <tr key={g.appid}>
                  <td className="wrap"><GameLink appid={g.appid} name={g.name} /><div className="tset-sub"><span className="faint">{g.dev} · </span><TagNames ids={g.tags} max={4} /></div></td>
                  <td>{fmtDate(g.date, g.soon)}</td>
                  <td className="num">{fmtInt(g.reviews)}</td>
                  <td className="num">{g.reviews >= 10 ? `${g.pct}%` : <span className="faint">–</span>}</td>
                  <td className="num"><button className="linkish" onClick={() => onPick(g)} title="Why it’s similar">{g.sim.toFixed(2)}</button></td>
                  <td className="num faint">{g.ts.toFixed(2)} · {g.xs.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
            {sorted.length > n && <button className="btn small look-more" onClick={() => setN(x => x + PAGE * 3)}>Show more ({fmtInt(sorted.length - n)} left)</button>}
          </div>
        ) : <div className="empty">None{which !== 'soon' && (range.from || range.to) ? ' in this date range' : ''}.</div>}
        {nb.data?.truncated && <p className="faint">Only the {fmtInt(nb.data.rows.length)} most similar of {fmtInt(nb.data.n)} are listed; raise the similarity to narrow it down.</p>}
      </QueryState>
    </Section>
  );
}
