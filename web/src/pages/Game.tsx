// Game page: details and tags now; trend-tracing tools arrive in milestone 5.
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { configured, fetchGame } from '../lib/api';
import { useTags } from '../lib/data';
import { fmtDate, fmtInt, fmtPrice, ratingTone, steamUrl } from '../lib/format';
import { useLink } from '../lib/url';

export default function GamePage() {
  const raw = useParams().appid ?? '';
  const appid = Number(raw);
  const link = useLink();
  const { byId } = useTags();
  const q = useQuery({
    queryKey: ['game', appid],
    queryFn: () => fetchGame(appid),
    enabled: configured && Number.isInteger(appid),
  });

  if (q.isLoading) return <div className="page muted">Loading…</div>;
  if (q.error) return <div className="page"><div className="banner error">{q.error.message}</div></div>;
  const g = q.data;
  if (!g) return <div className="page"><div className="empty">No game with id {raw}.</div></div>;

  const tone = ratingTone(g.pct_positive, g.reviews);
  return (
    <div className="page">
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
      <div className="tag-row">
        {g.tag_ids.map((id, i) => (
          <Link key={id} className="chip" to={link('/search', { tab: 'tags', tags: String(id) })}
                title={`${g.tag_w[i]} votes`}>
            {byId.get(id)?.name ?? id}
          </Link>
        ))}
      </div>
    </div>
  );
}
