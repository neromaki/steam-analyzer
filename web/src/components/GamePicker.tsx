// Pick a game by typing its name (the search bar's look-ahead, without leaving the page).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useDebounced } from '../hooks/useDebounced';
import { useDismiss } from '../hooks/useDismiss';
import { configured, suggest } from '../lib/api';
import { fmtCompact, yearOf } from '../lib/format';

export default function GamePicker({ onPick, placeholder, exclude }: {
  onPick: (appid: number) => void; placeholder: string; exclude: Set<number>;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const dq = useDebounced(text.trim(), 150);
  const q = useQuery({
    queryKey: ['suggest', dq], queryFn: () => suggest(dq), enabled: configured && dq.length > 0,
    placeholderData: keepPreviousData, staleTime: 3600e3,
  });
  const hits = (dq && q.data ? q.data : []).filter(g => !exclude.has(g[0]));
  const pick = (appid: number) => { onPick(appid); setText(''); setActive(0); setOpen(false); };

  return (
    <div className="pop-wrap game-picker" ref={ref}>
      <input className="input" value={text} placeholder={placeholder} aria-label={placeholder}
        onChange={e => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active][0]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && hits.length > 0 && (
        <ul className="popover left tag-picker-list" role="listbox">
          {hits.map((g, i) => (
            <li key={g[0]} role="option" aria-selected={i === active} className={`sugg${i === active ? ' active' : ''}`}
                onPointerEnter={() => setActive(i)} onPointerDown={e => e.preventDefault()} onClick={() => pick(g[0])}>
              <span className="sugg-name">{g[1]}</span>
              <span className="sugg-meta">{g[4] ? 'soon' : yearOf(g[2])} · {fmtCompact(g[3])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
