// Influence graph: the game with its likely influences (similar earlier hits) and followers
// (the most-reviewed similar later games). Click any game, then expand it a generation back or
// forward to follow the chain. Arrows point from older to newer; dot size = reviews; colour =
// release year.
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, fmtInt } from '../../lib/format';
import { isReleased, type Nb } from '../../lib/lineage';
import { useFloor } from '../../state/floor';
import { neighborsQuery, useGameLink, type GameSettings, type Neighbors } from '../../state/game';
import EChart, { useChartColors, type ChartColors, type EOption } from '../EChart';
import type { UseQueryResult } from '@tanstack/react-query';
import { Section } from '../tags/common';

interface GNode { id: number; name: string; date: string | null; reviews: number; dev: string }
type Dir = 'back' | 'fwd';
interface Graph { nodes: Map<number, GNode>; edges: Map<string, [number, number, number]>; done: Set<string> }

const PER_GEN = 5, MAX_NODES = 80;
// Blue ramp (dataviz sequential): newer games get the higher-contrast end in each theme.
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const LIGHT = RAMP.slice(3), DARK = RAMP.slice(0, 11).reverse();

function isDark(c: ChartColors) {
  const m = c.panel.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m ? (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 < 128 : true;
}

/** One generation from `c`: earlier similar hits (by similarity) or later ones (by reviews). */
function generation(c: GNode, rows: Nb[], dir: Dir, dataDate: string): Nb[] {
  const rel = rows.filter(r => isReleased(r, dataDate) && c.date && (dir === 'back' ? r.date! < c.date : r.date! > c.date));
  if (dir === 'fwd') return rel.filter(r => r.reviews >= 100).sort((a, b) => b.reviews - a.reviews).slice(0, PER_GEN);
  const big = rel.filter(r => r.reviews >= 1000);
  return (big.length >= 2 ? big : rel.filter(r => r.reviews >= 100)).sort((a, b) => b.sim - a.sim).slice(0, PER_GEN);
}

function grow(g: Graph, c: GNode, rows: Nb[], dir: Dir, dataDate: string): Graph {
  const nodes = new Map(g.nodes), edges = new Map(g.edges), done = new Set(g.done).add(`${c.id}:${dir}`);
  for (const r of generation(c, rows, dir, dataDate)) {
    if (!nodes.has(r.appid)) {
      if (nodes.size >= MAX_NODES) break;
      nodes.set(r.appid, { id: r.appid, name: r.name, date: r.date, reviews: r.reviews, dev: r.dev });
    }
    const [from, to] = dir === 'back' ? [r.appid, c.id] : [c.id, r.appid];
    edges.set(`${from}>${to}`, [from, to, r.sim]);
  }
  return { nodes, edges, done };
}

function GraphView({ self, rows, s, dataDate }: { self: Nb; rows: Nb[]; s: GameSettings; dataDate: string }) {
  const c = useChartColors();
  const qc = useQueryClient();
  const [floor] = useFloor();
  const gameLink = useGameLink();
  const root: GNode = { id: self.appid, name: self.name, date: self.date, reviews: self.reviews, dev: self.dev };
  const [g, setG] = useState<Graph>(() => {
    const g0: Graph = { nodes: new Map([[root.id, root]]), edges: new Map(), done: new Set() };
    return grow(grow(g0, root, rows, 'back', dataDate), root, rows, 'fwd', dataDate);
  });
  const [sel, setSel] = useState<number>(self.appid);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const expand = async (id: number, dir: Dir) => {
    const n = g.nodes.get(id);
    if (!n) return;
    setBusy(`${id}:${dir}`); setErr(null);
    try {
      const nb = id === self.appid ? { rows } as Neighbors : await qc.fetchQuery(neighborsQuery(id, s, floor));
      setG(cur => grow(cur, n, nb.rows, dir, dataDate));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const years = useMemo(() => {
    const ys = [...g.nodes.values()].map(n => (n.date ? +n.date.slice(0, 4) : NaN)).filter(Number.isFinite);
    return { lo: Math.min(...ys), hi: Math.max(...ys) };
  }, [g.nodes]);
  const ramp = isDark(c) ? DARK : LIGHT;
  const colorOf = (date: string | null) => {
    if (!date || !Number.isFinite(years.lo)) return c.faint;
    const t = years.hi > years.lo ? (+date.slice(0, 4) - years.lo) / (years.hi - years.lo) : 1;
    return ramp[Math.round(t * (ramp.length - 1))];
  };

  const option = useMemo<EOption>(() => {
    const nodes = [...g.nodes.values()];
    const maxRev = Math.max(1, ...nodes.map(n => n.reviews));
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return {
      animationDurationUpdate: 300,
      tooltip: {
        backgroundColor: c.panel, borderColor: c.axis, textStyle: { color: c.text, fontSize: 12 },
        formatter: (p: { dataType: string; data: { id?: string; value?: number; source?: string; target?: string } }) => {
          if (p.dataType === 'edge') {
            const a = g.nodes.get(+p.data.source!), b = g.nodes.get(+p.data.target!);
            return `${esc(a?.name ?? '')} → ${esc(b?.name ?? '')}<br>Similarity ${(p.data.value ?? 0).toFixed(2)}`;
          }
          const n = g.nodes.get(+p.data.id!)!;
          return `<b>${esc(n.name)}</b><br>${fmtDate(n.date)} · ${fmtInt(n.reviews)} reviews<br><span style="opacity:.7">${esc(n.dev)}</span>`;
        },
      },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        force: { repulsion: 260, edgeLength: [50, 140], gravity: 0.08, layoutAnimation: true },
        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 7,
        labelLayout: { hideOverlap: true },
        label: { show: true, position: 'right', color: c.text, fontSize: 11, formatter: (p: { data: { name: string } }) => p.data.name.length > 24 ? `${p.data.name.slice(0, 23)}…` : p.data.name },
        emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
        data: nodes.map(n => ({
          id: String(n.id), name: n.name, symbolSize: 10 + 26 * Math.sqrt(n.reviews / maxRev),
          itemStyle: {
            color: colorOf(n.date),
            borderColor: n.id === sel ? c.accent : n.id === self.appid ? c.strong : c.panel,
            borderWidth: n.id === sel || n.id === self.appid ? 3 : 1.5,
          },
          label: { fontWeight: n.id === self.appid || n.id === sel ? 'bold' : 'normal' },
        })),
        links: [...g.edges.values()].map(([a, b, sim]) => ({
          source: String(a), target: String(b), value: sim,
          lineStyle: { color: c.axis, width: 1 + 3 * Math.max(0, (sim - s.minSim) / (1 - s.minSim)), opacity: 0.8, curveness: 0.08 },
        })),
      }],
    };
  }, [g, c, sel, self.appid, s.minSim, years]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = g.nodes.get(sel);
  const btn = (dir: Dir, label: string) => {
    const k = `${sel}:${dir}`;
    return (
      <button className="btn small" disabled={!!busy || g.done.has(k) || !cur?.date || g.nodes.size >= MAX_NODES} onClick={() => void expand(sel, dir)}>
        {busy === k ? 'Loading…' : g.done.has(k) ? `${label} ✓` : label}
      </button>
    );
  };

  return (
    <>
      <div className="inf-bar">
        {cur && (
          <div className="inf-sel">
            <span><b>{cur.name}</b> <span className="faint">{fmtDate(cur.date)} · {fmtInt(cur.reviews)} reviews</span></span>
            {btn('back', '← Influences')}
            {btn('fwd', 'Followers →')}
            {cur.id !== self.appid && <Link className="btn small ghost" to={gameLink(cur.id)}>Open game</Link>}
          </div>
        )}
        <div className="spacer" />
        {Number.isFinite(years.lo) && (
          <div className="yr-legend" aria-label={`Colour: release year, ${years.lo} (lightest) to ${years.hi}`}>
            <span className="faint">{years.lo}</span>
            <i style={{ background: `linear-gradient(90deg, ${ramp.join(',')})` }} />
            <span className="faint">{years.hi}</span>
          </div>
        )}
      </div>
      {err && <p className="banner error">Couldn’t expand: {err}</p>}
      <EChart option={option} height={460} merge label={`Influence graph around ${self.name}: ${g.nodes.size} games`}
              onClick={p => { const id = Number((p.data as { id?: string }).id); if (id) setSel(id); }} />
      <p className="faint">{fmtInt(g.nodes.size)} games{g.nodes.size >= MAX_NODES ? ' (the most this graph holds)' : ''}. Drag to move, scroll to zoom.</p>
    </>
  );
}

export default function Influence({ nb, self, s, dataDate }: { nb: UseQueryResult<Neighbors>; self: Nb; s: GameSettings; dataDate: string }) {
  const [floor] = useFloor();
  const [gen, setGen] = useState(0);
  const ready = nb.data && !nb.isPlaceholderData;
  return (
    <Section title="Influence graph"
      controls={<button className="btn small ghost" onClick={() => setGen(x => x + 1)}>Reset</button>}
      sub={<>{self.name} with up to {PER_GEN} likely influences (similar earlier hits) and {PER_GEN} biggest followers (similar later games).
        Click a game, then follow the chain a generation back or forward. Arrows run from older to newer.</>}>
      {ready ? <GraphView key={`${self.appid}|${s.minSim}|${s.wText}|${JSON.stringify(floor)}|${gen}`} self={self} rows={nb.data!.rows} s={s} dataDate={dataDate} />
        : nb.error ? <div className="empty">Couldn’t load: {(nb.error as Error).message}</div>
        : <div className="skel" style={{ height: 460 }} aria-label="Loading" />}
    </Section>
  );
}
