// "What the search's new games copy": hits from the years before the rise (any tags), ranked
// by how many of the search's games released since then closely match them. A hit needn't
// carry the search's own tags: Balatro isn't tagged Poker, but many recent Poker games copy it.
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { configured, fetchGameNames, type Theme } from '../../lib/api';
import type { CopyInput, CopyResult } from '../../lib/copies';
import { useTags } from '../../lib/data';
import { fmtDate, fmtInt } from '../../lib/format';
import { qLabel } from '../../lib/trends';
import { useSearchParams } from 'react-router-dom';
import { useUpdateParams } from '../../lib/url';
import { useHitVectors, useThemeVectors } from '../../state/theme';
import { GameLink, ParamSlider as Slider, Section, TagNames, useInView } from './common';

const LOOKBACK = 12, CAND_REVIEWS = 1000;

/** Run the analysis in a worker; the latest request wins. */
function useCopyWorker(input: CopyInput | null) {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [out, setOut] = useState<{ result: CopyResult; ms: number; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    worker.current = new Worker(new URL('../../lib/copies.worker.ts', import.meta.url), { type: 'module' });
    worker.current.onmessage = (e: MessageEvent<{ id: number; result: CopyResult; ms: number }>) => {
      if (e.data.id === seq.current) { setOut(e.data); setBusy(false); }
    };
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!input || !worker.current) return;
    const id = ++seq.current;
    setBusy(true);
    worker.current.postMessage({ id, input });
  }, [input]);
  return { out, busy };
}

