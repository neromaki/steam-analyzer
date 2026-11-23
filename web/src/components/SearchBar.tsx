// Universal search with look-ahead across tags (matched in the browser) and games (database).
// ↑/↓ move, Enter opens the highlighted item or the results page, Esc closes, "/" focuses.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounced } from '../hooks/useDebounced';
import { useDismiss } from '../hooks/useDismiss';
import { configured, suggest, type Suggestion, type Tag } from '../lib/api';
import { matchTags, useTags } from '../lib/data';
import { fmtCompact, yearOf } from '../lib/format';
import { idsParam, linkWith, setIds } from '../lib/url';

type Item = { kind: 'tag'; tag: Tag } | { kind: 'game'; game: Suggestion } | { kind: 'all' };

export default function SearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();
  const onSearch = location.pathname === '/search';
  const [text, setText] = useState(() => (onSearch ? sp.get('q') ?? '' : ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close);

  // Keep the box in step with the results page's query (back/forward, links).
  const urlQ = onSearch ? sp.get('q') ?? '' : null;
  useEffect(() => {
    if (urlQ != null) setText(urlQ);
  }, [urlQ]);

  // "/" focuses the search box from anywhere (except while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { tags } = useTags();
  const q = text.trim();
  const dq = useDebounced(q, 150);
  const selectedTags = useMemo(() => new Set(onSearch ? idsParam(sp, 'tags') : []), [onSearch, sp]);
  const tagHits = useMemo(() => matchTags(tags, q, 5, selectedTags), [tags, q, selectedTags]);
  const games = useQuery({
    queryKey: ['suggest', dq],
    queryFn: () => suggest(dq),
    enabled: configured && dq.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60 * 60 * 1000,
  });
  const gameHits = useMemo(() => (q && games.data ? games.data : []), [q, games.data]);

  const items: Item[] = useMemo(
    () => (q ? [...tagHits.map(tag => ({ kind: 'tag', tag }) as Item), ...gameHits.map(game => ({ kind: 'game', game }) as Item), { kind: 'all' }] : []),
    [q, tagHits, gameHits],
  );

  useEffect(() => setActive(-1), [q]);

  // Params to start from: the current results page's, or just the global ones (the floor).
  const startParams = () => new URLSearchParams(onSearch ? sp : linkWith('', sp).replace(/^\?/, ''));

  const go = (to: string) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(to);
  };

  const choose = (it: Item) => {
    if (it.kind === 'game') {
      setText('');
      go(linkWith(`/game/${it.game[0]}`, sp));
    } else if (it.kind === 'tag') {
      setText('');
      // On the results page tags stack up (AND); elsewhere a tag starts a new search.
      const next = startParams();
      setIds(next, 'tags', [...(onSearch ? idsParam(sp, 'tags') : []), it.tag.id]);
      next.set('tab', 'tags');
      next.delete('q');
      go(`/search?${next.toString()}`);
    } else {
      const next = startParams();
      if (q) next.set('q', q);
      else next.delete('q');
      if (!next.get('tab')) next.set('tab', 'games');
      go(`/search?${next.toString()}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive(a => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive(a => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active >= 0 && items[active] ? items[active] : { kind: 'all' });
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && q.length > 0;
  const optId = (i: number) => `search-opt-${i}`;
  let idx = -1;
  const row = (it: Item, body: React.ReactNode, key: string) => {
    idx += 1;
    const i = idx;
    return (
      <li key={key} id={optId(i)} role="option" aria-selected={i === active}
          className={`sugg${i === active ? ' active' : ''}`}
          onPointerEnter={() => setActive(i)}
          onPointerDown={e => e.preventDefault() /* keep focus in the input */}
          onClick={() => choose(it)}>
        {body}
      </li>
    );
  };

  return (
    <div className="search pop-wrap" ref={boxRef}>
      <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        className="input search-input"
        type="search"
        placeholder="Search games and tags…"
        value={text}
        onChange={e => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-list"
        aria-activedescendant={active >= 0 ? optId(active) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
      />
      <kbd className="search-kbd" aria-hidden="true">/</kbd>
      {showList && (
        <ul className="popover search-list" id="search-list" role="listbox">
          {tagHits.length > 0 && <li className="sugg-head" role="presentation">Tags{onSearch && selectedTags.size > 0 ? ' — adds to the current tags' : ''}</li>}
          {tagHits.map(t =>
            row({ kind: 'tag', tag: t }, (
              <>
                <span className="sugg-tag">#</span>
                <span className="sugg-name"><Highlight text={t.name} q={q} /></span>
                <span className="sugg-meta">{fmtCompact(t.n_games)} games</span>
              </>
            ), `t${t.id}`),
          )}
          {(gameHits.length > 0 || games.isFetching) && (
            <li className="sugg-head" role="presentation">Games{games.isFetching ? ' …' : ''}</li>
          )}
          {gameHits.map(g =>
            row({ kind: 'game', game: g }, (
              <>
                {g[5] ? <img className="sugg-img" src={g[5]} alt="" loading="lazy" /> : <span className="sugg-img" />}
                <span className="sugg-name"><Highlight text={g[1]} q={q} /></span>
                <span className="sugg-meta">
                  {g[4] ? 'Soon' : yearOf(g[2])} · {fmtCompact(g[3])} reviews
                </span>
              </>
            ), `g${g[0]}`),
          )}
          {games.error && <li className="sugg-head tone-bad" role="presentation">Game search failed: {games.error.message}</li>}
          {row({ kind: 'all' }, (
            <span className="sugg-all">Search all games for “{q}” <kbd>Enter</kbd></span>
          ), 'all')}
        </ul>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
