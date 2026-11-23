# Steam release trends

Finds genres and themes that are taking off among new Steam releases, and the hit
games that probably started them. It uses Valve's own Web API, not SteamDB.

| Step | Script | Reads | Writes |
|---|---|---|---|
| 1. Fetch | `steam_trends_fetch.py` | Steam Web API | `data/` (full local dump), `steam_games.csv` |
| 2. Analyse | `steam_trends_analyse.py` | `steam_games.csv` | `output/*.csv`, `output/analysis.json` |
| 3. Origins | `steam_trends_origins.py` | `steam_games.csv` | `output/hit_waves.csv`, `output/origins.json` |
| 4. Dashboard | `steam_trends_dashboard.py` | `output/*.json` | `dashboard.html` |

Only step 1 touches the network. Steps 2–4 take seconds to a couple of minutes,
so you can change the analysis and re-run them as often as you like.

## Setup (once)

```powershell
python -m pip install requests pandas numpy
```

Put your free Steam Web API key (https://steamcommunity.com/dev/apikey) in a
`.env` file in this folder:

```
STEAM_API_KEY=your_key_here
```

## Refreshing (every few months)

```powershell
python steam_trends_fetch.py
```
```powershell
python steam_trends_analyse.py
```
```powershell
python steam_trends_origins.py
```
```powershell
python steam_trends_dashboard.py
```

Then open `dashboard.html` in any current browser. It's a single file with the
data gzipped inside, so it needs no server or internet connection.

The fetch takes about 3 hours for the full catalogue, at about 1 request per
second with backoff on HTTP 429 errors. You can stop and restart it safely:
progress is saved every 2,000 apps, and records younger than `--max-age-days`
(default 30) are skipped. Other options:

- `--limit 500` for a quick test.
- `--csv-only` to rebuild the CSV from the dump with no network access.
- `--all-types` to also download DLC, software, videos and hardware.

## The local data dump (`data/`)

Every field the store API offers, for every game, so you never need to
re-download to try a new idea:

- `data/raw/part-*.jsonl.gz`: one raw `IStoreBrowseService/GetItems` record per
  line. Fields include release info, the top 20 tags with vote weights, reviews
  (count and % positive), short and full descriptions (BBCode), developers,
  publishers, franchises, screenshots, trailers, assets, platforms, languages,
  age ratings, categories, prices and purchase options, included items, links,
  and related items (demos, parent apps). Each line also has `fetched_at`.
- `data/tags.json`: tag id → name. `data/categories.json`: store category ids →
  names.

To read it from Python:

```python
from steam_trends_fetch import load_records
for game in load_records():            # newest record per game; types=None for all types
    print(game["name"], game["reviews"]["summary_filtered"]["review_count"])
```

`steam_games.csv` is a flat extract of the dump with these columns: appid, name,
release date, coming_soon, early_access, unlisted, tags and tag weights (ordered
by weight), review count, % positive, developer, publisher, franchise, is_free,
price in GBP, and short description.

## The dashboard

- **Rising tags**: tags and tag pairs ranked by year-on-year growth in their
  share of all releases. Click a row to deep-dive into it.
- **Deep dive**: one or more tags (games must have all of them) and/or a keyword
  regex searched in names and descriptions. It shows:
  - share of releases by year, by quarter, or by the same dates in each year;
  - "core" share: only games where the tag is one of their top 5 tags. This
    separates games that are actually about trains from games that merely
    contain one;
  - a detected take-off quarter;
  - a hit timeline: every game as a dot, with height = reviews;
  - the most-reviewed, newest and coming-soon games;
  - **what the theme's new games copy**: hits from the 3 years before the rise,
    with any tags, ranked by how many of the theme's games since then closely
    match them. This is the same method as theme mode in
    `steam_trends_origins.py`, with matching results. You can change the
    quarter the rise starts in. It also counts coming-soon copies, and clicking a
    row lists all of that hit's copies;
  - the theme's own likely trend-setters;
  - a year table with the top games each year;
  - related tags, either the most distinctive ones or the ones rising within the
    theme.
- **Trend-setters**: every hit (2,000+ reviews) ranked by its *wave lift*. For
  each hit, the dashboard shows the follower curve and its most-reviewed
  look-alikes.
- **Compare**: share over time for up to 8 tags or keywords.
- **Coming soon**: tags over-represented among unreleased games, as a leading
  indicator.

## How trend origins are measured (`steam_trends_origins.py`)

1. **Fingerprints:** each game gets a tag fingerprint built from its tags,
   weighted by vote weight and by rarity, so that "Desktop Companion" counts far
   more than "2D". Business-model and praise tags (Early Access, Masterpiece,
   Great Soundtrack…) are left out, because hits collect them years later and
   imitators don't have them yet.
2. **Followers:** a hit's *followers* are games by other developers whose
   fingerprint is very close to the hit's (cosine similarity ≥ `--sim`,
   default 0.6). The script computes their share of all releases each quarter.