export default function Copies({ theme, tq, dataQ, firstQ, wDefault, sDefault }: {
  theme: Theme; tq: number | null; dataQ: number; firstQ: number; wDefault: number; sDefault: number;
}) {
  const [sp] = useSearchParams();
  const update = useUpdateParams();
  const [ref, seen] = useInView<HTMLDivElement>();
  const { tags } = useTags();
  const defaultRise = tq ?? dataQ - 8;
  const riseQ = sp.has('rise') ? Math.min(dataQ, Math.max(firstQ + 4, +sp.get('rise')!)) : defaultRise;
  const wText = sp.has('cw') ? Math.min(1, Math.max(0, +sp.get('cw')!)) : wDefault;
  const minSim = sp.has('cs') ? Math.min(0.95, Math.max(0.2, +sp.get('cs')!)) : sDefault;
  const withAdult = sp.get('cadult') === '1';
  const [open, setOpen] = useState<number | null>(null);

  const tv = useThemeVectors(theme, riseQ, seen);
  const hv = useHitVectors(riseQ, seen);
  const input = useMemo<CopyInput | null>(() => (tv.data && hv.data && tags.length ? {
    tags: tags.map(t => ({ id: t.id, idf: t.idf, content: t.content, adult: t.adult })),
    news: tv.data.new, cands: hv.data.cand, nNew: tv.data.n_new, nSoon: tv.data.n_soon, wText, minSim, withAdult,
  } : null), [tv.data, hv.data, tags, wText, minSim, withAdult]);
  const { out, busy } = useCopyWorker(input);
  const r = out?.result;
  const top = useMemo(() => r?.rows.slice(0, 25) ?? [], [r]);

  // Names for the copies shown (the vectors carry ids only).
  const want = useMemo(() => {
    const ids = new Set<number>();
    top.forEach(x => x.copies.slice(0, 3).forEach(([id]) => ids.add(id)));
    if (open != null) top.find(x => x.appid === open)?.copies.slice(0, 60).forEach(([id]) => ids.add(id));
    return [...ids].sort((a, b) => a - b);
  }, [top, open]);
  const names = useQuery({ queryKey: ['names', want.join(',')], queryFn: () => fetchGameNames(want), enabled: configured && want.length > 0, staleTime: 3600e3 });
  const nm = (id: number) => names.data?.get(id);

  const quarters = useMemo(() => { const l: number[] = []; for (let q = dataQ; q >= firstQ + 4; q--) l.push(q); return l; }, [dataQ, firstQ]);
  const loading = seen && (tv.isFetching || hv.isFetching || busy);
  const error = tv.error ?? hv.error;

  return (
    <Section title="What the new games copy" id="copies"
      sub={<>Hits from the 3 years before the rise ({CAND_REVIEWS.toLocaleString()}+ reviews, any tags), ranked by how many of this search’s
        games released since then closely match them (other developers only). A hit needn’t share the search’s tags: Balatro isn’t
        tagged Poker, but many recent Poker games copy it. Click a row to list its copies.</>}>
      <div ref={ref} className="cp">
        <div className="cp-controls">
          <label className="cp-rise">
            <span className="muted">Rise starting</span>
            <select className="input" value={riseQ} onChange={e => update(n => (+e.target.value === defaultRise ? n.delete('rise') : n.set('rise', e.target.value)))}>
              {quarters.map(q => <option key={q} value={q}>{qLabel(q)}{q === tq ? ' (take-off)' : ''}</option>)}
            </select>
          </label>
          <Slider k="cs" label="Similarity ≥" value={minSim} min={0.3} max={0.9} step={0.01} fmt={v => v.toFixed(2)} />
          <Slider k="cw" label="Descriptions vs tags" value={wText} min={0} max={1} step={0.05} fmt={v => (v === 0 ? 'tags only' : `${Math.round(v * 100)}% text`)} />
          <label className="check"><input type="checkbox" checked={withAdult} onChange={e => update(n => (e.target.checked ? n.set('cadult', '1') : n.delete('cadult')))} /> Adult games as hits</label>
          {(sp.has('cw') || sp.has('cs') || sp.has('rise') || withAdult) && (
            <button className="btn small ghost" onClick={() => update(n => ['cw', 'cs', 'rise', 'cadult'].forEach(k => n.delete(k)))}>Reset</button>
          )}
        </div>
        <p className="faint cp-note" aria-live="polite">
          {error ? `Couldn’t load: ${(error as Error).message}` : !seen ? '' : loading ? 'Comparing…'
            : r ? `${fmtInt(r.nNew)} games released since ${qLabel(riseQ)} (+${fmtInt(r.nSoon)} coming soon), checked against ${fmtInt(r.nCand)} hits from ${qLabel(riseQ - LOOKBACK)}–${qLabel(riseQ + 2)}${r.sampled ? '; counts estimated from a sample' : ''} · ${out!.ms} ms` : ''}
        </p>
        {error ? <button className="btn" onClick={() => { void tv.refetch(); void hv.refetch(); }}>Try again</button>
          : !r ? <div className="skel" style={{ height: 320 }} aria-label="Loading" />
          : !r.nNew ? <div className="empty">No games in this search released since {qLabel(riseQ)}. Pick an earlier quarter.</div>
          : !r.rows.length ? <div className="empty">None of the new games closely matches a hit from that period. Try a lower similarity.</div>
          : (
            <div className={`tscroll cp-scroll${loading ? ' stale' : ''}`}>
              <table className="dtable">
                <thead><tr><th className="num">#</th><th>Hit</th><th>Released</th><th className="num">Reviews</th>
                  <th className="num">Copies since</th><th className="num">Coming soon</th><th>Most-reviewed copies</th></tr></thead>
                <tbody>{top.map((x, i) => (
                  <Fragment key={x.appid}>
                    <tr className={`click${open === x.appid ? ' sel' : ''}`} onClick={e => { if ((e.target as HTMLElement).closest('a')) return; setOpen(o => (o === x.appid ? null : x.appid)); }}>
                      <td className="num faint">{i + 1}</td>
                      <td className="wrap"><GameLink appid={x.appid} name={x.name} /><div className="tset-sub"><span className="faint">{x.developer} · </span><TagNames ids={x.tags} max={4} /></div></td>
                      <td>{fmtDate(x.releaseDate)}</td>
                      <td className="num">{fmtInt(x.reviews)}</td>
                      <td className="num"><b>{fmtInt(x.n)}</b> <span className="faint">{Math.round((x.n / r.nNew) * 100)}%</span></td>
                      <td className="num">{x.soon ? fmtInt(x.soon) : <span className="faint">–</span>}</td>
                      <td className="wrap cp-copies">{x.copies.slice(0, 3).map(([id, rv]) => (
                        <span key={id}>{nm(id) ? <GameLink appid={id} name={nm(id)!.name} /> : <span className="faint">…</span>} <span className="faint">{fmtInt(rv)}</span></span>
                      ))}</td>
                    </tr>
                    {open === x.appid && (
                      <tr className="cp-open"><td /><td colSpan={6}>
                        <div className="cp-list">{x.copies.slice(0, 60).map(([id, rv]) => (
                          <span key={id}>{nm(id) ? <GameLink appid={id} name={nm(id)!.name} /> : '…'} <span className="faint">{fmtInt(rv)} · {fmtDate(nm(id)?.release_date)}</span></span>
                        ))}</div>
                        {x.copies.length > 60 && <p className="faint">Showing 60 of {fmtInt(x.copies.length)}{r.sampled ? ' sampled copies' : ''}.</p>}
                      </td></tr>
                    )}
                  </Fragment>
                ))}</tbody>
              </table>
            </div>
          )}
      </div>
    </Section>
  );
}
