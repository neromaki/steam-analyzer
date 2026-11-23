import { useEffect, useRef, useState } from 'react';

/**
 * A local draft of a value that commits after `ms` of no changes (or at once via `flush`),
 * so typing in a field or dragging a slider doesn't fire a query on every keystroke.
 * Outside changes to `value` replace the draft unless the user is mid-edit.
 */
export function useDraft<T>(value: T, commit: (v: T) => void, ms = 400) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });

  useEffect(() => { if (!dirty) setDraft(value); }, [value, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { commitRef.current(draft); setDirty(false); }, ms);
    return () => clearTimeout(t);
  }, [draft, dirty, ms]);

  const edit = (v: T) => { setDraft(v); setDirty(true); };
  const flush = () => { if (dirty) { commitRef.current(draft); setDirty(false); } };
  return [draft, edit, flush] as const;
}
