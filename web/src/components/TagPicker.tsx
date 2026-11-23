// Pick tags by typing: chips for the chosen ones, a filtered list for the rest.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDismiss } from '../hooks/useDismiss';
import { matchTags, useTags } from '../lib/data';
import { fmtCompact } from '../lib/format';

interface Props {
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  variant?: 'include' | 'exclude';
}

export default function TagPicker({ value, onChange, placeholder = 'Add a tag…', variant = 'include' }: Props) {
  const { tags, byId } = useTags();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const chosen = useMemo(() => new Set(value), [value]);
  const hits = useMemo(() => matchTags(tags, text, 8, chosen), [tags, text, chosen]);

  const add = (id: number) => {
    onChange([...value, id]);
    setText('');
    setActive(0);
  };

  return (
    <div className="tag-picker" ref={ref}>
      {value.map(id => (
        <span key={id} className={`chip${variant === 'exclude' ? ' exclude-chip' : ''}`}>
          {byId.get(id)?.name ?? id}
          <button className="x" onClick={() => onChange(value.filter(v => v !== id))} aria-label={`Remove ${byId.get(id)?.name ?? id}`}>×</button>
        </span>
      ))}
      <div className="pop-wrap tag-picker-input">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={e => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(a => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(a => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && hits[active]) {
              e.preventDefault();
              add(hits[active].id);
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          aria-label={placeholder}
        />
        {open && hits.length > 0 && (
          <ul className="popover left tag-picker-list" role="listbox">
            {hits.map((t, i) => (
              <li key={t.id} role="option" aria-selected={i === active} className={`sugg${i === active ? ' active' : ''}`}
                  onPointerEnter={() => setActive(i)} onPointerDown={e => e.preventDefault()} onClick={() => add(t.id)}>
                <span className="sugg-name">{t.name}</span>
                <span className="sugg-meta">{fmtCompact(t.n_games)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
