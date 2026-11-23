// The Games tab's filter sidebar. Every control writes to the URL; text and number fields
// commit after a short pause so typing doesn't fire a search per keystroke.
import { useDraft } from '../hooks/useDraft';
import { activeFilterCount, type GameFilters, type Status } from '../lib/gameFilters';
import { useFloor } from '../state/floor';
import TagPicker from './TagPicker';

type Set = (patch: Partial<GameFilters>) => void;

function OptNumber({ value, onChange, placeholder, step = 1, label }: {
  value: number | null; onChange: (n: number | null) => void; placeholder: string; step?: number; label: string;
}) {
  const [draft, edit, flush] = useDraft(value == null ? '' : String(value), s => {
    const n = s.trim() === '' ? null : Number(s);
    onChange(n != null && Number.isFinite(n) && n > 0 ? n : null);
  }, 500);
  return (
    <input className="input num-input" type="number" min={0} step={step} placeholder={placeholder} aria-label={label}
           value={draft} onChange={e => edit(e.target.value)} onBlur={flush}
           onKeyDown={e => e.key === 'Enter' && flush()} />
  );
}

function Range2({ label, unit, min, max, onMin, onMax, step }: {
  label: string; unit?: string; min: number | null; max: number | null;
  onMin: (n: number | null) => void; onMax: (n: number | null) => void; step?: number;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        {unit && <span className="muted">{unit}</span>}
        <OptNumber value={min} onChange={onMin} placeholder="min" step={step} label={`${label} minimum`} />
        <span className="faint">–</span>
        <OptNumber value={max} onChange={onMax} placeholder="max" step={step} label={`${label} maximum`} />
      </span>
    </div>
  );
}

function RatingSlider({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [draft, edit, flush] = useDraft(value ?? 0, n => onChange(n > 0 ? n : null), 300);
  return (
    <label className="field">
      <span className="field-label">
        Min rating <span className="gf-value">{draft > 0 ? `${draft}%+` : 'Any'}</span>
      </span>
      <input type="range" className="gf-slider" min={0} max={95} step={5} value={draft}
             onChange={e => edit(e.target.valueAsNumber)} onPointerUp={flush} onKeyUp={flush} />
      <span className="field-hint">SteamDB-style rating: few reviews pull it toward 50%</span>
    </label>
  );
}

function NameSearch({ f, set }: { f: GameFilters; set: Set }) {
  const [draft, edit, flush] = useDraft(f.q, q => set({ q }), 400);
  return (
    <div className="field">
      <span className="field-label">Name contains</span>
      <input className="input" type="search" value={draft} placeholder="Any name"
             onChange={e => edit(e.target.value)} onBlur={flush} onKeyDown={e => e.key === 'Enter' && flush()} />
      <label className="check">
        <input type="checkbox" checked={f.desc} onChange={e => set({ desc: e.target.checked })} />
        Search descriptions too
      </label>
    </div>
  );
}

export default function GameFiltersPanel({ f, set, onReset }: { f: GameFilters; set: Set; onReset: () => void }) {
  const [floor, setFloor] = useFloor();
  const n = activeFilterCount(f);
  const statuses: [Status, string][] = [['all', 'All'], ['released', 'Released'], ['upcoming', 'Upcoming only']];

  return (
    <div className="gf">
      <div className="gf-head">
        <h3>Filters</h3>
        {n > 0 && <button className="btn small ghost" onClick={onReset}>Reset ({n})</button>}
      </div>

      <div className="field">
        <span className="field-label">Tags</span>
        <TagPicker value={f.tags} onChange={tags => set({ tags })} placeholder="Add a tag…" />
        {f.tags.length > 1 && (
          <div className="seg" role="group" aria-label="Tag matching">
            <button aria-pressed={!f.any} onClick={() => set({ any: false })}>Match all</button>
            <button aria-pressed={f.any} onClick={() => set({ any: true })}>Match any</button>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">Exclude tags</span>
        <TagPicker value={f.xtags} onChange={xtags => set({ xtags })} placeholder="Exclude a tag…" variant="exclude" />
      </div>

      <NameSearch f={f} set={set} />

      <div className="field">
        <span className="field-label">Release</span>
        <div className="seg" role="group" aria-label="Release status">
          {statuses.map(([s, label]) => (
            <button key={s} aria-pressed={f.status === s} onClick={() => set(
              // Upcoming games have no reviews or rating yet: list them soonest first instead.
              s === 'upcoming' && (f.sort === 'reviews' || f.sort === 'rating')
                ? { status: s, sort: 'released', dir: 'asc' } : { status: s })}>{label}</button>
          ))}
        </div>
        <span className="field-hint">
          {f.status === 'upcoming' ? 'Ignores the date range: most coming-soon games have no firm date.'
            : 'Release dates follow the table’s date range.'}
        </span>
      </div>

      <RatingSlider value={f.minRating} onChange={minRating => set({ minRating })} />
      <Range2 label="Price" unit="£" step={0.5} min={f.priceMin} max={f.priceMax}
              onMin={priceMin => set({ priceMin })} onMax={priceMax => set({ priceMax })} />
      <Range2 label="Reviews" min={f.revMin} max={f.revMax}
              onMin={revMin => set({ revMin })} onMax={revMax => set({ revMax })} />

      <div className="field">
        <span className="field-label">Quality floor</span>
        <label className="check">
          <input type="checkbox" checked={floor.earlyAccess} onChange={e => setFloor({ ...floor, earlyAccess: e.target.checked })} />
          Include Early Access
        </label>
        <label className="check">
          <input type="checkbox" checked={floor.excludeAdult} onChange={e => setFloor({ ...floor, excludeAdult: e.target.checked })} />
          Hide adult games
        </label>
        <span className="field-hint">These change the global floor, so every page follows them.</span>
      </div>
    </div>
  );
}
