-- Steam trends: functions the web app calls (supabase.rpc(...)).
-- Every analysis function takes the global "quality floor" as jsonb, so lists, shares and
-- similarities all use the same universe of games. Big results are returned as one json
-- value, which also sidesteps PostgREST's row limit.

-- ---------------------------------------------------------------- helpers

-- The date the data describes (fetch date), so "this year so far" and the review grace
-- period don't drift when the data is a few weeks old.
create or replace function data_date() returns date
language sql stable as $$
  select coalesce((select fetched_to from meta where id = 1), current_date)
$$;

create or replace function like_escape(q text) returns text
language sql immutable as $$
  select replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Quality floor. f = {minReviews, graceDays, minPrice, excludeAdult, earlyAccess,
-- excludeTags: [tagid], minRating}. null / missing keys = no restriction.
do $$ begin
  create type floor_t as (min_reviews int, grace_days int, min_price numeric,
                          exclude_adult boolean, early_access boolean,
                          exclude_tags int[], min_rating real, grace_from date);
exception when duplicate_object then null; end $$;
-- grace_from (added later): the first release date still inside the grace period, worked
-- out once per call. Calling data_date() per row made every floored scan ~50x slower.
do $$ begin
  if not exists (select 1 from pg_attribute where attrelid = (select typrelid from pg_type where typname = 'floor_t')
                 and attname = 'grace_from') then
    alter type floor_t add attribute grace_from date;
  end if;
end $$;

create or replace function floor_of(f jsonb) returns floor_t
language sql stable as $$
  select row(
    coalesce((f->>'minReviews')::int, 0),
    coalesce((f->>'graceDays')::int, 0),
    coalesce((f->>'minPrice')::numeric, 0),
    coalesce((f->>'excludeAdult')::boolean, false),
    coalesce((f->>'earlyAccess')::boolean, true),
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(f->'excludeTags', '[]')) x), '{}'),
    coalesce((f->>'minRating')::real, 0),
    data_date() - coalesce((f->>'graceDays')::int, 0))::floor_t
$$;

-- Does a game pass the floor? Coming-soon games skip the review/price/rating rules, and
-- games released within grace_days skip the review minimum (they haven't had time).
create or replace function passes(g games, fl floor_t) returns boolean
language sql stable as $$
  select (not fl.exclude_adult or not g.is_adult)
     and (fl.early_access or not g.early_access)
     and (cardinality(fl.exclude_tags) = 0 or not (g.tag_ids && fl.exclude_tags))
     and (g.coming_soon or (
           (g.reviews >= fl.min_reviews or g.release_date > fl.grace_from)
       and (fl.min_price <= 0 or g.is_free or g.price_gbp >= fl.min_price)
       and (fl.min_rating <= 0 or g.reviews < 10 or g.pct_positive >= fl.min_rating)))
$$;

create or replace function is_released(g games) returns boolean
language sql stable as $$
  select not g.coming_soon and g.release_date is not null and g.release_date <= data_date()
$$;

-- Theme = the current search: tags (all / any, optionally only as top-5 "core" tags),
-- excluded tags, a name substring (q) and/or a regex (rx), optionally also searched in
-- descriptions.
do $$ begin
  create type theme_t as (inc int[], exc int[], match_all boolean, core boolean,
                          q text, rx text, use_desc boolean);
exception when duplicate_object then null; end $$;

create or replace function theme_of(p jsonb) returns theme_t
language sql immutable as $$
  select row(
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p->'inc', '[]')) x), '{}'),
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p->'exc', '[]')) x), '{}'),
    coalesce((p->>'matchAll')::boolean, true),
    coalesce((p->>'core')::boolean, false),
    nullif(p->>'q', ''),
    nullif(p->>'rx', ''),
    coalesce((p->>'desc')::boolean, false))::theme_t
$$;

