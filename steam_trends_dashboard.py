#!/usr/bin/env python3
"""
Step 3: build dashboard.html from output/analysis.json (+ output/origins.json
from steam_trends_origins.py, if present).

Usage:
    python steam_trends_dashboard.py      # then open dashboard.html in a browser

The HTML is fully self-contained (data gzipped + inlined, no CDN, no server).
Needs a current browser (Chrome/Edge/Firefox/Safari from 2023 on).
"""
import base64
import gzip
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "output", "analysis.json")
ORIG = os.path.join(HERE, "output", "origins.json")
OUT = os.path.join(HERE, "dashboard.html")

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steam Release Trends</title>
<style>
:root {
  color-scheme: light;
  --bg: #f6f5f2; --surface: #fcfcfb; --border: #e3e1da; --grid: #ebe9e3;
  --text: #0b0b0b; --text-2: #52514e; --muted: #85837c; --accent: #2a78d6;
  --up: #008300; --down: #c23a39; --hover: #f0eee8; --mark: #eda100;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100;
  --s5:#e87ba4; --s6:#008300; --s7:#6250d6; --s8:#e34948;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #121211; --surface: #1a1a19; --border: #2f2e2b; --grid: #262523;
    --text: #f0efec; --text-2: #c3c2b7; --muted: #8d8c84; --accent: #3987e5;
    --up: #3fb93f; --down: #e66767; --hover: #24231f; --mark: #c98500;
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
    --s5:#d55181; --s6:#0ca30c; --s7:#9085e9; --s8:#e66767;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121211; --surface: #1a1a19; --border: #2f2e2b; --grid: #262523;
  --text: #f0efec; --text-2: #c3c2b7; --muted: #8d8c84; --accent: #3987e5;
  --up: #3fb93f; --down: #e66767; --hover: #24231f; --mark: #c98500;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
  --s5:#d55181; --s6:#0ca30c; --s7:#9085e9; --s8:#e66767;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 0 0 4px; }
h3 { font-size: 14px; margin: 16px 0 6px; color: var(--text-2); }
.sub { color: var(--text-2); margin: 0 0 12px; }
.small { font-size: 12px; color: var(--muted); }
.caveat { border-left: 3px solid var(--mark); background: var(--surface); padding: 8px 12px;
  color: var(--text-2); font-size: 13px; margin: 12px 0 20px; border-radius: 4px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 20px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.grid2 > * { min-width: 0; }
@media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }
select, input[type=text], button { font: inherit; color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 5px 9px; }
input[type=text] { min-width: 0; flex: 1 1 200px; }
button { cursor: pointer; }
button:hover { background: var(--hover); }
button.on { border-color: var(--accent); color: var(--accent); }
.seg { display: inline-flex; }
.seg button { border-radius: 0; margin-left: -1px; }
.seg button:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
.seg button:last-child { border-radius: 0 6px 6px 0; }
.tablewrap { overflow: auto; max-height: 480px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--grid); white-space: nowrap; vertical-align: top; }
th { color: var(--text-2); font-weight: 600; position: sticky; top: 0; background: var(--surface); z-index: 1; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
td.wrap { white-space: normal; min-width: 160px; }
tr.click { cursor: pointer; }
tr.click:hover td { background: var(--hover); }
tr.sel td { background: var(--hover); }
.up { color: var(--up); } .down { color: var(--down); }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border);
  border-radius: 999px; padding: 2px 4px 2px 10px; font-size: 13px; background: var(--bg); }
.chip i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.chip button { border: 0; background: none; padding: 0 6px; color: var(--muted); }
.chip .lbl { cursor: pointer; }
.chart { position: relative; }
.chart svg { display: block; width: 100%; }
.tip { position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 9px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.12);
  display: none; min-width: 150px; max-width: 320px; z-index: 3; }
.tip b { display: block; margin-bottom: 3px; }
.tip div { display: flex; gap: 8px; justify-content: space-between; }
.tip i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-2); margin: 4px 0; }
.legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: -1px; }
.legend i.dash { border-radius: 0; height: 0; width: 14px; border-top: 2px dashed var(--mark); }
.tag-mini { color: var(--muted); font-size: 12px; }
.mini { font-size: 11px; padding: 1px 6px; margin-top: 3px; }
.pill { font-size: 11px; border-radius: 4px; padding: 1px 5px; background: var(--hover); color: var(--text-2); }
.kpis { display: flex; flex-wrap: wrap; gap: 28px; margin: 8px 0 4px; }
.kpi b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
.kpi span { color: var(--muted); font-size: 12px; }
.empty { color: var(--muted); padding: 24px 0; text-align: center; }
nav.jump { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; margin: 0 0 16px; }
#loading { padding: 60px 0; text-align: center; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Steam Release Trends</h1>
  <p class="sub">Which genres and themes are taking off among new Steam releases, and which hit games started them.
    Measured as each tag's <b>share</b> of all releases in a period, because total releases keep growing.</p>
  <div id="loading">Unpacking data…</div>
  <div id="app" hidden>
  <div class="kpis" id="kpis"></div>
  <div class="caveat" id="caveat"></div>
  <nav class="jump"><a href="#rise">Rising tags</a><a href="#dd">Deep dive</a><a href="#setters">Trend-setters</a><a href="#compare">Compare</a><a href="#lead">Coming soon</a></nav>

  <section class="card" id="rise">
    <h2>Top rising tags</h2>
    <p class="small" id="riseNote"></p>
    <div class="controls">
      <label>Period <select id="risePeriod"></select></label>
      <span class="seg"><button id="rkTags" class="on">Tags</button><button id="rkPairs">Tag pairs</button></span>
      <span class="small">Click a row to deep-dive into it.</span>
    </div>
    <div class="tablewrap"><table id="riseTable"></table></div>
  </section>

  <section class="card" id="dd">
    <h2>Deep dive</h2>
    <p class="small">Pick one or more tags (games must have all of them), and/or a keyword regex searched in game names
      and store descriptions. "Core only" counts a game only when the tag is one of its top 5 tags, i.e. a major part of the game.</p>
    <div class="controls">
      <input type="text" id="ddTag" list="tagList" placeholder="Add a tag, e.g. Trains">
      <datalist id="tagList"></datalist>
      <input type="text" id="ddKw" placeholder="Keyword regex in name/description, e.g. trains?\b|railway|locomotive">
      <label class="small"><input type="checkbox" id="ddCore"> core only (top-5 tag)</label>
      <button id="ddClear">Clear</button>
    </div>
    <div class="chips" id="ddChips"></div>
    <div id="ddBody"><div class="empty">Pick a tag, type a keyword, or click a row in the rising table.</div></div>
  </section>

  <section class="card" id="setters">
    <h2>Trend-setters: hits followed by a wave of look-alikes</h2>
    <p class="small" id="setNote"></p>
    <div class="grid2">
      <div>
        <div class="controls">
          <label>Released <select id="setYear"></select></label>
          <input type="text" id="setFilter" placeholder="Filter by name or tag">
        </div>
        <div class="tablewrap"><table id="setTable"></table></div>
      </div>
      <div id="wave"><div class="empty">Click a game to see its wave of look-alike releases.</div></div>
    </div>
  </section>

  <section class="card" id="compare">
    <h2>Compare tags: share of releases over time</h2>
    <p class="small">Add up to 8 tags or name/description keywords.</p>
    <div class="controls">
      <input type="text" id="cmpTag" list="tagList" placeholder="Add a tag">
      <input type="text" id="cmpKw" placeholder="…or a keyword regex">
      <button id="cmpAdd">Add</button>
      <span class="seg" id="cmpGran"><button data-g="year" class="on">By year</button><button data-g="ytd">Year, same dates</button><button data-g="quarter">By quarter</button></span>
    </div>
    <div class="chips" id="cmpChips"></div>
    <div class="chart" id="cmpChart"></div>
    <p class="small" id="cmpNote"></p>
  </section>

  <section class="card" id="lead">
    <h2>Leading indicator: tags over-represented in coming-soon games</h2>
    <p class="small" id="leadNote"></p>
    <div class="tablewrap"><table id="leadTable"></table></div>
  </section>
  </div>
