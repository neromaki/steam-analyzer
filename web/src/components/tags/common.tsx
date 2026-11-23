// Shared building blocks for the Tags tab sections.
/* eslint-disable react-refresh/only-export-components -- small helpers live with the components */
import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDraft } from '../../hooks/useDraft';
import { useTags } from '../../lib/data';
import { idsParam, setIds, useUpdateParams } from '../../lib/url';
import { useGameLink } from '../../state/game';
import { RangeControl } from '../RangeControls';

export function Section({ title, sub, rangeId, controls, children, className, id }: {
  title: string; sub?: ReactNode; rangeId?: string; controls?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section className={`panel tsec${className ? ` ${className}` : ''}`} id={id}>
      <div className="panel-head">
        <h2>{title}</h2>
        {controls}
        <div className="spacer" />
        {rangeId && <RangeControl id={rangeId} />}
      </div>
      {sub && <p className="tsec-sub">{sub}</p>}
      <div className="tsec-body">{children}</div>
    </section>
  );
}

/** First load: a placeholder of the right height; later loads keep the old result (dimmed). */
export function QueryState({ q, height = 120, children }: { q: UseQueryResult<unknown>; height?: number; children: ReactNode }) {
  if (q.error) {
    return (
      <div className="empty">
        <p>Couldn’t load this: {(q.error as Error).message}</p>
        <button className="btn" onClick={() => void q.refetch()}>Try again</button>
      </div>
    );
  }
  if (!q.data) return <div className="skel" style={{ height }} aria-label="Loading" />;
  return <div className={q.isPlaceholderData ? 'stale' : undefined} aria-busy={q.isPlaceholderData}>{children}</div>;
}

/** A chart with a "Table" view of the same numbers (for screen readers, exact values and copying). */
export function ChartOrTable({ chart, table }: { chart: ReactNode; table: ReactNode }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div className="cot">
      <div className="seg cot-toggle" role="group" aria-label="View">
        <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
        <button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
      </div>
      {view === 'chart' ? chart : <div className="tscroll">{table}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** Add a tag to the search (AND), staying on the Tags tab. */
export function useAddTag() {
  const update = useUpdateParams();
  return useCallback((id: number) => update(n => setIds(n, 'tags', [...idsParam(n, 'tags'), id])), [update]);
}

/** A URL param with a fixed set of values (e.g. a chart's granularity). */
export function useChoice<T extends string>(key: string, values: readonly T[], fallback: T): [T, (v: T) => void] {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const raw = sp.get(key) as T | null;
  const v = raw && values.includes(raw) ? raw : fallback;
  return [v, (x: T) => update(n => (x === fallback ? n.delete(key) : n.set(key, x)))];
}

export function GameLink({ appid, name }: { appid: number; name: string }) {
  const link = useGameLink();
  return <Link to={link(appid)} title={name}>{name}</Link>;
}

export function TagNames({ ids, max = 4 }: { ids: number[]; max?: number }) {
  const { byId } = useTags();
  return <span className="faint">{ids.slice(0, max).map(id => byId.get(id)?.name).filter(Boolean).join(' · ')}</span>;
}

/** True once the element has scrolled near the viewport (then stays true). */
export function useInView<T extends HTMLElement>(margin = '300px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setSeen(true); }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

/** Sortable table header cell. */
export function Th<K extends string>({ k, label, sort, setSort, num, title }: {
  k: K; label: string; sort: { k: K; dir: 1 | -1 }; setSort: (s: { k: K; dir: 1 | -1 }) => void; num?: boolean; title?: string;
}) {
  const on = sort.k === k;
  return (
    <th className={num ? 'num' : undefined} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} title={title}>
      <button className={`gt-sort${on ? ' on' : ''}`} onClick={() => setSort({ k, dir: on ? (sort.dir === 1 ? -1 : 1) : (num ? -1 : 1) })}>
        {label}<span className="gt-arrow" aria-hidden="true">{on ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

/** A slider bound to a URL param; the URL (and so any query) updates once the value settles. */
export function ParamSlider({ k, label, value, min, max, step, fmt }: {
  k: string; label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string;
}) {
  const update = useUpdateParams();
  const [draft, edit, flush] = useDraft(value, v => update(n => n.set(k, String(v))), 350);
  return (
    <label className="cp-slider">
      <span className="muted">{label} <b className="gf-value">{fmt(draft)}</b></span>
      <input type="range" min={min} max={max} step={step} value={draft} className="gf-slider"
             onChange={e => edit(e.target.valueAsNumber)} onPointerUp={flush} onKeyUp={flush} />
    </label>
  );
}