create or replace function in_theme(g games, th theme_t, core boolean default null) returns boolean
language sql stable as $$
  select (cardinality(th.inc) = 0 or (
            case when coalesce(core, th.core)
                 then (case when th.match_all then g.tag_ids[1:5] @> th.inc else g.tag_ids[1:5] && th.inc end)
                 else (case when th.match_all then g.tag_ids @> th.inc else g.tag_ids && th.inc end) end))
     and (cardinality(th.exc) = 0 or not (g.tag_ids && th.exc))
     -- Descriptions live in game_info. An uncorrelated IN (...) is run once into a hash table;
     -- a correlated EXISTS would look each game up separately.
     and (th.q is null or g.name ilike '%' || like_escape(th.q) || '%'
          or (th.use_desc and g.appid in (select i.appid from game_info i
                                          where i.short_description ilike '%' || like_escape(th.q) || '%')))
     and (th.rx is null or g.name ~* th.rx
          or (th.use_desc and g.appid in (select i.appid from game_info i where i.short_description ~* th.rx)))
$$;

-- ---------------------------------------------------------------- search bar

-- Look-ahead: top 8 games whose name contains q (prefix matches first, then by reviews).
-- Not floored: you can always find a specific game by name.
-- Two "order by reviews desc limit 8" queries, planned with the actual pattern (execute):
-- for short or common text the planner walks the reviews index and stops after 8 hits;
-- for rare text it uses the trigram index. Sorting every match (the old single query)
-- took >10 s for two-letter input on the free tier.
create or replace function suggest(q text) returns json
language plpgsql stable as $$
declare e text := like_escape(coalesce(q, ''));
  r json;
begin
  if length(trim(coalesce(q, ''))) = 0 then return '[]'::json; end if;
  execute $s$
    with pre as (
      select appid, name, release_date, reviews, coming_soon, 1 as k
      from games where name ilike $1 || '%'
      order by reviews desc limit 8),
    sub as (
      select appid, name, release_date, reviews, coming_soon, 0 as k
      from games where name ilike '%' || $1 || '%' and not name ilike $1 || '%'
      order by reviews desc limit 8),
    top as (select * from (select * from pre union all select * from sub) u order by k desc, reviews desc limit 8)
    select coalesce(json_agg(json_build_array(appid, name, release_date, reviews, coming_soon,
                                              (select i.header_image from game_info i where i.appid = top.appid))
                             order by k desc, reviews desc), '[]')
    from top $s$ into r using e;
  return r;
end $$;

-- ---------------------------------------------------------------- games results

