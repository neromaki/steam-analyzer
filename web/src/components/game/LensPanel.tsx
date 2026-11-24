// The lens: refine "similar games" with example games that share what you're tracing and
// counter-examples that don't. Shows each example's score against the lens and the tag weights
// it worked out; click a tag to make it count double, then not at all.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { configured, fetchGameNames } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtInt } from '../../lib/format';
import { addExample, isActive, nextFactor, removeExample, type Lens } from '../../lib/lens';
import type { Neighbors } from '../../state/game';
import GamePicker from '../GamePicker';
import { GameLink, Section } from '../tags/common';

export default function LensPanel({ anchor, name, lens, setLens, nb }: {
  anchor: number; name: string; lens: Lens; setLens: (l: Lens) => void; nb: UseQueryResult<Neighbors>;
}) {
  const { byId } = useTags();
  const on = isActive(lens);
  const ids = useMemo(() => [...lens.like, ...lens.not].sort((a, b) => a - b), [lens]);
  const names = useQuery({ queryKey: ['names', ids.join(',')], queryFn: () => fetchGameNames(ids), enabled: configured && ids.length > 0, staleTime: 3600e3 });
  const info = nb.data?.lens;
  const exclude = useMemo(() => new Set([anchor, ...ids]), [anchor, ids]);
  const nEx = 1 + lens.like.length;

  const score = (id: number) => {
    const e = info?.examples.get(id);
    return e ? <span className="faint" title={`Score against the lens (tags ${e.ts.toFixed(2)}, text ${e.xs.toFixed(2)})`}>{e.sim.toFixed(2)}</span> : null;
  };
  const chip = (id: number, side: 'like' | 'not') => (
    <span key={id} className={`chip${side === 'not' ? ' exclude-chip' : ''}`}>
      {names.data?.get(id) ? <GameLink appid={id} name={names.data.get(id)!.name} /> : <span className="faint">#{id}</span>} {score(id)}
      <button className="x" onClick={() => setLens(removeExample(lens, id))} aria-label={`Remove ${names.data?.get(id)?.name ?? id}`}>×</button>
    </span>
  );

  const [allTags, setAllTags] = useState(false);
  const tags = info?.tags ?? [];
  const top = Math.max(1e-9, ...tags.map(t => t[1]));
  // The lens's main tags, the ones you've changed, and strong ones the counter-examples pushed down.
  const topRaw = Math.max(1e-9, ...tags.map(t => t[2]));
  const main = tags.filter(([id, q, raw]) => lens.tw.has(id) || q / top >= 0.1 || (q <= 0 && raw / topRaw >= 0.15))
    .sort((a, b) => b[1] - a[1] || b[2] - a[2]);
  const shown = allTags ? [...tags].sort((a, b) => b[1] - a[1] || b[2] - a[2]) : main;
  return (
    <Section title="Lens" className="lens-panel"
      controls={on && <button className="btn small ghost" onClick={() => setLens({ like: [], not: [], tw: new Map() })}>Clear lens</button>}
      sub={on
        ? <>Similar games now means similar to all the examples together: tags most of them share count most, and the counter-examples’ tags
          count less. Scores show how well each example fits. {lens.like.length > 0 && info && `Similarity cut-off ${info.minSim.toFixed(2)}`}
          {lens.like.length > 0 && info && ' (set to take in every example unless you move the slider).'}</>
        : <>Similar games come from {name}’s tags and description, so they lean towards its genre. To trace something narrower, add
          games that share it and games that don’t (or use + and − in Look-alikes). The lens can only see Steam tags and store
          descriptions, not art style or feel, but examples steer which of those count.</>}>
      <div className="lens-rows">
        <div className="lens-row">
          <span className="muted lens-label">More like</span>
          <span className="chip lens-anchor"><b>{name}</b> {on && score(anchor)}</span>
          {lens.like.map(id => chip(id, 'like'))}
          <GamePicker placeholder="Add a game…" exclude={exclude} onPick={id => setLens(addExample(lens, id, 'like', anchor))} />
        </div>
        <div className="lens-row">
          <span className="muted lens-label">Less like</span>
          {lens.not.map(id => chip(id, 'not'))}
          <GamePicker placeholder="Add a counter-example…" exclude={exclude} onPick={id => setLens(addExample(lens, id, 'not', anchor))} />
        </div>
        {on && (
          <div className="lens-row">
            <span className="muted lens-label">Tag weights</span>
            {!info ? <span className="faint">{nb.isFetching ? 'Working out the lens…' : ''}</span> : <>{shown.map(([id, q, , k]) => {
              const fct = lens.tw.get(id);
              const state = fct === 0 ? 'ignored' : fct === 2 ? 'counts double' : q <= 0 ? 'pushed down by the counter-examples' : null;
              return (
                <button key={id} className={`chip wchip lens-tag${q <= 0 ? ' off' : ''}${fct != null ? ' set' : ''}`}
                        onClick={() => { const tw = new Map(lens.tw); const n = nextFactor(fct); if (n === 1) tw.delete(id); else tw.set(id, n); setLens({ ...lens, tw }); }}
                        title={`${byId.get(id)?.name ?? id}: weight ${Math.round((q / top) * 100)} of 100, in ${k} of ${nEx} examples${state ? `; ${state}` : ''}. Click to make it count double, then not at all, then as is.`}>
                  {byId.get(id)?.name ?? id}{fct === 2 ? ' ×2' : fct === 0 ? ' (off)' : ''}
                  <i className="wbar" style={{ width: `${Math.max(q > 0 ? 6 : 0, (q / top) * 100)}%` }} aria-hidden="true" />
                </button>
              );
            })}
            {tags.length > main.length && <button className="btn small ghost" onClick={() => setAllTags(x => !x)}>
              {allTags ? 'Main tags only' : `+${tags.length - main.length} weaker`}</button>}</>}
          </div>
        )}
      </div>
      {on && nb.data && <p className="faint">{fmtInt(nb.data.n)} games match the lens.</p>}
    </Section>
  );
}