3. **Wave lift:** the followers' share 1–3 years after the hit, divided by their
   share in the 2 years before it. Game development takes time, so a real
   trend-setter shows a flat line, then a rise starting about a year after its
   release.
4. **Ranking:** `log(lift) × √(extra games)`, where *extra games* is how many
   more look-alikes came out in that window than the "before" share predicts.
   Hits with under a year of "after" data aren't ranked yet. Adult games are left
   out (`--adult` puts them back), because Steam's 2018 adult-content policy
   change made that whole category surge and it swamped everything else.

`--sim 0.6` was checked against known cases. At 0.6, Bongo Cat's followers are
Bongo Waifu and taskbar pets, and The Exit 8's are FailRooms and The Anomaly
Project. At 0.5, unrelated games leak in; at 0.7, the lists get too thin.

Theme mode answers "what started this?" for one trend:

```powershell
python steam_trends_origins.py --tags "Desktop Companion"
```
```powershell
python steam_trends_origins.py --keyword "trains?|railways?|locomotives?" --names-only --rise 2025Q1
```

It prints:

- the theme's yearly share;
- when it took off: the 4-quarter share passes 1.5× its prior 2-year level and
  stays up, with at least 10 games in the window;
- **the hits that the theme's new games most closely copy**, whether or not those
  hits carry the theme's tags. Balatro isn't tagged Poker, but it's the
  second-biggest source of 2026's Poker games;
- the theme's own hits from before the take-off, ranked by the wave each one set
  off.

Options:

- `--core`: the tags must be among each game's top 5 tags.
- `--rise 2025Q1`: explain a rise you can see yourself when the detector picks a
  different quarter.
- `--names-only`: match `--keyword` against game names only. Use it for words
  like "train" that are also common verbs in descriptions.

This is correlation, not proof. A hit can ride a wave that was already starting:
check that the "before" share was low. A trend can also come from outside Steam,
for example a YouTube meme, a mobile hit or a game-jam theme.

## Caveats

- **Tags are what a game is tagged as now, not what it was tagged at launch.**
  Older games have had longer to collect tags. The newest releases mostly carry
  the developer's own tags, so newly added Steam tags such as Organizing and
  Cleaning can look like they're surging. Check rising tags against the keyword
  search and the example games.
- Release volume grew sharply in the second half of 2026: about 4,700 games in
  Nov 2026, against about 1,600 a month in early 2026. That's why everything here
  uses share rather than raw counts.
- Reviews are the popularity measure. They undercount free-to-play and
  non-English-market games, and recent games haven't had time to collect them.
- Delisted games aren't in Valve's app list, so earlier years are slightly
  under-counted.
- The release date is Steam's `steam_release_date`. For Early Access games that's
  the Early Access launch, not the 1.0 release.

## API notes (checked against the live API, Nov 2026)

- `ISteamApps/GetAppList/v1` and `v2` now return 404. `IStoreService/GetAppList`
  needs a key.
- `IStoreBrowseService/GetItems` works without a key. It fails above about 100
  ids per request because the URL gets too long. Unknown ids come back with
  `success: 15` and `appid: 0`. `type: 0` is a game (1 = demo, 4 = DLC,
  12 = playtest).
- In the full `data_request`, `include_included_items` repeats other apps' full
  records and makes up about 40% of the dump's size.
