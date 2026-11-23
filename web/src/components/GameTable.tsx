// Virtualised Games results: only the rows on screen are rendered, and only their 100-row
// pages are fetched, so scrolling anywhere in 130k games stays quick. Rows not loaded yet
// show as placeholders.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameQuery, GameRow } from '../lib/api';
import { useTags } from '../lib/data';
import type { Floor } from '../lib/floor';
import { fmtDate, fmtInt, fmtPrice, ratingTone } from '../lib/format';
import { defaultDir, type GameFilters, type GameSort } from '../lib/gameFilters';
import { useLink } from '../lib/url';
import { PAGE, useGameResults } from '../state/games';

const ROW = 46;

interface Props {
  query: GameQuery;
  floor: Floor;
  f: GameFilters;
  set: (patch: Partial<GameFilters>) => void;
  head: React.ReactNode; // panel header controls (count, range, filters toggle)
}

function SortHead({ id, label, f, set, className }: { id: GameSort; label: string; f: GameFilters; set: Props['set']; className?: string }) {
  const on = f.sort === id;
  const next = on ? (f.dir === 'asc' ? 'desc' : 'asc') : defaultDir(id);
  return (
    <div role="columnheader" className={className} aria-sort={on ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`gt-sort${on ? ' on' : ''}`} onClick={() => set({ sort: id, dir: next })}
              title={`Sort by ${label.toLowerCase()}`}>
        {label}<span className="gt-arrow" aria-hidden="true">{on ? (f.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </div>
  );
}

function Row({ g, f, set }: { g: GameRow; f: GameFilters; set: Props['set'] }) {
  const link = useLink();
  const { byId } = useTags();
  const [appid, name, released, soon, ea, free, price, reviews, pct, rating, dev, img, tags] = g;
  const tone = ratingTone(pct, reviews);
  const chosen = new Set(f.tags);
  return (
    <>
      <div role="cell" className="gt-img">
        {img ? <img src={img} alt="" loading="lazy" width={80} height={37} /> : <span className="gt-noimg" />}
      </div>
      <div role="cell" className="gt-name">
        <Link to={link(`/game/${appid}`)} className="gt-title" title={name}>{name}</Link>
        <span className="gt-sub">
          {ea && <span className="badge">Early Access</span>}
          {dev && <span className="faint">{dev}</span>}
        </span>
      </div>
      <div role="cell" className="gt-tags">
        {tags.slice(0, 4).map(id => {
          const t = byId.get(id);
          if (!t) return null;
          return chosen.has(id)
            ? <span key={id} className="gt-tag on">{t.name}</span>
            : <button key={id} className="gt-tag" onClick={() => set({ tags: [...f.tags, id] })}
                      title={`Add “${t.name}” to the search`}>{t.name}</button>;
        })}
      </div>
      <div role="cell" className={`num${soon ? ' faint' : ''}`}>{soon && !released ? 'Coming soon' : fmtDate(released, soon)}</div>
      <div role="cell" className="num">{fmtPrice(price, free)}</div>
      <div role="cell" className="num">{fmtInt(reviews)}</div>
      <div role="cell" className={`num tone-${tone}`} title={reviews ? `${pct}% positive of ${fmtInt(reviews)} reviews` : 'No reviews yet'}>
        {rating == null || tone === 'none' ? '–' : `${rating.toFixed(1)}%`}
      </div>
    </>
  );
}

export default function GameTable({ query, floor, f, set, head }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(query) + JSON.stringify(floor);

  // A new search or sort starts at the top.
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [key]);

  // The virtualizer needs the row count, which needs the visible pages: the pages come from
  // the previous render's visible rows (one extra render whenever they change).
  const [shownPages, setShownPages] = useState<number[]>([0]);
  const res = useGameResults(query, floor, shownPages);
  const v = useVirtualizer({
    count: res.total,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 12,
  });
  const items = v.getVirtualItems();
  const pages = useMemo(() => {
    const s = new Set<number>(items.length ? [] : [0]);
    for (const it of items) s.add(Math.floor(it.index / PAGE));
    return [...s].sort((a, b) => a - b);
  }, [items]);
  const pagesKey = pages.join(',');
  useEffect(() => {
    setShownPages(prev => (prev.join(',') === pagesKey ? prev : pages));
  }, [pagesKey]); // eslint-disable-line react-hooks/exhaustive-deps -- pages is derived from pagesKey

  return (
    <section className="panel gt-panel">
      <div className="panel-head">
        <h2>Games</h2>
        <span className="muted gt-count" aria-live="polite">
          {res.error ? '' : res.loading ? 'Loading…' : `${fmtInt(res.total)}${res.counting ? '…' : ''} ${res.total === 1 ? 'game' : 'games'}`}
        </span>
        <div className="spacer" />
        {head}
      </div>
      {res.error ? (
        <div className="empty">
          <p>Couldn’t load games: {res.error.message}</p>
          <button className="btn" onClick={res.retry}>Try again</button>
        </div>
      ) : !res.loading && res.total === 0 ? (
        <div className="empty">No games match these filters. Try removing a tag, widening the date range or lowering the quality floor.</div>
      ) : (
        <div className={`gt${res.stale ? ' stale' : ''}`} role="table" aria-label="Games" aria-rowcount={res.total} aria-busy={res.stale || res.loading}>
          <div className="gt-scroll" ref={scroller}>
            <div className="gt-row gt-head" role="row">
              <div role="columnheader" className="gt-img" aria-label="Image" />
              <SortHead id="name" label="Name" f={f} set={set} />
              <div role="columnheader" className="gt-tags">Top tags</div>
              <SortHead id="released" label="Released" f={f} set={set} className="num" />
              <div role="columnheader" className="num">Price</div>
              <SortHead id="reviews" label="Reviews" f={f} set={set} className="num" />
              <SortHead id="rating" label="Rating" f={f} set={set} className="num" />
            </div>
            <div className="gt-body" style={{ height: v.getTotalSize() }}>
              {items.map(it => {
                const g = res.rowAt(it.index);
                return (
                  <div key={it.key} role="row" aria-rowindex={it.index + 2} className="gt-row"
                       style={{ transform: `translateY(${it.start}px)`, height: ROW }}>
                    {g ? <Row g={g} f={f} set={set} /> : <div className="gt-skel" aria-label="Loading" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
