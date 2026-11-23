-- Public, read-only access. Visitors (the anon key in the static site) can read every
-- table and call every function, but nothing can be written except by the upload script,
-- which connects as the database owner.

alter table tags        enable row level security;
alter table games       enable row level security;
alter table game_info   enable row level security;
alter table game_vec    enable row level security;
alter table leaderboard enable row level security;
alter table meta        enable row level security;

drop policy if exists "public read" on tags;
drop policy if exists "public read" on games;
drop policy if exists "public read" on game_info;
drop policy if exists "public read" on game_vec;
drop policy if exists "public read" on leaderboard;
drop policy if exists "public read" on meta;
create policy "public read" on tags        for select to anon, authenticated using (true);
create policy "public read" on games       for select to anon, authenticated using (true);
create policy "public read" on game_info   for select to anon, authenticated using (true);
create policy "public read" on game_vec    for select to anon, authenticated using (true);
create policy "public read" on leaderboard for select to anon, authenticated using (true);
create policy "public read" on meta        for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on tags, games, game_info, game_vec, leaderboard, meta from anon, authenticated;

-- Similarity scans over ~200k games can take a few seconds on the free tier; Supabase's
-- default for anonymous requests is 3 s.
alter role anon set statement_timeout = '15s';
notify pgrst, 'reload config';