-- p = theme keys + {status: all|released|upcoming, from, to, minRating, priceMin, priceMax,
--      revMin, revMax, sort: reviews|rating|released|name, dir: asc|desc, limit, offset}
create or replace function search_games(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
-- Dynamic SQL so each call is planned with its real filters and sort: an unfiltered list can
-- walk the matching index and stop after one page instead of sorting every game.
-- p.count: 'both' (default) | 'none' (rows only) | 'only' (total only). The site asks for
-- rows and the total separately, so re-sorting or paging never recounts.
declare
  th theme_t := theme_of(p);
  fl floor_t := floor_of(f);
  lim int := least(greatest(coalesce((p->>'limit')::int, 100), 0), 500);
  off int := greatest(coalesce((p->>'offset')::int, 0), 0);
  dir text := case when p->>'dir' = 'asc' then 'asc' else 'desc' end;
  cnt text := coalesce(p->>'count', 'both');
  w text := 'passes(g, $2) and in_theme(g, $3)';
  src text := 'games g';
  ord text;
  total bigint;
  res json;
begin
  if p->>'status' = 'upcoming' then w := w || ' and g.coming_soon';
  elsif p->>'status' = 'released' then w := w || ' and not g.coming_soon'; end if;
  if (p->>'from') is not null then w := w || $w$ and g.release_date >= ($1->>'from')::date$w$; end if;
  if (p->>'to') is not null then w := w || $w$ and g.release_date <= ($1->>'to')::date$w$; end if;
  if (p->>'minRating') is not null then w := w || $w$ and g.rating >= ($1->>'minRating')::real$w$; end if;
  -- Under "upcoming", games with no price yet pass the price filters (like the floor's price
  -- rule); otherwise a price filter needs a known price (free counts as £0).
  if (p->>'priceMin') is not null then w := w || $w$ and (coalesce(g.price_gbp, 0) >= ($1->>'priceMin')::numeric$w$
    || case when p->>'status' = 'upcoming' then ' or (g.price_gbp is null and not g.is_free))' else ')' end; end if;
  if (p->>'priceMax') is not null then w := w || $w$ and (g.is_free or g.price_gbp <= ($1->>'priceMax')::numeric$w$
    || case when p->>'status' = 'upcoming' then ' or g.price_gbp is null)' else ')' end; end if;
  if (p->>'revMin') is not null then w := w || $w$ and g.reviews >= ($1->>'revMin')::int$w$; end if;
  if (p->>'revMax') is not null then w := w || $w$ and g.reviews <= ($1->>'revMax')::int$w$; end if;

  if cnt <> 'none' then
    execute 'select count(*) from games g where ' || w into total using p, fl, th;
  end if;
  if cnt = 'only' then return json_build_object('total', total); end if;

  -- Coming-soon games have no reviews or rating, so they sit at the far end of those indexes:
  -- walking an index to find them reads every released game first. Collect the (at most
  -- ~60k) upcoming matches, then sort them.
  if p->>'status' = 'upcoming' then
    src := '(select * from games g where ' || w || ' offset 0) g';
    w := 'true';
  end if;
  ord := case coalesce(p->>'sort', 'reviews')
    when 'name' then format('name %s, appid', dir)
    when 'rating' then format('rating %s nulls last, reviews desc, appid', dir)
    when 'released' then format('release_date %s nulls last, appid', dir)
    else format('reviews %s, appid', dir) end;
  execute format($q$
    select coalesce(json_agg(json_build_array(appid, name, release_date, coming_soon, early_access,
                                              is_free, price_gbp, reviews, pct_positive, rating,
                                              developer, (select i.header_image from game_info i where i.appid = s.appid),
                                              tags) order by %1$s), '[]')
    from (select g.appid, g.name, g.release_date, g.coming_soon, g.early_access, g.is_free, g.price_gbp,
                 g.reviews, g.pct_positive, g.rating, g.developer, g.tag_ids[1:6] as tags
          from %2$s where %3$s order by %1$s limit %4$s offset %5$s) s $q$, ord, src, w, lim, off)
    into res using p, fl, th;
  return json_build_object('total', total, 'rows', res);
end $$;

-- ---------------------------------------------------------------- shares over time
-- These are plpgsql (not plain SQL functions) so Postgres plans each call with the actual
-- theme and floor values: that lets it use the tag index and drop unused conditions,
-- which is far faster than a generic plan (forced at the end of this file).

-- "release_date + 0 <= dd" (not "release_date <= dd") when it matches nearly every game:
-- otherwise the planner walks the release-date index and reads the table in random order,
-- which is ~40x slower than a straight scan on the free tier.

-- Floored release totals per quarter, split by "same dates as this year so far" (ytd), so
-- the browser can build by-year, same-dates and by-quarter shares. [[q, ytd, n], ...]
create or replace function quarter_totals(f jsonb default null) returns json
language plpgsql stable as $$
declare fl floor_t := floor_of(f); dd date := data_date(); md text := to_char(data_date(), 'MMDD');
begin
  return (
    select coalesce(json_agg(json_build_array(q, ytd, n) order by q, ytd), '[]')
    from (select g.release_q as q, to_char(g.release_date, 'MMDD') <= md as ytd, count(*) as n
          from games g
          where not g.coming_soon and g.release_date + 0 <= dd and passes(g, fl)
          group by 1, 2) s);
end $$;

-- Theme counts per quarter: {series: [[q, ytd, n_any, n_core]], soon, soon_core}
create or replace function theme_series(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare th theme_t := theme_of(p); fl floor_t := floor_of(f); dd date := data_date(); md text := to_char(data_date(), 'MMDD');
begin
  return (
    with m as materialized (
      select g.release_q, g.release_date,
             not g.coming_soon and g.release_date <= dd as rel,
             in_theme(g, th, true) as is_core
      from games g
      where passes(g, fl) and in_theme(g, th, false)
    )
    select json_build_object(
      'series', coalesce((select json_agg(json_build_array(q, ytd, n, nc) order by q, ytd) from (
          select release_q as q, to_char(release_date, 'MMDD') <= md as ytd,
                 count(*) as n, count(*) filter (where is_core) as nc
          from m where rel group by 1, 2) s), '[]'),
      'soon', (select count(*) from m where not rel),
      'soon_core', (select count(*) from m where not rel and is_core)));
end $$;

-- Per-tag counts within the theme (or among all games when the theme is empty):
-- {cy, global: {...}, totals: {...}, rows: [[tagid, n_all, n_range, n_ytd, n_prev_ytd, n_soon]]}
-- p also takes from/to (dates) for the "in range" column.
create or replace function tag_table(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare
  th theme_t := theme_of(p); fl floor_t := floor_of(f); dd date := data_date();
  md text := to_char(data_date(), 'MMDD'); cy int := extract(year from data_date())::int;
  d0 date := coalesce((p->>'from')::date, '1990-01-01'); d1 date := coalesce((p->>'to')::date, '2100-01-01');
begin
  return (
    with base as materialized (
      select g.tag_ids, not g.coming_soon and g.release_date <= dd as rel, g.release_date,
             extract(year from g.release_date)::int as y,
             to_char(g.release_date, 'MMDD') <= md as ytd,
             in_theme(g, th) as inth
      from games g
      where passes(g, fl)
    ),
    c as (
      select bool_or(true) as x,
             count(*) filter (where rel) as n_all,
             count(*) filter (where rel and release_date between d0 and d1) as n_range,
             count(*) filter (where rel and y = cy and ytd) as n_ytd,
             count(*) filter (where rel and y = cy - 1 and ytd) as n_prev_ytd,
             count(*) filter (where not rel) as n_soon,
             count(*) filter (where inth and rel) as t_all,
             count(*) filter (where inth and rel and release_date between d0 and d1) as t_range,
             count(*) filter (where inth and rel and y = cy and ytd) as t_ytd,
             count(*) filter (where inth and rel and y = cy - 1 and ytd) as t_prev_ytd,
             count(*) filter (where inth and not rel) as t_soon
      from base
    )
    select json_build_object(
      'cy', cy,
      'global', (select json_build_object('n_all', n_all, 'n_range', n_range, 'n_ytd', n_ytd,
                                          'n_prev_ytd', n_prev_ytd, 'n_soon', n_soon) from c),
      'totals', (select json_build_object('n_all', t_all, 'n_range', t_range, 'n_ytd', t_ytd,
                                          'n_prev_ytd', t_prev_ytd, 'n_soon', t_soon) from c),
      'rows', coalesce((select json_agg(json_build_array(t, n_all, n_range, n_ytd, n_prev_ytd, n_soon)) from (
          select t,
                 count(*) filter (where rel) as n_all,
                 count(*) filter (where rel and release_date between d0 and d1) as n_range,
                 count(*) filter (where rel and y = cy and ytd) as n_ytd,
                 count(*) filter (where rel and y = cy - 1 and ytd) as n_prev_ytd,
                 count(*) filter (where not rel) as n_soon
          from base, unnest(base.tag_ids) as t
          where inth
          group by t) s), '[]')));
end $$;

-- Games of a theme for the hit timeline, top/newest/coming-soon lists and year table.
-- {n_released, n_soon, top, newest, soon}; rows are
-- [appid, name, release_date, release_q, coming_soon, early_access, reviews, pct_positive, developer, tags[1:6]]
create or replace function theme_games(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare th theme_t := theme_of(p); fl floor_t := floor_of(f); dd date := data_date();
  lim int := least(coalesce((p->>'top')::int, 3000), 5000);
begin
  return (
    with m as materialized (
      select g.appid, g.name, g.release_date, g.release_q, g.coming_soon, g.early_access, g.reviews,
             g.pct_positive, g.developer, g.tag_ids[1:6] as tags,
             not g.coming_soon and g.release_date <= dd as rel
      from games g
      where passes(g, fl) and in_theme(g, th)
    ),
    r as (select json_build_array(appid, name, release_date, release_q, coming_soon, early_access, reviews,
                                  pct_positive, developer, tags) as j, m.* from m)
    select json_build_object(
      'n_released', (select count(*) from m where rel),
      'n_soon', (select count(*) from m where not rel),
      'top', coalesce((select json_agg(j order by reviews desc) from (
          select j, reviews from r where rel order by reviews desc limit lim) s), '[]'),
      'newest', coalesce((select json_agg(j order by release_date desc) from (
          select j, release_date from r where rel order by release_date desc limit 200) s), '[]'),
      'soon', coalesce((select json_agg(j order by release_date nulls last) from (
          select j, release_date from r where not rel order by release_date nulls last limit 200) s), '[]')));
end $$;

-- Distributions within a theme: review-count buckets (half-decades of log10), rating
-- buckets (5%), price buckets (GBP) and releases per month.
create or replace function theme_dist(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare th theme_t := theme_of(p); fl floor_t := floor_of(f); dd date := data_date();
begin
  return (
    with m as materialized (
      select g.reviews, g.pct_positive, g.is_free, g.price_gbp, g.release_date
      from games g
      where not g.coming_soon and g.release_date + 0 <= dd and passes(g, fl) and in_theme(g, th)
    )
    select json_build_object(
      'reviews', (select json_agg(json_build_array(b, n) order by b) from (
          select case when reviews = 0 then -1 else floor(log(reviews::numeric) * 2)::int end as b, count(*) as n
          from m group by 1) s),
      'rating', (select json_agg(json_build_array(b, n) order by b) from (
          select floor(pct_positive / 5.0)::int * 5 as b, count(*) as n from m where reviews >= 10 group by 1) s),
      'price', (select json_agg(json_build_array(b, n) order by b) from (
          select case when is_free then -1 when price_gbp is null then -2
                      else width_bucket(price_gbp, array[0, 2, 5, 10, 15, 20, 30, 50]::numeric[]) end as b,
                 count(*) as n from m group by 1) s),
      'monthly', (select json_agg(json_build_array(mo, n) order by mo) from (
          select to_char(release_date, 'YYYY-MM') as mo, count(*) as n from m group by 1) s)));
end $$;

-- Vectors for "what the theme's new games copy". The browser does the matching.
-- theme_vectors: the theme's games released since riseQ (and coming soon).
--   p = theme keys + {riseQ, maxNew (2000)}. More than maxNew → a deterministic sample
--   (coming soon: maxNew/2). {n_new, n_soon, new: [[appid, release_q, coming_soon, reviews,
--   developer, tag_ids, tag_w, text(int x127)]]}
-- hit_vectors: the candidate hits (any tags) from the years before the rise, the same for every
--   theme, so the browser caches them per rise quarter. p = {riseQ, lookback (12 quarters),
--   minReviews (1000)}. {cand: [[...as above..., name, release_date, pct_positive]]}
-- Text vectors are quantised to ints (x127) to keep the payload small.
create or replace function theme_vectors(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare th theme_t := theme_of(p); fl floor_t := floor_of(f); dd date := data_date();
  rq int := (p->>'riseQ')::int; mx int := coalesce((p->>'maxNew')::int, 2000);
begin
  return (
    with nw as materialized (
      select g.appid, g.release_q, g.coming_soon, g.reviews, g.developer, g.tag_ids
      from games g
      where passes(g, fl) and in_theme(g, th)
        and (g.coming_soon or (g.release_date <= dd and g.release_q >= rq))
    ),
    nw_l as (
      select * from (select nw.*, row_number() over (partition by coming_soon order by md5(appid::text)) as k from nw) z
      where z.k <= case when z.coming_soon then mx / 2 else mx end
    )
    select json_build_object(
      'n_new', (select count(*) from nw where not coming_soon),
      'n_soon', (select count(*) from nw where coming_soon),
      'new', coalesce((select json_agg(json_build_array(n.appid, n.release_q, n.coming_soon, n.reviews, n.developer,
                                                        n.tag_ids, i.tag_w,
                                                        (select array_agg(round(x * 127)::int) from unnest(v.text_vec::real[]) x)))
                       from nw_l n join game_vec v using (appid) join game_info i using (appid)), '[]')));
end $$;

create or replace function hit_vectors(p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare fl floor_t := floor_of(f); dd date := data_date();
  rq int := (p->>'riseQ')::int; lb int := coalesce((p->>'lookback')::int, 12);
  mr int := coalesce((p->>'minReviews')::int, 1000);
begin
  return (
    with cand as materialized (
      select g.appid, g.name, g.release_date, g.release_q, g.reviews, g.pct_positive, g.developer, g.tag_ids
      from games g
      where not g.coming_soon and g.release_date <= dd and g.reviews >= mr
        and g.release_q between rq - lb and rq + 2 and passes(g, fl)
    )
    select json_build_object(
      'cand', coalesce((select json_agg(json_build_array(c.appid, c.release_q, false, c.reviews, c.developer,
                                                         c.tag_ids, i.tag_w,
                                                         (select array_agg(round(x * 127)::int) from unnest(v.text_vec::real[]) x),
                                                         c.name, c.release_date, c.pct_positive))
                        from cand c join game_vec v using (appid) join game_info i using (appid)), '[]')));
end $$;

-- ---------------------------------------------------------------- game page

create or replace function game(p_appid int) returns json
language sql stable as $$
  select (to_jsonb(g) || coalesce(to_jsonb(i) - 'appid', '{}'))::json
  from games g left join game_info i using (appid) where g.appid = p_appid
$$;

-- Every game whose blended similarity to p_appid is >= minSim (and passes the floor).
-- p = {wText: 0..1 (weight of description similarity), minSim, limit}
-- {rows: [[appid, name, release_date, release_q, coming_soon, reviews, pct_positive, developer,
--          tags[1:8], sim, tag_sim, text_sim]]}
create or replace function game_neighbors(p_appid int, p jsonb, f jsonb default null) returns json
language plpgsql stable as $$
declare fl floor_t := floor_of(f);
  w real := coalesce((p->>'wText')::real, 0.3);
  ms real := coalesce((p->>'minSim')::real, 0.49);
  lim int := least(coalesce((p->>'limit')::int, 3000), 8000);
  tv sparsevec; xv halfvec;
begin
  select tag_vec, text_vec into tv, xv from game_vec where appid = p_appid;
  if tv is null then return json_build_object('rows', '[]'::json); end if;
  return (
    with s as (
      select v.appid, -(v.tag_vec <#> tv) as ts, -(v.text_vec <#> xv) as xs
      from game_vec v where v.appid <> p_appid
    ),
    r as (
      select g.appid, g.name, g.release_date, g.release_q, g.coming_soon, g.reviews, g.pct_positive,
             g.developer, g.tag_ids[1:8] as tags, (1 - w) * s.ts + w * s.xs as sim, s.ts, s.xs
      from s join games g using (appid)
      where (1 - w) * s.ts + w * s.xs >= ms and passes(g, fl)
      order by sim desc
      limit lim
    )
    select json_build_object('rows', coalesce(json_agg(json_build_array(
        appid, name, release_date, release_q, coming_soon, reviews, pct_positive, developer, tags,
        round(sim::numeric, 4), round(ts::numeric, 4), round(xs::numeric, 4)) order by sim desc), '[]'))
    from r);
end $$;

-- ---------------------------------------------------------------- planning
-- Plan every statement in these functions with the call's actual floor and theme. Without
-- this, plpgsql switches to a cached generic plan after a few calls on the same pooled
-- connection, where the floor is an unknown parameter: on the API that ran ~30x slower
-- (quarter_totals: 7 s instead of 0.2 s).
alter function quarter_totals(jsonb) set plan_cache_mode = force_custom_plan;
alter function theme_series(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function tag_table(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function theme_games(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function theme_dist(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function theme_vectors(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function hit_vectors(jsonb, jsonb) set plan_cache_mode = force_custom_plan;
alter function game_neighbors(int, jsonb, jsonb) set plan_cache_mode = force_custom_plan;