</main>

<script id="data" type="application/octet-stream">__DATA__</script>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (v, d=2) => (v ?? 0).toLocaleString(undefined, {minimumFractionDigits:d, maximumFractionDigits:d});
const int = v => (v ?? 0).toLocaleString();
const store = id => `https://store.steampowered.com/app/${id}/`;
const link = (id, name) => `<a href="${store(id)}" target="_blank" rel="noopener">${esc(name)}</a>`;

async function unpack() {
  const b64 = $('data').textContent.trim();
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// ------------------------------------------------------------ chart helpers
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
function ensureChart(el, H) {
  if (!el._svg || !el.contains(el._svg)) { el.innerHTML = `<svg style="height:${H}px"></svg><div class="tip"></div>`; el._svg = el.firstChild; el._tip = el.lastChild; }
  return [el._svg, el._tip];
}
function placeTip(tip, svg, px, W) {
  const r = svg.getBoundingClientRect(); tip.style.display = 'block';
  const left = px / W * r.width;
  tip.style.left = (left + 14 + tip.offsetWidth > r.width ? left - tip.offsetWidth - 14 : left + 14) + 'px';
  tip.style.top = '8px';
}
// series: [{label, values, color}], markers: [{i, label}]
function lineChart(el, {labels, series, markers = [], H = 300, yFmt = v => fmt(v, v < 1 ? 2 : 1) + '%', empty = 'No data'}) {
  const [svg, tip] = ensureChart(el, H);
  const W = svg.clientWidth || 800, m = {l: 52, r: 16, t: 18, b: 28}, n = labels.length;
  const ymax = niceMax(Math.max(1e-9, ...series.flatMap(s => s.values)) * 1.1);
  const x = i => m.l + (n <= 1 ? 0 : i * (W - m.l - m.r) / (n - 1));
  const y = v => m.t + (1 - v / ymax) * (H - m.t - m.b);
  let h = '';
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, yy = y(v);
    h += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${yFmt(v)}</text>`; }
  const step = Math.ceil(n / Math.max(2, Math.floor((W - m.l) / 60)));
  labels.forEach((l, i) => { if (i % step === 0) h += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(l)}</text>`; });
  for (const mk of markers) h += `<line x1="${x(mk.i)}" x2="${x(mk.i)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--mark)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${x(mk.i) + 4}" y="${m.t + 2}" font-size="11" fill="var(--text-2)">${esc(mk.label)}</text>`;
  for (const s of series) h += `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (series.length && series.length <= 4 && n) {
    const lab = series.map(s => ({t: s.label, y: y(s.values[n - 1]) - 7})).sort((a, b) => a.y - b.y);
    for (let k = 0; k < lab.length; k++) lab[k].y = Math.max(lab[k].y, k ? lab[k - 1].y + 13 : m.t + 10);
    for (const l of lab) h += `<text x="${x(n - 1) - 4}" y="${l.y}" text-anchor="end" font-size="11" fill="var(--text-2)">${esc(l.t)}</text>`;
  }
  if (!series.length) h += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)">${esc(empty)}</text>`;
  h += `<line class="xh" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/><g class="dots"></g><rect class="hit" x="${m.l - 10}" y="0" width="${W - m.l - m.r + 20}" height="${H}" fill="transparent"/>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = h;
  const hit = svg.querySelector('.hit'), xh = svg.querySelector('.xh'), dots = svg.querySelector('.dots');
  hit.onmousemove = e => {
    if (!series.length) return;
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / ((W - m.l - m.r) / Math.max(1, n - 1)))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    dots.innerHTML = series.map(s => `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
    tip.innerHTML = `<b>${esc(labels[i])}</b>` + [...series].sort((a, b) => b.values[i] - a.values[i]).map(s => `<div><span><i style="background:${s.color}"></i>${esc(s.label)}</span><span>${yFmt(s.values[i])}</span></div>`).join('');
    placeTip(tip, svg, x(i), W);
  };
  hit.onmouseleave = () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; };
}
// points: [{x (0..n-1 float), v (>0), label, sub, id, big, color}] on a log-y axis
function scatterChart(el, {labels, points, markers = [], H = 260, onClick, labelTop = 6}) {
  const [svg, tip] = ensureChart(el, H);
  const W = svg.clientWidth || 800, m = {l: 52, r: 16, t: 18, b: 28}, n = labels.length;
  const vmax = Math.max(100, ...points.map(p => p.v)), lmax = Math.ceil(Math.log10(vmax)), lmin = 1;
  const x = v => m.l + v * (W - m.l - m.r) / Math.max(1, n - 1);
  const y = v => m.t + (1 - (Math.log10(Math.max(v, 10)) - lmin) / (lmax - lmin)) * (H - m.t - m.b);
  let h = '';
  for (let k = lmin; k <= lmax; k++) h += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(10 ** k)}" y2="${y(10 ** k)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(10 ** k) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${int(10 ** k)}</text>`;
  labels.forEach((l, i) => { if (l) h += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(l)}</text>`; });
  for (const mk of markers) h += `<line x1="${x(mk.i)}" x2="${x(mk.i)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--mark)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${x(mk.i) + 4}" y="${m.t + 2}" font-size="11" fill="var(--text-2)">${esc(mk.label)}</text>`;
  const sorted = [...points].sort((a, b) => a.v - b.v);
  h += sorted.map((p, k) => `<circle data-k="${k}" cx="${x(p.x)}" cy="${y(p.v)}" r="${p.big ? 5 : 3.5}" fill="${p.color || 'var(--s1)'}" fill-opacity="${p.big ? 0.95 : 0.5}" stroke="var(--surface)" stroke-width="1"/>`).join('');
  const top = [...points].sort((a, b) => b.v - a.v).slice(0, labelTop), placed = [];
  for (const p of top) { let ly = y(p.v) - 8; while (placed.some(q => Math.abs(q.y - ly) < 12 && Math.abs(q.x - x(p.x)) < 140)) ly += 12; placed.push({x: x(p.x), y: ly});
    const anchor = x(p.x) > W * 0.7 ? 'end' : 'start';
    h += `<text x="${x(p.x) + (anchor === 'end' ? -7 : 7)}" y="${ly}" text-anchor="${anchor}" font-size="11" fill="var(--text-2)">${esc(p.label.length > 28 ? p.label.slice(0, 26) + '…' : p.label)}</text>`; }
  if (!points.length) h += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)">No games with reviews</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = h;
  svg.querySelectorAll('circle').forEach(c => {
    const p = sorted[+c.dataset.k];
    c.style.cursor = 'pointer';
    c.onmouseenter = () => { tip.innerHTML = `<b>${esc(p.label)}</b><div><span>${esc(p.sub)}</span></div>`; placeTip(tip, svg, x(p.x), W); c.setAttribute('r', 6); };
    c.onmouseleave = () => { tip.style.display = 'none'; c.setAttribute('r', p.big ? 5 : 3.5); };
    c.onclick = () => onClick && onClick(p);
  });
}

