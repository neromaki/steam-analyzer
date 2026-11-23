// Search results: Games and Tags tabs. The header (query, tags, date range) stays put while the
// results below scroll on their own.
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { GlobalRangeBar } from '../components/RangeControls';
import { useTags } from '../lib/data';
import { idsParam, setIds, useUpdateParams } from '../lib/url';
import { RangeScope } from '../state/range';
import GamesTab from './GamesTab';

// The Tags tab carries the chart library, so it loads on first use.
const TagsTab = lazy(() => import('./TagsTab'));

type Tab = 'games' | 'tags';

export default function Search() {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const { byId } = useTags();
  const tab: Tab = sp.get('tab') === 'tags' ? 'tags' : 'games';
  const q = sp.get('q') ?? '';
  const tags = idsParam(sp, 'tags');

  const setTab = (t: Tab) => update(n => n.set('tab', t), { push: true });
  const removeTag = (id: number) => update(n => setIds(n, 'tags', tags.filter(t => t !== id)));
  const clearQ = () => update(n => n.delete('q'));

  return (
    <RangeScope>
      <div className="results">
        <div className="results-head">
          <div className="results-query">
            {q && (
              <span className="chip">
                “{q}”
                <button className="x" onClick={clearQ} aria-label="Clear the text search">×</button>
              </span>
            )}
            {tags.map(id => (
              <span key={id} className="chip">
                {byId.get(id)?.name ?? id}
                <button className="x" onClick={() => removeTag(id)} aria-label={`Remove ${byId.get(id)?.name ?? id}`}>×</button>
              </span>
            ))}
            {!q && !tags.length && <span className="muted">All games — search above to narrow it down</span>}
          </div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'games'} onClick={() => setTab('games')}>Games</button>
            <button role="tab" aria-selected={tab === 'tags'} onClick={() => setTab('tags')}>Tags</button>
          </div>
          <GlobalRangeBar />
        </div>
        <div className={`results-body${tab === 'games' ? ' fill' : ''}`}>
          {tab === 'games' ? (
            <GamesTab />
          ) : (
            <Suspense fallback={<div className="skel" style={{ height: 300 }} aria-label="Loading" />}>
              <TagsTab />
            </Suspense>
          )}
        </div>
      </div>
    </RangeScope>
  );
}
