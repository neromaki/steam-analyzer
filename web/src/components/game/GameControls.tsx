// The game page's settings: how similar a game must be, tags vs descriptions, what counts as a
// hit, and the wave windows. All in the URL, and carried along to other game pages.
import { useSearchParams } from 'react-router-dom';
import { fmtInt } from '../../lib/format';
import { useUpdateParams } from '../../lib/url';
import { GAME_KEYS, type GameSettings } from '../../state/game';
import { ParamSlider } from '../tags/common';

const HITS = [500, 1000, 2000, 5000, 10000, 20000];
const BEFORE: [number, string][] = [[4, '1 year'], [8, '2 years'], [12, '3 years']];
const AFTER: [number, string][] = [[8, '6 mo – 2 yrs'], [12, '6 mo – 3 yrs'], [16, '6 mo – 4 yrs']];

function Select({ k, label, value, options, dflt }: { k: string; label: string; value: number; options: [number, string][]; dflt: number }) {
  const update = useUpdateParams();
  return (
    <label className="gc-select">
      <span className="muted">{label}</span>
      <select className="input" value={value} onChange={e => update(n => (+e.target.value === dflt ? n.delete(k) : n.set(k, e.target.value)))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export default function GameControls({ s }: { s: GameSettings }) {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const changed = GAME_KEYS.some(k => sp.has(k));
  return (
    <div className="gc">
      <ParamSlider k="sim" label="Similarity ≥" value={s.minSim} min={0.3} max={0.9} step={0.01} fmt={v => v.toFixed(2)} />
      <ParamSlider k="wt" label="Descriptions vs tags" value={s.wText} min={0} max={1} step={0.05}
                   fmt={v => (v === 0 ? 'tags only' : `${Math.round(v * 100)}% text`)} />
      <Select k="hr" label="Hit = reviews ≥" value={s.hitReviews} dflt={s.defaults.hitReviews}
              options={[...new Set([...HITS, s.hitReviews])].sort((a, b) => a - b).map(v => [v, fmtInt(v)])} />
      <Select k="wb" label="Wave: before" value={s.wave.before} dflt={8} options={BEFORE} />
      <Select k="wa" label="after" value={s.wave.after[1]} dflt={12} options={AFTER} />
      {changed && <button className="btn small ghost" onClick={() => update(n => GAME_KEYS.forEach(k => n.delete(k)))}>Reset</button>}
    </div>
  );
}
