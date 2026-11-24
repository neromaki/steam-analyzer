// Why two games are similar: the blended score split into its tag and description parts, the
// shared tags (with each game's vote weight and their part of the tag score) and the tags only
// one of them has. Opens as a side panel from any similar-game row or dot.
import { useEffect, useMemo, useRef } from 'react';
import type { Game, LensTag } from '../../lib/api';
import { useTags } from '../../lib/data';
import { fmtDate, fmtInt } from '../../lib/format';
import { lensOverlap } from '../../lib/lens';
import { tagOverlap, type Nb } from '../../lib/lineage';
import { useGame } from '../../state/game';
import { GameLink } from '../tags/common';

function Bar({ v, tone }: { v: number; tone: 1 | 2 }) {
  return <i className={`why-bar s${tone}`} style={{ width: `${Math.max(2, Math.min(100, v))}%` }} aria-hidden="true" />;
}

/** With `lens`, b is compared with the lens (the examples together) instead of with a. */
export default function WhySimilar({ a, b, wText, lens, onClose }: { a: Game; b: Nb; wText: number; lens?: LensTag[]; onClose: () => void }) {
  const { byId } = useTags();
  const q = useGame(b.appid);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);

  const ov = useMemo(() => (q.data && byId.size ? (lens ? lensOverlap(lens, q.data, byId) : tagOverlap(a, q.data, byId)) : null), [a, q.data, byId, lens]);
  const name = (id: number) => byId.get(id)?.name ?? String(id);
  const g = q.data;

  return (
    <div className="drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Why ${b.name} is similar`} tabIndex={-1} ref={panel}>
        <div className="drawer-head">
          <h2>{lens ? 'Why it matches the lens' : 'Why they’re similar'}</h2>
          <button className="btn small ghost" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="why-pair">{lens ? <>The lens on <b>{a.name}</b></> : <b>{a.name}</b>} and <GameLink appid={b.appid} name={b.name} /></p>
        <p className="faint">{fmtDate(b.date, b.soon)} · {fmtInt(b.reviews)} reviews · {b.dev}</p>

        <div className="why-score">
          <div><span className="muted">Similarity</span><b>{b.sim.toFixed(2)}</b></div>
          <div><span className="muted">Tags</span><b>{b.ts.toFixed(2)}</b><span className="faint">× {(1 - wText).toFixed(2)}</span></div>
          <div><span className="muted">Description</span><b>{b.xs.toFixed(2)}</b><span className="faint">× {wText.toFixed(2)}</span></div>
        </div>
        <p className="faint">Tag score: how much their tag fingerprints overlap (vote weight × how rare the tag is). Description score:
          how close their store descriptions are in meaning (a small language model).{lens ? ' The lens’s description is the average of its examples’.' : ''}</p>

        {q.error ? <p className="banner error">Couldn’t load {b.name}: {(q.error as Error).message}</p>
          : !ov || !g ? <div className="skel" style={{ height: 200 }} aria-label="Loading" />
          : (
            <>
              <h3>Shared tags</h3>
              {ov.shared.length ? (
                <table className="dtable why-table">
                  <thead><tr><th>Tag</th><th className="num" title={lens ? 'Lens weight, % of its top tag' : 'Votes, % of the top tag'}>{lens ? 'Lens' : 'This'}</th><th className="num">That</th><th>Part of tag score</th></tr></thead>
                  <tbody>{ov.shared.map(t => (
                    <tr key={t.id}><td>{name(t.id)}</td><td className="num">{t.wa}</td><td className="num">{t.wb}</td>
                      <td className="why-cell"><Bar v={t.contrib * 100} tone={1} /><span>{Math.round(t.contrib * 100)}%</span></td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="muted">No content tags in common.</p>}
              <div className="why-only">
                <div><h3>{lens ? 'Lens tags it lacks' : `Only ${a.name}`}</h3><p>{ov.onlyA.length ? ov.onlyA.map(t => <span key={t.id} className="chip">{name(t.id)} <span className="faint">{t.w}</span></span>) : <span className="faint">none</span>}</p></div>
                <div><h3>{lens ? `${b.name}’s tags the lens doesn’t use` : `Only ${b.name}`}</h3><p>{ov.onlyB.length ? ov.onlyB.map(t => <span key={t.id} className="chip">{name(t.id)} <span className="faint">{t.w}</span></span>) : <span className="faint">none</span>}</p></div>
              </div>
              <p className="faint">Numbers next to tags: Steam tag votes as % of the game’s top tag. Genre-neutral tags (Singleplayer, Indie…) don’t count.</p>
              <h3>Descriptions</h3>
              <div className="why-desc">
                <p><b>{a.name}</b><br />{a.short_description || <span className="faint">none</span>}</p>
                <p><b>{g.name}</b><br />{g.short_description || <span className="faint">none</span>}</p>
              </div>
            </>
          )}
      </aside>
    </div>
  );
}
