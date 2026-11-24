// Game page: details, then tools for tracing where the game sits in its trend: similar games on
// a timeline, the follower wave after its release, likely trend-setters, look-alikes, why two
// games are similar, and an expandable influence graph. Everything follows the page's date
// range (each section can override it) and the similarity settings in the bar.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import GameControls from '../components/game/GameControls';
import Influence from '../components/game/Influence';
import LensPanel from '../components/game/LensPanel';
import Lineage from '../components/game/Lineage';
import LookAlikes from '../components/game/LookAlikes';
import GameSetters from '../components/game/GameSetters';
import Summary from '../components/game/Summary';
import WaveChart from '../components/game/WaveChart';
import WhySimilar from '../components/game/WhySimilar';
import { GlobalRangeBar } from '../components/RangeControls';
import type { Game } from '../lib/api';
import { useMeta, useTags } from '../lib/data';
import { fmtDate, fmtInt, fmtPrice, ratingTone, steamUrl } from '../lib/format';
import { clusterTakeoff, countsMap, totalsByQ, verdict, wave, type Nb } from '../lib/lineage';
import { isActive } from '../lib/lens';
import { dateToQ } from '../lib/trends';
import { useLink } from '../lib/url';
import { useGame, useGameSettings, useLens, useNeighbors } from '../state/game';
import { RangeScope } from '../state/range';
import { useAxis, useQuarterTotals } from '../state/theme';

/** The page's own game as a similar-games row (similarity 1). */
const selfNb = (g: Game): Nb => ({
  appid: g.appid, name: g.name, date: g.release_date, q: g.release_q, soon: g.coming_soon, reviews: g.reviews,
  pct: g.pct_positive, dev: g.developer, tags: g.tag_ids.slice(0, 8), sim: 1, ts: 1, xs: 1,
});

function Header({ g }: { g: Game }) {
  const link = useLink();
  const { byId } = useTags();
  const tone = ratingTone(g.pct_positive, g.reviews);
  const top = Math.max(1, ...g.tag_w);
  return (
    <>
      <div className="game-head">
        {g.header_image && <img className="game-capsule" src={g.header_image} alt="" width={460} height={215} />}
        <div className="game-info">
          <h1>{g.name}</h1>
          <dl className="facts">
            <dt>Developer</dt><dd>{g.developer || '–'}</dd>
            <dt>Publisher</dt><dd>{g.publisher || '–'}</dd>
            <dt>Released</dt><dd>{fmtDate(g.release_date, g.coming_soon)}{g.early_access && ' · Early Access'}</dd>
            <dt>Price</dt><dd>{fmtPrice(g.price_gbp, g.is_free)}</dd>
            <dt>Reviews</dt>
            <dd>
              {fmtInt(g.reviews)}
              {g.reviews > 0 && <span className={`tone-${tone}`}> · {g.pct_positive}% positive</span>}
            </dd>
          </dl>
          <p className="muted">{g.short_description}</p>
          <a href={steamUrl(g.appid)} target="_blank" rel="noreferrer">View on Steam ↗</a>
        </div>
      </div>
      <div className="tag-row" aria-label="Tags, by votes">
        {g.tag_ids.map((id, i) => {
          const w = (g.tag_w[i] ?? 0) / top;
          return (
            <Link key={id} className="chip wchip" to={link('/search', { tab: 'tags', tags: String(id) })}
                  title={`${byId.get(id)?.name ?? id}: weight ${g.tag_w[i]} of 100. Open in the Tags tab.`}>
              {byId.get(id)?.name ?? id}
              <i className="wbar" style={{ width: `${Math.max(8, w * 100)}%` }} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Tools({ g }: { g: Game }) {
  const s0 = useGameSettings();
  const meta = useMeta();
  const { dataQ, firstQ } = useAxis();
  const totals = useQuarterTotals();
  const [lens, setLens] = useLens();
  const nb = useNeighbors(g.appid, s0, lens);
  const info = nb.data?.lens;
  const lensOn = isActive(lens);
  // With examples and no similarity in the URL, the lens picks its own cut-off: show and use that one.
  const s = useMemo(() => (info && !s0.simSet && lens.like.length ? { ...s0, minSim: info.minSim } : s0), [s0, info, lens.like.length]);
  const examples = useMemo(() => new Set(lensOn ? lens.like : []), [lensOn, lens.like]);
  const [why, setWhy] = useState<Nb | null>(null);
  const self = useMemo(() => selfNb(g), [g]);
  const dataDate = meta.data?.fetched_to ?? '9999-12-31';

  const tot = useMemo(() => (totals.data ? totalsByQ(totals.data) : null), [totals.data]);
  const tq = useMemo(() => (nb.data && tot && dataQ != null ? clusterTakeoff(countsMap(nb.data.counts, false), tot, firstQ, dataQ) : null),
    [nb.data, tot, dataQ, firstQ]);
  const hq = g.release_date && !g.coming_soon && g.release_date <= dataDate ? dateToQ(g.release_date) : null;
  const w = useMemo(() => (nb.data && tot && dataQ != null && hq != null
    ? wave(countsMap(nb.data.counts, true), tot, hq, firstQ, dataQ, s.wave) : null), [nb.data, tot, dataQ, firstQ, hq, s.wave]);
  const v = hq == null ? 'unknown' : verdict(w, tq);

  return (
    <>
      <div className="game-bar panel">
        <GameControls s={s} />
        <GlobalRangeBar />
      </div>
      <LensPanel anchor={g.appid} name={g.name} lens={lens} setLens={setLens} nb={nb} />
      <Summary nb={nb} self={self} w={w} tq={tq} verdict={v} released={hq != null} dataDate={dataDate} s={s} lens={lensOn} />
      <Lineage nb={nb} self={self} dataDate={dataDate} onPick={setWhy} examples={examples} lens={lensOn} />
      <div className="tags-grid even">
        <WaveChart w={w} nb={nb} self={self} tq={tq} s={s} lens={lensOn} />
        <GameSetters nb={nb} self={self} selfWave={w} tq={tq} s={s} tot={tot} dataDate={dataDate} onPick={setWhy} lens={lensOn} />
      </div>
      <LookAlikes nb={nb} self={self} dataDate={dataDate} onPick={setWhy} lens={lens} setLens={setLens} />
      <Influence nb={nb} self={self} s={s} dataDate={dataDate} lensKey={lensOn ? JSON.stringify([lens.like, lens.not, [...lens.tw]]) : ''} />
      {why && <WhySimilar a={g} b={why} wText={s.wText} lens={lensOn ? info?.tags : undefined} onClose={() => setWhy(null)} />}
    </>
  );
}

export default function GamePage() {
  const raw = useParams().appid ?? '';
  const appid = Number(raw);
  const q = useGame(appid);

  if (q.isLoading) return <div className="page muted">Loading…</div>;
  if (q.error) return <div className="page"><div className="banner error">{q.error.message}</div></div>;
  const g = q.data;
  if (!g) return <div className="page"><div className="empty">No game with id {raw}.</div></div>;

  return (
    <RangeScope key={g.appid}>
      <div className="page game-page">
        <Header g={g} />
        <Tools g={g} />
      </div>
    </RangeScope>
  );
}