// ------------------------------------------------------------ main
unpack().then(({a: D, o: O, f: F = {}}) => {
$('loading').remove(); $('app').hidden = false;
const G = D.games;  // [appid, name, day, ea, soon, [tagIdx], reviews, pct, dev, desc, [tagWeight 0-100]]
const EPOCH = Date.UTC(D.start_year, 0, 1);
const dayToDate = d => new Date(EPOCH + d * 864e5);
const iso = d => d == null ? 'TBA' : dayToDate(d).toISOString().slice(0, 10);
const gen = new Date(D.generated + 'T00:00:00Z'), genMD = (gen.getUTCMonth() + 1) * 100 + gen.getUTCDate();
const cy = D.years[D.years.length - 1];
const TAGIX = Object.fromEntries(D.tags.map((t, i) => [t, i]));
const BYID = new Map(G.map((g, k) => [g[0], k]));
// per-game derived fields
const YEAR = new Int16Array(G.length), QABS = new Int32Array(G.length), YTD = new Uint8Array(G.length), REL = new Uint8Array(G.length);
G.forEach((g, k) => { if (g[2] == null) return; const d = dayToDate(g[2]);
  YEAR[k] = d.getUTCFullYear(); QABS[k] = YEAR[k] * 4 + Math.floor(d.getUTCMonth() / 3);
  YTD[k] = (d.getUTCMonth() + 1) * 100 + d.getUTCDate() <= genMD; REL[k] = !g[4] && YEAR[k] >= D.start_year; });
const Q0 = D.start_year * 4, QN = cy * 4 + Math.floor(gen.getUTCMonth() / 3);
const qlabel = q => `${Math.floor(q / 4)}Q${q % 4 + 1}`;
const QLABELS = []; for (let q = Q0; q <= QN; q++) QLABELS.push(qlabel(q));
const QTOT = new Array(QLABELS.length).fill(0);
G.forEach((g, k) => { if (REL[k]) QTOT[QABS[k] - Q0]++; });
const nReleased = REL.reduce((a, b) => a + b, 0);
const TAGTOT = new Array(D.tags.length).fill(0);
G.forEach((g, k) => { if (REL[k]) for (const t of g[5]) TAGTOT[t]++; });
const kwRegex = s => { try { return s ? new RegExp('\\b(?:' + s + ')', 'i') : null; } catch (e) { return undefined; } };
const topTags = g => g[5].slice(0, 4).map(i => D.tags[i]).join(', ');

// ---------- header
$('kpis').innerHTML = [
  [int(nReleased), `games released ${D.start_year}–${cy}`],
  [int(D.year_totals[D.years.length - 2]), `released in ${cy - 1}`],
  [int(D.ytd_totals[D.years.length - 1]), `released ${cy} so far (${D.ytd_label})`],
  [int(D.coming_soon_total), 'coming soon'],
].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${esc(l)}</span></div>`).join('');
$('caveat').textContent = 'Caveat: ' + D.caveat + ` Popularity = number of Steam reviews (a standard proxy for sales). Data generated ${D.generated}.`;
$('tagList').innerHTML = D.tags.map(t => `<option value="${esc(t)}">`).join('');

// ---------- rising
let rankMode = 'tags';
const sortedPeriods = Object.keys(D.rising).sort((a, b) => (a.includes('Q') - b.includes('Q')) || (b > a ? 1 : -1));
$('risePeriod').innerHTML = sortedPeriods.map(p => `<option>${esc(p)}</option>`).join('');
$('risePeriod').value = sortedPeriods.find(p => p.includes('YTD')) || sortedPeriods[0];
$('riseNote').textContent = `Ranked by growth in share vs the previous period (+1 smoothing, so brand-new tags don't divide by zero), for tags with at least ${D.min_count} releases. ` +
  `${cy} is compared over the same dates (${D.ytd_label}) each year. Quarters are compared with the previous quarter.`;
function renderRise() {
  const blk = (rankMode === 'tags' ? D.rising : D.rising_pairs)[$('risePeriod').value];
  if (!blk) { $('riseTable').innerHTML = '<tr><td class="empty">No pair data for this period (pairs are yearly).</td></tr>'; return; }
  $('riseTable').innerHTML = `<thead><tr><th>#</th><th>${rankMode === 'tags' ? 'Tag' : 'Tag pair'}</th><th class="num">Share ${esc(blk.vs)}</th><th class="num">Share ${esc($('risePeriod').value)}</th><th class="num">Change</th><th class="num">Growth</th><th class="num">Games</th></tr></thead><tbody>` +
    blk.rows.map((r, i) => { const pp = r[3] - r[4]; return `<tr class="click" data-k="${esc(r[0])}"><td class="small">${i + 1}</td><td>${esc(r[0])}</td><td class="num">${fmt(r[4])}%</td><td class="num">${fmt(r[3])}%</td><td class="num ${pp >= 0 ? 'up' : 'down'}">${pp >= 0 ? '+' : ''}${fmt(pp)} pp</td><td class="num">×${fmt(r[5])}</td><td class="num">${int(r[1])} <span class="small">(was ${int(r[2])})</span></td></tr>`; }).join('') + '</tbody>';
}
$('risePeriod').onchange = renderRise;
$('rkTags').onclick = () => { rankMode = 'tags'; $('rkTags').classList.add('on'); $('rkPairs').classList.remove('on'); renderRise(); };
$('rkPairs').onclick = () => { rankMode = 'pairs'; $('rkPairs').classList.add('on'); $('rkTags').classList.remove('on'); renderRise(); };
$('riseTable').onclick = e => { const tr = e.target.closest('tr.click'); if (tr) { ddSet(tr.dataset.k.split(' + ')); $('dd').scrollIntoView({behavior: 'smooth'}); } };

// ---------- deep dive
const dd = {tags: [], kw: '', core: false, gran: 'year', sort: 'reviews', rel: 'distinct'};
function ddSet(tags, kw) { dd.tags = tags.filter(t => t in TAGIX); if (kw !== undefined) { dd.kw = kw; $('ddKw').value = kw; } renderDD(); }
const addDDTag = () => { const v = $('ddTag').value.trim(); if (v in TAGIX && !dd.tags.includes(v)) { dd.tags.push(v); renderDD(); } $('ddTag').value = ''; };
$('ddTag').onchange = addDDTag; $('ddTag').onkeydown = e => { if (e.key === 'Enter') addDDTag(); };
let kwT; $('ddKw').oninput = () => { clearTimeout(kwT); kwT = setTimeout(() => { dd.kw = $('ddKw').value.trim(); renderDD(); }, 350); };
$('ddCore').onchange = () => { dd.core = $('ddCore').checked; renderDD(); };
$('ddClear').onclick = () => { dd.tags = []; dd.kw = ''; $('ddKw').value = ''; renderDD(); };
$('ddChips').onclick = e => { if (e.target.dataset.x) { dd.tags = dd.tags.filter(t => t !== e.target.dataset.x); renderDD(); } };

// theme membership: [anyMask, coreMask] over G
function theme(tags, kw) {
  const ti = tags.map(t => TAGIX[t]), rx = kwRegex(kw);
  const any = new Uint8Array(G.length), core = new Uint8Array(G.length);
  G.forEach((g, k) => {
    if (rx && !(rx.test(g[1]) || rx.test(g[9]))) return;
    if (ti.every(i => g[5].includes(i))) { any[k] = 1; if (ti.every(i => { const p = g[5].indexOf(i); return p >= 0 && p < 5; })) core[k] = 1; }
  });
  return [any, core];
}
function shareSeries(mask, gran) {
  if (gran === 'quarter') { const c = new Array(QLABELS.length).fill(0); G.forEach((g, k) => { if (mask[k] && REL[k]) c[QABS[k] - Q0]++; });
    return {labels: QLABELS, counts: c, values: c.map((v, i) => QTOT[i] ? v / QTOT[i] * 100 : 0)}; }
  const c = D.years.map(() => 0);
  G.forEach((g, k) => { if (mask[k] && REL[k] && (gran !== 'ytd' || YTD[k])) c[YEAR[k] - D.start_year]++; });
  const tot = gran === 'ytd' ? D.ytd_totals : D.year_totals;
  return {labels: D.years.map(y => gran === 'year' && y === cy ? `${y}*` : String(y)), counts: c, values: c.map((v, i) => tot[i] ? v / tot[i] * 100 : 0)};
}
// take-off: first quarter where the 4-quarter rolling share beats 1.5x the prior 2 years and stays >= 1.2x,
// with at least 10 games in that 4-quarter window (a couple of games from nothing isn't a trend)
function takeoff(values, counts) {
  const r = values.map((_, i) => i < 3 ? NaN : (values[i] + values[i - 1] + values[i - 2] + values[i - 3]) / 4);
  for (let i = 12; i < r.length; i++) {
    if (counts && counts[i] + counts[i - 1] + counts[i - 2] + counts[i - 3] < 10) continue;
    const base = r.slice(i - 12, i - 3).filter(v => !isNaN(v)); if (!base.length) continue;
    const b = base.reduce((a, c) => a + c, 0) / base.length;
    if (b > 0 && r[i] >= 1.5 * b && r.slice(i).every(v => v >= 1.2 * b)) return i - 3;
  }
  return null;
}

// ---------- copy analysis: which hits do the theme's new games most closely copy?
// Same method as steam_trends_origins.py theme mode: tag fingerprints (vote weight x rarity,
// business/praise tags left out), cosine similarity >= SIM, other developer, released later.
const NONC = new Set((F.non_content || []).map(t => TAGIX[t]).filter(i => i != null));
const ADULTIX = new Set((F.adult || []).map(t => TAGIX[t]).filter(i => i != null));
const SIM = F.sim || 0.6, CAND_REVIEWS = 1000, LOOKBACK = 12, MAX_NEW = 4000;
let FP = null;
function fingerprints() {
  if (FP) return FP;
  const df = new Float64Array(D.tags.length); let n = 0;
  G.forEach(g => { if (g[4] || g[2] == null) return; n++; for (const t of g[5]) if (!NONC.has(t)) df[t]++; });
  const idf = Array.from(df, c => Math.log((n + 1) / (c + 1)));
  FP = G.map(g => { const ts = [], vs = []; let ss = 0;
    g[5].forEach((t, j) => { if (NONC.has(t)) return;
      const w = (g[10] ? g[10][j] / 100 : (g[5].length - j) / g[5].length) * idf[t];
      ts.push(t); vs.push(w); ss += w * w; });
    const nrm = Math.sqrt(ss) || 1;
    return [Int32Array.from(ts), Float32Array.from(vs, v => v / nrm)]; });
  return FP;
}
const thin = (list, max) => list.length <= max ? list : Array.from({length: max}, (_, i) => list[Math.floor(i * list.length / max)]);
const copyCache = new Map();
function copyAnalysis(M, riseQ, withAdult) {
  const key = [dd.tags.join('|'), dd.kw, dd.core, riseQ, withAdult].join('~');
  if (copyCache.has(key)) return copyCache.get(key);
  const fp = fingerprints();
  const newAll = [], soonAll = [];
  G.forEach((g, k) => { if (!M[k]) return; if (g[4]) soonAll.push(k); else if (g[2] != null && QABS[k] >= riseQ) newAll.push(k); });
  const news = thin(newAll, MAX_NEW), soons = thin(soonAll, MAX_NEW / 2);
  const cand = [];
  G.forEach((g, k) => { if (g[4] || g[2] == null || g[6] < CAND_REVIEWS || QABS[k] < riseQ - LOOKBACK || QABS[k] > riseQ + 2) return;
    if (!withAdult && g[5].slice(0, 8).some(t => ADULTIX.has(t))) return; cand.push(k); });
  const C = cand.length, dense = new Float32Array(C * D.tags.length);  // tag-major, so each tag's row is contiguous
  cand.forEach((k, c) => { const [ts, vs] = fp[k]; for (let j = 0; j < ts.length; j++) dense[ts[j] * C + c] = vs[j]; });
  const devs = cand.map(k => (G[k][8] || '').toLowerCase()), acc = new Float32Array(C);
  const copies = cand.map(() => []), soonCopies = cand.map(() => 0);
  const scan = (list, isSoon) => { for (const k of list) { acc.fill(0); const [ts, vs] = fp[k];
    for (let j = 0; j < ts.length; j++) { const off = ts[j] * C, v = vs[j]; for (let c = 0; c < C; c++) acc[c] += v * dense[off + c]; }
    const dv = (G[k][8] || '').toLowerCase();
    for (let c = 0; c < C; c++) if (acc[c] >= SIM && devs[c] !== dv && (isSoon || QABS[k] > QABS[cand[c]])) { if (isSoon) soonCopies[c]++; else copies[c].push(k); } } };
  scan(news, false); scan(soons, true);
  const scaleN = newAll.length / Math.max(1, news.length), scaleS = soonAll.length / Math.max(1, soons.length);
  const rows = cand.map((k, c) => ({k, n: Math.round(copies[c].length * scaleN), soon: Math.round(soonCopies[c] * scaleS),
      list: copies[c].sort((a, b) => G[b][6] - G[a][6])}))
    .filter(r => r.n > 0).sort((a, b) => b.n - a.n || G[b.k][6] - G[a.k][6]);
  const res = {rows, nNew: newAll.length, nSoon: soonAll.length, sampled: news.length < newAll.length || soons.length < soonAll.length, nCand: C};
  copyCache.set(key, res);
  return res;
}
function renderCopies(M, tq) {
  const key = [dd.tags.join('|'), dd.kw, dd.core].join('~');
  if (!dd.rise || dd.rise.key !== key) dd.rise = {key, q: tq != null ? tq : QLABELS.length - 8, open: null};
  const riseQ = Q0 + dd.rise.q;
  $('ddRise').innerHTML = QLABELS.map((l, i) => i >= 4 ? `<option value="${i}"${i === dd.rise.q ? ' selected' : ''}>${l}${i === tq ? ' (take-off)' : ''}</option>` : '').join('');
  $('ddRise').onchange = () => { dd.rise.q = +$('ddRise').value; dd.rise.open = null; renderCopies(M, tq); };
  $('ddAdult').checked = !!dd.adult;
  $('ddAdult').onchange = () => { dd.adult = $('ddAdult').checked; dd.rise.open = null; renderCopies(M, tq); };
  const t0 = performance.now(), r = copyAnalysis(M, riseQ, !!dd.adult);
  $('ddCopyNote').textContent = `${int(r.nNew)} theme games released since ${QLABELS[dd.rise.q]} (+${int(r.nSoon)} coming soon), checked against ${int(r.nCand)} hits from ${qlabel(riseQ - LOOKBACK)}–${qlabel(riseQ + 2)}` +
    (r.sampled ? `; counts estimated from a sample of ${int(MAX_NEW)}` : '') + ` · ${Math.round(performance.now() - t0)} ms`;
  if (!r.nNew) { $('ddCopies').innerHTML = `<tr><td class="empty">No theme games released since ${QLABELS[dd.rise.q]}. Pick an earlier quarter.</td></tr>`; return; }
  if (!r.rows.length) { $('ddCopies').innerHTML = '<tr><td class="empty">None of the theme\'s new games closely copies a hit from that period.</td></tr>'; return; }
  const gl = k => `${link(G[k][0], G[k][1])} <span class="small">${int(G[k][6])}</span>`;
  $('ddCopies').innerHTML = `<thead><tr><th>#</th><th>Hit</th><th>Released</th><th class="num">Reviews</th><th class="num">Copies since ${QLABELS[dd.rise.q]}</th><th class="num">Coming soon</th><th>Most-reviewed copies</th></tr></thead><tbody>` +
    r.rows.slice(0, 25).map((x, i) => { const g = G[x.k], c = O && O.curves[g[0]], open = dd.rise.open === g[0];
      return `<tr class="click${open ? ' sel' : ''}" data-id="${g[0]}"><td class="small">${i + 1}</td>
        <td class="wrap">${link(g[0], g[1])}<div class="tag-mini">${esc(g[8])} · ${esc(topTags(g))}</div>${c ? `<button class="mini" data-w="${g[0]}">wave ×${fmt(c.lift, 1)}</button>` : ''}</td>
        <td>${iso(g[2]).slice(0, 7)}</td><td class="num">${int(g[6])}</td>
        <td class="num"><b>${int(x.n)}</b> <span class="small">${fmt(x.n / r.nNew * 100, 0)}%</span></td><td class="num">${x.soon ? int(x.soon) : '<span class="small">–</span>'}</td>
        <td class="wrap small">${x.list.slice(0, 3).map(gl).join('<br>')}</td></tr>` +
        (open ? `<tr><td></td><td colspan="6"><div class="tablewrap" style="max-height:260px"><table>${gameTable(x.list.slice(0, 60))}</table></div>${x.list.length > 60 ? `<p class="small">Showing 60 of ${int(x.list.length)}.</p>` : ''}</td></tr>` : ''); }).join('') + '</tbody>';
  $('ddCopies').onclick = e => {
    if (e.target.dataset.w) { showWave(+e.target.dataset.w, true); return; }
    const tr = e.target.closest('tr.click'); if (!tr || e.target.tagName === 'A') return;
    dd.rise.open = dd.rise.open === +tr.dataset.id ? null : +tr.dataset.id; renderCopies(M, tq); };
}
function renderDD() {
  $('ddChips').innerHTML = dd.tags.map(t => `<span class="chip"><span class="lbl">${esc(t)}</span><button data-x="${esc(t)}" aria-label="Remove">×</button></span>`).join('');
  const rx = kwRegex(dd.kw);
  if (rx === undefined) { $('ddBody').innerHTML = '<div class="empty">Invalid regex.</div>'; return; }
  if (!dd.tags.length && !dd.kw) { $('ddBody').innerHTML = '<div class="empty">Pick a tag, type a keyword, or click a row in the rising table.</div>'; return; }
  const [anyM, coreM] = theme(dd.tags, dd.kw);
  const hasCore = dd.tags.length > 0, M = dd.core && hasCore ? coreM : anyM;
  const label = [dd.tags.join(' + '), dd.kw && `/${dd.kw}/`].filter(Boolean).join(' & ') + (dd.core && hasCore ? ' (core)' : '');
  const idx = []; G.forEach((g, k) => { if (M[k]) idx.push(k); });
  const rel = idx.filter(k => REL[k]), soon = idx.filter(k => G[k][4]);
  const ytdNow = rel.filter(k => YEAR[k] === cy && YTD[k]).length, ytdPrev = rel.filter(k => YEAR[k] === cy - 1 && YTD[k]).length;
  const nI = D.years.length - 1, sNow = ytdNow / D.ytd_totals[nI] * 100, sPrev = ytdPrev / D.ytd_totals[nI - 1] * 100;
  const relAny = rel.filter(k => anyM[k]).length;
  const coreShare = hasCore ? rel.filter(k => coreM[k]).length / Math.max(1, relAny) * 100 : null;
  const revs = rel.filter(k => YEAR[k] < cy).map(k => G[k][6]).sort((a, b) => a - b);
  const med = revs.length ? revs[Math.floor(revs.length / 2)] : 0;
  const soonShare = soon.length / Math.max(1, D.coming_soon_total) * 100;
  const kp = [
    [int(rel.length), `released ${D.start_year}–${cy}`],
    [`${int(ytdNow)} <span class="small">(was ${int(ytdPrev)})</span>`, `released ${D.ytd_label}, ${cy} vs ${cy - 1}`],
    [`${fmt(sNow)}% <span class="${sNow >= sPrev ? 'up' : 'down'} small">${sPrev ? '×' + fmt(sNow / sPrev) : 'new'}</span>`, `share of ${cy} releases (was ${fmt(sPrev)}%)`],
    [`${fmt(soonShare)}%`, `share of coming-soon games (${int(soon.length)})`],
    [int(med), `median reviews (released before ${cy})`],
  ];
  if (hasCore) kp.push([`${fmt(coreShare, 0)}%`, 'of tagged games have it as a core (top-5) tag']);
  const sA = shareSeries(anyM, dd.gran), sC = hasCore ? shareSeries(coreM, dd.gran) : null;
  const sQ = shareSeries(M, 'quarter'), tq = takeoff(sQ.values, sQ.counts);
  $('ddBody').innerHTML = `<div class="kpis">${kp.map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <h3>Share of releases: ${esc(label)}</h3>
    <div class="controls"><span class="seg" id="ddGran">${[['year', 'By year'], ['ytd', 'Year, same dates'], ['quarter', 'By quarter']].map(([g, l]) => `<button data-g="${g}" class="${dd.gran === g ? 'on' : ''}">${l}</button>`).join('')}</span>
    <span class="small">${tq != null ? `Take-off detected around <b>${QLABELS[tq]}</b>: the rolling quarterly share passed 1.5× its prior 2-year level and stayed up.` : 'No sustained take-off detected in the quarterly share.'}</span></div>
    <div class="legend"><span><i style="background:var(--s1)"></i>${hasCore ? 'Tagged anywhere' : 'Keyword match'}${dd.kw && hasCore ? ' + keyword' : ''}</span>${hasCore ? '<span><i style="background:var(--s2)"></i>Core (top-5 tag)</span>' : ''}${tq != null && dd.gran === 'quarter' ? '<span><i class="dash"></i>take-off</span>' : ''}</div>
    <div class="chart" id="ddShare"></div>
    <h3>Hits over time: each dot is a game, height = reviews (log scale)</h3>
    <p class="small">A trend usually looks like one or two big hits, then a growing crowd of smaller look-alikes 1–3 years later. Orange dots have a follower-wave analysis. Click any dot to open it.</p>
    <div class="chart" id="ddScatter"></div>
    <h3>What the theme's new games copy</h3>
    <p class="small">Hits from the 3 years before the rise (≥${int(CAND_REVIEWS)} reviews, any tags), ranked by how many of the theme's games released since then closely match their tag profile (similarity ≥ ${SIM}, other developers). A hit doesn't need the theme's own tags: Balatro isn't tagged Poker, but many 2026 Poker games copy it. Click a row to list its copies.</p>
    <div class="controls"><label class="small">Rise starting <select id="ddRise"></select></label>
      <label class="small"><input type="checkbox" id="ddAdult"> include adult games as hits</label>
      <span class="small" id="ddCopyNote"></span></div>
    <div class="tablewrap"><table id="ddCopies"></table></div>
    <div class="grid2">
      <div><h3>Games</h3>
        <div class="controls"><span class="seg" id="ddSort">${[['reviews', 'Most reviewed'], ['new', 'Newest'], ['soon', 'Coming soon']].map(([s, l]) => `<button data-s="${s}" class="${dd.sort === s ? 'on' : ''}">${l}</button>`).join('')}</span><span class="small" id="ddCount"></span></div>
        <div class="tablewrap"><table id="ddGames"></table></div></div>
      <div><h3>Likely trend-setters</h3>
        <p class="small">The theme's most-reviewed games released ${tq != null ? `up to the take-off (${QLABELS[tq]})` : 'so far'}. "Wave" = how much more common close look-alikes became 1–3 years after it came out (games with ≥${O ? int(O.min_reviews) : '–'} reviews only). Click a row for the detail.</p>
        <div class="tablewrap"><table id="ddSetters"></table></div></div>
    </div>
    <div class="grid2">
      <div><h3>By year</h3><div class="tablewrap"><table id="ddYears"></table></div></div>
      <div><h3>Related tags</h3>
        <div class="controls"><span class="seg" id="ddRel">${[['distinct', 'Most distinctive'], ['rising', 'Rising within theme']].map(([s, l]) => `<button data-r="${s}" class="${dd.rel === s ? 'on' : ''}">${l}</button>`).join('')}</span><span class="small">Click to add to the theme.</span></div>
        <div class="tablewrap"><table id="ddRelated"></table></div></div>
    </div>`;
  $('ddGran').onclick = e => { if (e.target.dataset.g) { dd.gran = e.target.dataset.g; renderDD(); } };
  $('ddSort').onclick = e => { if (e.target.dataset.s) { dd.sort = e.target.dataset.s; renderDD(); } };
  $('ddRel').onclick = e => { if (e.target.dataset.r) { dd.rel = e.target.dataset.r; renderDD(); } };
  const series = [{label: hasCore ? 'Tagged anywhere' : 'Keyword match', values: sA.values, color: 'var(--s1)'}];
  if (sC) series.push({label: 'Core (top-5)', values: sC.values, color: 'var(--s2)'});
  lineChart($('ddShare'), {labels: sA.labels, series, markers: tq != null && dd.gran === 'quarter' ? [{i: tq, label: 'take-off'}] : []});
  // scatter of hits (pre-start-year games are only embedded if popular)
  const relQ = idx.filter(k => !G[k][4] && G[k][2] != null && G[k][6] >= 10);
  const SQ0 = Math.min(Q0, ...relQ.map(k => QABS[k]));
  const sl = []; for (let q = SQ0; q <= QN; q++) sl.push(q % 4 === 0 ? String(Math.floor(q / 4)) : '');
  const pts = relQ.map(k => { const g = G[k], d = dayToDate(g[2]), hasW = !!(O && O.curves[g[0]]);
    return {x: QABS[k] - SQ0 + ((d.getUTCMonth() % 3) + d.getUTCDate() / 31) / 3 - 0.5, v: g[6], label: g[1], id: g[0],
      sub: `${iso(g[2])} · ${int(g[6])} reviews · ${g[7]}% positive`, big: hasW, color: hasW ? 'var(--s2)' : 'var(--s1)'}; });
  scatterChart($('ddScatter'), {labels: sl, points: pts, onClick: p => showWave(p.id, true), markers: tq != null ? [{i: Q0 + tq - SQ0, label: 'take-off'}] : []});
  renderCopies(M, tq);
  let list = dd.sort === 'soon' ? soon : idx.filter(k => !G[k][4]);
  list = list.slice().sort(dd.sort === 'reviews' ? (a, b) => G[b][6] - G[a][6] : (a, b) => (G[b][2] ?? -1e9) - (G[a][2] ?? -1e9));
  $('ddCount').textContent = `${int(list.length)} games, showing ${Math.min(150, list.length)}`;
  $('ddGames').innerHTML = gameTable(list.slice(0, 150));
  const cutQ = tq != null ? Q0 + tq : QN + 1;
  const cand = idx.filter(k => !G[k][4] && G[k][2] != null && QABS[k] <= cutQ && G[k][6] >= 200).sort((a, b) => G[b][6] - G[a][6]).slice(0, 40);
  $('ddSetters').innerHTML = `<thead><tr><th>Game</th><th>Released</th><th class="num">Reviews</th><th class="num">Wave</th></tr></thead><tbody>` +
    (cand.length ? cand.map(k => { const g = G[k], c = O && O.curves[g[0]];
      return `<tr class="click" data-id="${g[0]}"><td class="wrap">${link(g[0], g[1])}<div class="tag-mini">${esc(g[8])}</div></td><td>${iso(g[2])}</td><td class="num">${int(g[6])}</td>
        <td class="num">${c && c.lift != null ? `<span class="${c.lift >= 2 ? 'up' : ''}">×${fmt(c.lift, 1)}</span> <span class="small">${int(c.n_after)}</span>` : '<span class="small">–</span>'}</td></tr>`; }).join('')
      : '<tr><td colspan="4" class="empty">No games with 200+ reviews before the take-off.</td></tr>') + '</tbody>';
  $('ddSetters').onclick = e => { const tr = e.target.closest('tr.click'); if (tr && e.target.tagName !== 'A') showWave(+tr.dataset.id, true); };
  $('ddYears').innerHTML = `<thead><tr><th>Year</th><th class="num">Games</th><th class="num">Share</th>${hasCore ? '<th class="num">Core</th><th class="num">Core share</th>' : ''}<th>Top games (reviews)</th></tr></thead><tbody>` +
    D.years.slice().reverse().map(y => { const yi = y - D.start_year, ks = rel.filter(k => YEAR[k] === y && anyM[k]);
      const nc = ks.filter(k => coreM[k]).length, tot = D.year_totals[yi];
      const best = ks.sort((a, b) => G[b][6] - G[a][6]).slice(0, 3).map(k => link(G[k][0], G[k][1]) + ` <span class="small">${int(G[k][6])}</span>`).join('<br>');
      return `<tr><td>${y}${y === cy ? '*' : ''}</td><td class="num">${int(ks.length)}</td><td class="num">${fmt(ks.length / tot * 100)}%</td>${hasCore ? `<td class="num">${int(nc)}</td><td class="num">${fmt(nc / tot * 100)}%</td>` : ''}<td class="wrap">${best}</td></tr>`; }).join('') + '</tbody>';
  const cnt = new Array(D.tags.length).fill(0), recent = new Array(D.tags.length).fill(0), older = new Array(D.tags.length).fill(0);
  const recentCut = QN - 3; let nRecent = 0, nOlder = 0;
  for (const k of rel) { const isR = QABS[k] >= recentCut; isR ? nRecent++ : nOlder++; for (const t of G[k][5]) { cnt[t]++; isR ? recent[t]++ : older[t]++; } }
  const sel = new Set(dd.tags.map(t => TAGIX[t]));
  let rows = D.tags.map((t, i) => ({t, i, n: cnt[i], inS: cnt[i] / Math.max(1, rel.length) * 100, lift: (cnt[i] / Math.max(1, rel.length)) / Math.max(1e-9, TAGTOT[i] / nReleased),
    rS: recent[i] / Math.max(1, nRecent) * 100, oS: older[i] / Math.max(1, nOlder) * 100})).filter(r => !sel.has(r.i) && r.n >= 5);
  rows = dd.rel === 'distinct' ? rows.filter(r => r.lift >= 1.3).sort((a, b) => b.n * Math.log(b.lift) - a.n * Math.log(a.lift))
    : rows.filter(r => recent[r.i] >= 5).sort((a, b) => (b.rS - b.oS) - (a.rS - a.oS));
  $('ddRelated').innerHTML = `<thead><tr><th>Tag</th><th class="num">% of theme</th><th class="num">vs all games</th><th class="num">Last 12 mo</th><th class="num">Before</th></tr></thead><tbody>` +
    rows.slice(0, 30).map(r => `<tr class="click" data-t="${esc(r.t)}"><td>${esc(r.t)}</td><td class="num">${fmt(r.inS, 1)}%</td><td class="num">×${fmt(r.lift, 1)}</td><td class="num">${fmt(r.rS, 1)}%</td><td class="num">${fmt(r.oS, 1)}%</td></tr>`).join('') + '</tbody>';
  $('ddRelated').onclick = e => { const tr = e.target.closest('tr.click'); if (tr) { dd.tags.push(tr.dataset.t); renderDD(); } };
}
function gameTable(ks) {
  return `<thead><tr><th>Game</th><th>Released</th><th class="num">Reviews</th><th>Top tags</th></tr></thead><tbody>` +
    ks.map(k => { const g = G[k]; return `<tr><td class="wrap">${link(g[0], g[1])}${g[4] ? ' <span class="pill">coming soon</span>' : ''}${g[3] ? ' <span class="pill">EA</span>' : ''}<div class="tag-mini">${esc(g[8])}</div></td>
      <td>${iso(g[2])}</td><td class="num">${int(g[6])}${g[6] ? ` <span class="small">${g[7]}%</span>` : ''}</td><td class="tag-mini wrap">${esc(topTags(g))}</td></tr>`; }).join('') + '</tbody>';
}

// ---------- trend-setters
function showWave(id, scroll) {
  const k = BYID.get(id), g = G[k], c = O && O.curves[id];
  document.querySelectorAll('#setTable tr.sel').forEach(r => r.classList.remove('sel'));
  const row = document.querySelector(`#setTable tr[data-id="${id}"]`); if (row) row.classList.add('sel');
  if (scroll) $('setters').scrollIntoView({behavior: 'smooth'});
  if (!c) { $('wave').innerHTML = `<div class="empty">${g ? esc(g[1]) + ' has' : 'This game has'} fewer than ${O ? int(O.min_reviews) : 'the threshold of'} reviews, so it has no wave analysis.</div>`; return; }
  const rq = O.quarters.indexOf(qlabel(QABS[k]));
  $('wave').innerHTML = `<h3 style="margin-top:0">${link(id, g[1])} <span class="small">${esc(g[8])} · ${iso(g[2])} · ${int(g[6])} reviews</span></h3>
    <div class="tag-mini">${esc(g[5].slice(0, 8).map(i => D.tags[i]).join(', '))}</div>
    <div class="kpis"><div class="kpi"><b>×${c.lift != null ? fmt(c.lift, 1) : '–'}</b><span>wave lift${c.complete ? '' : ' (window not complete yet)'}</span></div>
    <div class="kpi"><b>${c.before != null ? fmt(c.before) : '–'}% → ${c.after != null ? fmt(c.after) : '–'}%</b><span>look-alike share: 2y before → 1–3y after</span></div>
    <div class="kpi"><b>${int(c.n_after)}</b><span>look-alikes released since</span></div></div>
    <p class="small">Share of all releases each quarter that closely match its tag profile (similarity ≥ ${O.sim}) and are by other developers.</p>
    <div class="chart" id="waveChart"></div>
    <h3>Most-reviewed look-alikes released after it</h3><div class="tablewrap" style="max-height:300px"><table><thead><tr><th>Game</th><th>Released</th><th class="num">Reviews</th></tr></thead><tbody>${
      c.followers.map(f => { const x = G[BYID.get(f)];
        return x ? `<tr><td class="wrap">${link(f, x[1])}<div class="tag-mini">${esc(x[8])}</div></td><td>${iso(x[2])}</td><td class="num">${int(x[6])}</td></tr>` : `<tr><td>${link(f, 'app ' + f)}</td><td></td><td></td></tr>`; }).join('')}</tbody></table></div>`;
  lineChart($('waveChart'), {labels: O.quarters, series: [{label: 'Look-alikes', values: c.share, color: 'var(--s2)'}], markers: rq >= 0 ? [{i: rq, label: 'released'}] : [], H: 220});
}
if (O) {
  $('setNote').textContent = `Every game with ≥${int(O.min_reviews)} reviews, ranked by how much more common close look-alikes (by other developers) became in the 1–3 years after it came out, compared with the 2 years before. ` +
    `This is correlation, not proof: a hit can also ride a wave that was already starting. Look for a rise that begins after the release line.`;
  const ranked = O.ranking.map(id => BYID.get(id)).filter(k => k !== undefined);
  const yrs = [...new Set(ranked.map(k => YEAR[k]))].sort((a, b) => b - a);
  $('setYear').innerHTML = '<option value="">Any year</option>' + yrs.map(y => `<option>${y}</option>`).join('');
  const renderSet = () => { const y = +$('setYear').value, f = $('setFilter').value.trim().toLowerCase();
    const rows = ranked.filter(k => (!y || YEAR[k] === y) && (!f || G[k][1].toLowerCase().includes(f) || G[k][5].some(t => D.tags[t].toLowerCase().includes(f))));
    $('setTable').innerHTML = `<thead><tr><th>#</th><th>Game</th><th>Released</th><th class="num">Reviews</th><th class="num">Wave</th></tr></thead><tbody>` +
      rows.slice(0, 200).map((k, i) => { const g = G[k], c = O.curves[g[0]]; return `<tr class="click" data-id="${g[0]}"><td class="small">${i + 1}</td><td class="wrap">${esc(g[1])}<div class="tag-mini">${esc(topTags(g))}</div></td><td>${iso(g[2]).slice(0, 7)}</td><td class="num">${int(g[6])}</td><td class="num">×${fmt(c.lift, 1)} <span class="small">${int(c.n_after)}</span></td></tr>`; }).join('') + '</tbody>'; };
  $('setYear').onchange = renderSet; $('setFilter').oninput = renderSet;
  $('setTable').onclick = e => { const tr = e.target.closest('tr.click'); if (tr) showWave(+tr.dataset.id, false); };
  renderSet();
} else {
  $('setNote').textContent = 'Run steam_trends_origins.py, then rebuild the dashboard, to enable this section.';
}

// ---------- compare
let cmp = [], cmpGran = 'year';
function cmpValues(s) {
  if (s.kind === 'tag') { const m = cmpGran === 'year' ? D.share_year : cmpGran === 'ytd' ? D.share_ytd : D.share_quarter; return m[s.label] || []; }
  const rx = kwRegex(s.label), mask = new Uint8Array(G.length);
  G.forEach((g, k) => { if (rx.test(g[1]) || rx.test(g[9])) mask[k] = 1; });
  if (cmpGran === 'quarter') { const all = shareSeries(mask, 'quarter'), off = QLABELS.indexOf(D.quarters[0]); return all.values.slice(off, off + D.quarters.length); }
  return shareSeries(mask, cmpGran).values;
}
const cmpName = s => s.kind === 'kw' ? '/' + s.label + '/' : s.label;
function renderCmp() {
  $('cmpChips').innerHTML = cmp.map(s => `<span class="chip"><i style="background:var(--s${s.slot})"></i><span class="lbl" data-key="${esc(s.key)}">${esc(cmpName(s))}</span><button data-x="${esc(s.key)}" aria-label="Remove">×</button></span>`).join('');
  const labels = cmpGran === 'quarter' ? D.quarters : D.years.map(y => cmpGran === 'year' && y === cy ? `${y}*` : String(y));
  lineChart($('cmpChart'), {labels, series: cmp.map(s => ({label: cmpName(s), values: cmpValues(s), color: `var(--s${s.slot})`})), empty: 'Add a tag or keyword above', H: 320});
  $('cmpNote').textContent = cmpGran === 'year' ? `* ${cy} is partial (${D.ytd_label}); use "Year, same dates" for a strict like-for-like.` : cmpGran === 'ytd' ? `Each year counts releases from ${D.ytd_label} only.` : 'Last 2 years by quarter; the latest quarter may be partial.';
}
function cmpAdd(kind, label) {
  const key = kind + ':' + label; if (cmp.some(s => s.key === key)) return;
  if (kind === 'tag' && !(label in TAGIX)) return; if (kind === 'kw' && !kwRegex(label)) return;
  const slot = [1, 2, 3, 4, 5, 6, 7, 8].find(s => !cmp.some(x => x.slot === s)); if (!slot) return;
  cmp.push({key, kind, label, slot}); renderCmp();
}
$('cmpAdd').onclick = () => { const t = $('cmpTag').value.trim(), k = $('cmpKw').value.trim(); if (t) cmpAdd('tag', t); if (k) cmpAdd('kw', k); $('cmpTag').value = $('cmpKw').value = ''; };
$('cmpTag').onkeydown = $('cmpKw').onkeydown = e => { if (e.key === 'Enter') $('cmpAdd').click(); };
$('cmpChips').onclick = e => {
  if (e.target.dataset.x) { cmp = cmp.filter(s => s.key !== e.target.dataset.x); renderCmp(); return; }
  const s = cmp.find(s => s.key === e.target.dataset.key);
  if (s) { s.kind === 'tag' ? ddSet([s.label], '') : ddSet([], s.label); $('dd').scrollIntoView({behavior: 'smooth'}); }
};
$('cmpGran').onclick = e => { if (e.target.dataset.g) { cmpGran = e.target.dataset.g; $('cmpGran').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target)); renderCmp(); } };

// ---------- leading indicator
$('leadNote').textContent = `${int(D.coming_soon_total)} games are listed as coming soon. Tags with a much bigger share among them than among ${cy} releases may be next to rise. Many announced games never launch, so treat this as noisy. Click a row to deep-dive.`;
$('leadTable').innerHTML = `<thead><tr><th>Tag</th><th class="num">Coming-soon games</th><th class="num">Share coming soon</th><th class="num">Share ${cy} released</th><th class="num">Ratio</th></tr></thead><tbody>` +
  D.coming_soon_lead.map(r => `<tr class="click" data-k="${esc(r[0])}"><td>${esc(r[0])}</td><td class="num">${int(r[1])}</td><td class="num">${fmt(r[2])}%</td><td class="num">${fmt(r[3])}%</td><td class="num">×${r[3] ? fmt(r[2] / r[3]) : '–'}</td></tr>`).join('') + '</tbody>';
$('leadTable').onclick = e => { const tr = e.target.closest('tr.click'); if (tr) { ddSet([tr.dataset.k]); $('dd').scrollIntoView({behavior: 'smooth'}); } };

// ---------- init
renderRise();
const first = D.rising[$('risePeriod').value];
if (first && first.rows.length) { ddSet([first.rows[0][0]]); first.rows.slice(0, 3).forEach(r => cmpAdd('tag', r[0])); }
renderCmp();
let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { renderDD(); renderCmp(); }, 200); });
window.__dash = {ddSet, showWave, cmpAdd};  // handy for poking at it from the console
}).catch(e => { $('loading').textContent = 'Could not load data: ' + e + '. Use a current version of Chrome, Edge, Firefox or Safari.'; console.error(e); });
</script>
</body>
</html>
"""


def main():
    with open(SRC, encoding="utf-8") as f:
        data = {"a": json.load(f), "o": None}
    from steam_trends_origins import ADULT, NON_CONTENT  # same fingerprint rules as the CLI
    data["f"] = {"non_content": sorted(NON_CONTENT), "adult": sorted(ADULT), "sim": 0.6}
    if os.path.exists(ORIG):
        with open(ORIG, encoding="utf-8") as f:
            data["o"] = json.load(f)
    else:
        print("(no output/origins.json: run steam_trends_origins.py for the trend-setters section)")
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    blob = base64.b64encode(gzip.compress(raw, 9)).decode("ascii")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(TEMPLATE.replace("__DATA__", blob))
    print(f"Wrote {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB; {len(raw) / 1e6:.0f} MB of data unpacked). "
          "Open it in any browser.")


if __name__ == "__main__":
    main()
