// Date-range UI: a picker, the page-wide bar and the per-chart/table control.
import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss';
import { rangeLabel, type Range } from '../lib/range';
import { useGlobalRange, useScopedRange } from '../state/range';

const pad = (n: number) => String(n).padStart(2, '0');
function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

const QUICK: { label: string; range: () => Range }[] = [
  { label: 'All', range: () => ({ from: null, to: null }) },
  { label: '10y', range: () => ({ from: monthsAgo(119), to: null }) },
  { label: '5y', range: () => ({ from: monthsAgo(59), to: null }) },
  { label: '3y', range: () => ({ from: monthsAgo(35), to: null }) },
  { label: '1y', range: () => ({ from: monthsAgo(11), to: null }) },
  { label: 'This year', range: () => ({ from: `${new Date().getUTCFullYear()}-01`, to: null }) },
];

const same = (a: Range, b: Range) => a.from === b.from && a.to === b.to;

/** From/to month inputs plus quick presets. Empty = open-ended. */
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="range-picker">
      <div className="range-inputs">
        <label>
          <span className="muted">From</span>
          <input className="input" type="month" min="1997-01" value={value.from ?? ''}
                 onChange={e => onChange({ ...value, from: e.target.value || null })} />
        </label>
        <label>
          <span className="muted">To</span>
          <input className="input" type="month" min="1997-01" value={value.to ?? ''}
                 onChange={e => onChange({ ...value, to: e.target.value || null })} />
        </label>
      </div>
      <div className="range-quick">
        {QUICK.map(q => {
          const r = q.range();
          return (
            <button key={q.label} className="btn small" aria-pressed={same(r, value)} onClick={() => onChange(r)}>
              {q.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Page-wide range, with "Clear all overrides" whenever any chart/table overrides it. */
export function GlobalRangeBar() {
  const g = useGlobalRange();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="global-range">
      <span className="muted">Date range</span>
      <div className="pop-wrap" ref={ref}>
        <button className="btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <CalendarIcon /> {rangeLabel(g.range)}
        </button>
        {open && (
          <div className="popover left">
            <RangePicker value={g.range} onChange={g.set} />
          </div>
        )}
      </div>
      {g.hasOverrides && (
        <button className="btn small" onClick={g.clearAll}
                title={`${g.overrideCount} chart/table${g.overrideCount > 1 ? 's' : ''} use their own range`}>
          <span className="ov-dot" aria-hidden="true" /> Clear all overrides ({g.overrideCount})
        </button>
      )}
    </div>
  );
}

/** Range control for one chart/table header. Overriding shows a blue mark and two actions. */
export function RangeControl({ id }: { id: string }) {
  const s = useScopedRange(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className={`range-control${s.overridden ? ' overridden' : ''}`}>
      <div className="pop-wrap" ref={ref}>
        <button className="btn small ghost range-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}
                title={s.overridden ? 'This view uses its own date range' : 'Uses the page date range — click to override it here'}>
          {s.overridden ? <span className="ov-dot" aria-label="Overridden" /> : <CalendarIcon />}
          {rangeLabel(s.range)}
        </button>
        {open && (
          <div className="popover right">
            <div className="popover-title">Date range for this view only</div>
            <RangePicker value={s.range} onChange={s.setLocal} />
          </div>
        )}
      </div>
      {s.overridden && (
        <>
          <button className="btn small" onClick={s.clear} title="Go back to the page date range">Clear override</button>
          <button className="btn small" onClick={s.setGlobally} title="Use this range for the whole page">Set globally</button>
        </>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
