// Search › Games: a filter sidebar and the virtualised results table.
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import GameFiltersPanel from '../components/GameFilters';
import GameTable from '../components/GameTable';
import { RangeControl } from '../components/RangeControls';
import { FILTER_KEYS, activeFilterCount, applyFilters, filtersFromParams, toQuery, type GameFilters } from '../lib/gameFilters';
import { useUpdateParams } from '../lib/url';
import { useFloor } from '../state/floor';
import { useScopedRange } from '../state/range';

export default function GamesTab() {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const raw = sp.toString();
  const f = useMemo(() => filtersFromParams(new URLSearchParams(raw)), [raw]);
  const set = useCallback((patch: Partial<GameFilters>) => update(n => applyFilters(n, patch)), [update]);
  const reset = useCallback(() => update(n => FILTER_KEYS.forEach(k => n.delete(k))), [update]);
  const { range } = useScopedRange('games');
  const [floor] = useFloor();
  const query = useMemo(() => toQuery(f, range), [f, range]);
  const [showFilters, setShowFilters] = useState(false); // small screens only
  const n = activeFilterCount(f);

  return (
    <div className={`games-layout${showFilters ? ' filters-open' : ''}`}>
      <aside className="panel gf-panel" aria-label="Game filters">
        <GameFiltersPanel f={f} set={set} onReset={reset} />
      </aside>
      <GameTable query={query} floor={floor} f={f} set={set} head={
        <>
          <button className="btn small gf-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(s => !s)}>
            Filters{n > 0 ? ` (${n})` : ''}
          </button>
          {f.status !== 'upcoming' && <RangeControl id="games" />}
        </>
      } />
    </div>
  );
}
