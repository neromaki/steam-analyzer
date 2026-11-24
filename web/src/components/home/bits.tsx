// Small pieces shared by the home page sections.
import { Link } from 'react-router-dom';
import { useTags } from '../../lib/data';
import { fmtPct } from '../../lib/format';
import { useLink } from '../../lib/url';

/** A tiny line of values (share of releases over time). `mark`: index to tick, e.g. the release. */
export function Spark({ values, mark, label, w = 96, h = 22 }: { values: number[]; mark?: number; label: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) || 1;
  const x = (i: number) => (i / (values.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
         aria-label={`${label}: ${fmtPct(values[0], 2)} to ${fmtPct(values[values.length - 1], 2)}, peak ${fmtPct(max, 2)}`}>
      {mark != null && mark >= 0 && mark < values.length && <line className="spark-mark" x1={x(mark)} x2={x(mark)} y1={0} y2={h} />}
      <polyline points={pts} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A tag name that opens the Tags tab for it. */
export function TagLink({ id }: { id: number }) {
  const { byId } = useTags();
  const link = useLink();
  return <Link to={link('/search', { tab: 'tags', tags: String(id) })}>{byId.get(id)?.name ?? id}</Link>;
}
