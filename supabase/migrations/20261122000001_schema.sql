-- Steam trends: tables. Loaded by pipeline/build_db.py (which swaps in fresh copies on
-- each refresh); read by the web app through the functions in 0002_rpc.sql.

-- Extensions live in their own schema (Supabase's convention; its search_path already
-- includes it), so they don't clutter the public API schema.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- Steam user tags. ix = position in the tag fingerprint vectors (1-based).
create table if not exists tags (
  id        int primary key,          -- Steam tagid
  name      text not null,
  ix        int not null unique,
  idf       real not null default 0,  -- rarity weight used in fingerprints
  content   boolean not null default true,  -- false for business/praise tags (Indie, Masterpiece...)
  adult     boolean not null default false,
  n_games   int not null default 0    -- released games carrying the tag (all time)
);

create table if not exists games (
  appid             int primary key,
  name              text not null,
  release_date      date,
  release_q         int,               -- year*4 + quarter (0-3); null when TBA
  coming_soon       boolean not null default false,
  early_access      boolean not null default false,
  is_free           boolean not null default false,
  price_gbp         numeric(8,2),      -- full (undiscounted) price; null when unknown
  reviews           int not null default 0,
  pct_positive      smallint not null default 0,
  rating            real,              -- SteamDB-style rating (review %, pulled toward 50% when few reviews)
  developer         text not null default '',
  publisher         text not null default '',
  header_image      text,
  short_description text not null default '',
  tag_ids           int[] not null default '{}',      -- Steam tagids, strongest first
  tag_w             smallint[] not null default '{}', -- votes, 0-100 relative to the strongest tag
  is_adult          boolean not null default false
);
create index if not exists games_tags_gin   on games using gin (tag_ids);
create index if not exists games_name_trgm  on games using gin (name gin_trgm_ops);
create index if not exists games_release_q  on games (release_q);
create index if not exists games_release    on games (release_date);
create index if not exists games_reviews    on games (reviews desc);
-- Sort orders for the Games results list (an unfiltered page walks these and stops early).
create index if not exists games_rating     on games (rating desc nulls last);
create index if not exists games_name       on games (name);

-- Fingerprints for similarity. Kept apart from games so list queries stay lean.
-- Both vectors are unit length, so inner product = cosine similarity.
create table if not exists game_vec (
  appid    int primary key references games (appid) on delete cascade,
  tag_vec  sparsevec not null,   -- vote weight x idf over content tags
  text_vec halfvec(128) not null -- MiniLM description embedding, PCA to 128 dims
);

-- Global hit ranking by follower wave, precomputed per quality-floor preset.
create table if not exists leaderboard (
  preset     text not null,        -- 'off' | 'default' | 'strict'
  rank       int not null,
  appid      int not null,
  lift       real,
  share_before real,               -- % of releases, 2 years before
  share_after  real,               -- % of releases, 1-3 years after
  excess     real,                 -- look-alikes above the before-share expectation
  n_after    int,
  score      real,
  first_q    int not null,         -- release_q of share[1]
  share      real[] not null,      -- look-alike share of releases per quarter, %
  followers  int[] not null,       -- most-reviewed look-alikes released after it
  primary key (preset, rank)
);

-- When the data was built, and with which settings (one row).
create table if not exists meta (
  id          int primary key default 1 check (id = 1),
  built_at    timestamptz not null default now(),
  fetched_to  date,
  n_games     int,
  settings    jsonb not null default '{}'
);
