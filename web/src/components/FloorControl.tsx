// The quality-floor chip in the header: shows the preset (with a dot when customised) and opens
// a popover with every setting. Changes apply immediately to every list and analysis.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss';
import { PRESETS, PRESET_LABELS, describeFloor, presetOf, type Floor, type PresetName } from '../lib/floor';
import { useFloor } from '../state/floor';
import TagPicker from './TagPicker';

function NumberField({ label, hint, value, onChange, step = 1, min = 0, max, prefix, suffix }: {
  label: string; hint?: string; value: number; onChange: (n: number) => void;
  step?: number; min?: number; max?: number; prefix?: string; suffix?: string;
}) {
  // A local draft lets the field be emptied while typing; valid numbers apply immediately.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        {prefix && <span className="muted">{prefix}</span>}
        <input className="input num-input" type="number" step={step} min={min} max={max} value={draft}
               onChange={e => {
                 setDraft(e.target.value);
                 const n = e.target.valueAsNumber;
                 if (Number.isFinite(n)) onChange(Math.max(min, max != null ? Math.min(max, n) : n));
               }}
               onBlur={() => setDraft(String(value))} />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export default function FloorControl() {
  const [floor, setFloor] = useFloor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const preset = presetOf(floor);
  const set = <K extends keyof Floor>(k: K, v: Floor[K]) => setFloor({ ...floor, [k]: v });

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="btn floor-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}
              title={`Quality floor: ${describeFloor(floor)}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 5h18l-7 8v6l-4 2v-8z" />
        </svg>
        <span className="floor-chip-label">Floor:</span> {preset ? PRESET_LABELS[preset] : 'Custom'}
        {preset !== 'default' && <span className="ov-dot" aria-label="Changed from the default" />}
      </button>
      {open && (
        <div className="popover right floor-pop">
          <div className="floor-pop-head">
            <h3>Quality floor</h3>
            <span className="muted">Hides low-effort games from every list, share and analysis.</span>
          </div>
          <div className="seg" role="group" aria-label="Preset">
            {(Object.keys(PRESETS) as PresetName[]).map(p => (
              <button key={p} aria-pressed={preset === p} onClick={() => setFloor(PRESETS[p])}>{PRESET_LABELS[p]}</button>
            ))}
            <button aria-pressed={preset === null} disabled className="seg-custom">Custom</button>
          </div>
          <div className="floor-grid">
            <NumberField label="Min reviews" value={floor.minReviews} onChange={v => set('minReviews', v)} />
            <NumberField label="Grace period" suffix="days" value={floor.graceDays} onChange={v => set('graceDays', v)}
                         hint="Newer releases skip the review minimum" />
            <NumberField label="Min price" prefix="£" step={0.5} value={floor.minPrice} onChange={v => set('minPrice', v)}
                         hint="Free-to-play games are exempt" />
            <NumberField label="Min rating" suffix="% positive" max={100} value={floor.minRating} onChange={v => set('minRating', v)}
                         hint="Only applies with 10+ reviews" />
          </div>
          <div className="floor-checks">
            <label className="check">
              <input type="checkbox" checked={floor.excludeAdult} onChange={e => set('excludeAdult', e.target.checked)} />
              Hide adult games
            </label>
            <label className="check">
              <input type="checkbox" checked={floor.earlyAccess} onChange={e => set('earlyAccess', e.target.checked)} />
              Include Early Access
            </label>
          </div>
          <div className="field">
            <span className="field-label">Always hide games tagged</span>
            <TagPicker value={floor.excludeTags} onChange={ids => set('excludeTags', ids)} placeholder="Exclude a tag…" variant="exclude" />
          </div>
          <div className="floor-pop-foot">
            <span className="muted">{describeFloor(floor)}</span>
            {preset !== 'default' && (
              <button className="btn small" onClick={() => setFloor(PRESETS.default)}>Reset to default</button>
            )}
          </div>
          <p className="faint floor-note">Coming-soon games skip the review and price rules.</p>
        </div>
      )}
    </div>
  );
}
