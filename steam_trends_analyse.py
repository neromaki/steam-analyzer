#!/usr/bin/env python3
"""
Step 2 of 3: find rising tags / themes in steam_games.csv (no network needed).

Usage:
    python steam_trends_analyse.py                 # writes output/*.csv + output/analysis.json
    python steam_trends_analyse.py --min-count 50  # stricter noise floor

Method
  * Released games only: real release date from --start-year (2015) to today,
    not coming soon, not unlisted. Coming-soon games are saved separately
    (output/coming_soon.csv) as a leading indicator.
  * For each tag and year (and quarter, for the last 2 years) we count releases
    and the tag's SHARE of all releases in that period. Total releases grow
    every year, so share is the fair measure, not raw counts.
  * "Rising" = growth in share vs the previous period. The current year is
    incomplete, so it is compared like-for-like: Jan 1 -> today's date in this
    year vs the same date range in each earlier year ("YTD").
  * Tags with fewer than --min-count releases in the period are ignored.
  * CAVEAT: tags are what players tag a game as NOW, not at launch. Older
    games have had longer to collect tags, and tag fashions change.
"""
import argparse
import itertools
import json
import os
import re
from collections import Counter
from datetime import date

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "output")

# Keyword themes searched in game names (regex, case-insensitive, word-start).
THEMES = {
    "Trains / railways": r"trains?\b|rail|locomotive|railway|tram\b|subway",
    "Idle / clicker": r"idle|clicker|incremental|afk",
    "Desktop / taskbar": r"desktop|taskbar|wallpaper|screen ?pet|desk ",
    "Roguelike / -lite": r"rogue",
    "Survivors-likes": r"survivors?\b",
    "Cozy": r"cozy|cosy",
    "Backrooms / liminal": r"backrooms|liminal",
    "Simulator (in name)": r"simulator",
    "Shop / store sim": r"shop|store|market|supermarket",
    "Cooking / food": r"cook|chef|kitchen|restaurant|cafe|bakery",
    "Fishing": r"fish",
    "Mining / drilling": r"mine|mining|drill",
}

CAVEAT = ("Tags are what a game is tagged as today, not at launch: older games have had "
          "longer to collect tags and tag fashions change; the newest releases mostly carry "
          "the developer's own tags, which favours newly added tags. Delisted games are not in "
          "Valve's app list, so earlier years are slightly under-counted.")


def load(path):
    df = pd.read_csv(path, dtype={"name": str, "tags": str, "release_text": str},
                     keep_default_na=False)
    df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce")
    df["tag_list"] = df["tags"].map(lambda s: [t for t in s.split("|") if t])
    # tag vote weights, 0-100 relative to the game's strongest tag (rank-based if absent)
    def rel_weights(row):
        tl = row.tag_list
        try:
            wl = [float(x) for x in str(row.get("tag_weights", "")).split("|") if x]
        except ValueError:
            wl = []
        if len(wl) != len(tl):
            wl = [len(tl) - k for k in range(len(tl))]
        top = max(wl, default=1) or 1
        return [max(1, round(w / top * 100)) for w in wl]
    df["w_list"] = df.apply(rel_weights, axis=1)
    for c in ("reviews", "pct_positive"):  # absent in CSVs from older fetches
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int) if c in df else 0
    for c in ("developer", "description"):
        if c not in df:
            df[c] = ""
    return df


def share_table(df, period_col, min_total=1):
    """Long table: period, tag, count, total, share."""
    totals = df.groupby(period_col).size().rename("total")
    ex = df[[period_col, "tag_list"]].explode("tag_list").dropna()
    counts = ex.groupby([period_col, "tag_list"]).size().rename("count").reset_index()
    counts = counts.rename(columns={"tag_list": "tag"}).merge(totals, left_on=period_col,
                                                              right_index=True)
    counts["share"] = counts["count"] / counts["total"]
    return counts[counts["total"] >= min_total], totals


def rising(cur, prev, min_count, label_cur, label_prev, key="tag"):
    """Rank items by growth in share between two periods.

    cur / prev: DataFrames indexed by key with count, total columns."""
    m = cur.add_suffix("_cur").join(prev.add_suffix("_prev"), how="left")
    m["count_prev"] = m["count_prev"].fillna(0)
    m["total_prev"] = m["total_prev"].fillna(prev["total"].max() if len(prev) else 1)
    m = m[m["count_cur"] >= min_count].copy()
    m["share_cur"] = m["count_cur"] / m["total_cur"]
    m["share_prev"] = m["count_prev"] / m["total_prev"]
    # +1 pseudo-count so brand-new tags don't divide by zero
    m["growth"] = m["share_cur"] / ((m["count_prev"] + 1) / m["total_prev"])
    m["pp_change"] = (m["share_cur"] - m["share_prev"]) * 100
    m = m.sort_values("growth", ascending=False).reset_index()
    m.insert(0, "period", label_cur)
    m.insert(1, "vs", label_prev)
    return m[["period", "vs", key, "count_cur", "count_prev", "share_cur", "share_prev",
              "pp_change", "growth"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(HERE, "steam_games.csv"))
    ap.add_argument("--start-year", type=int, default=2015)
    ap.add_argument("--min-count", type=int, default=30)
    ap.add_argument("--top", type=int, default=25, help="rows per period in the dashboard")
    ap.add_argument("--pair-tags", type=int, default=10,
                    help="use each game's top N tags when counting tag pairs")
    ap.add_argument("--hits-from", type=int, default=2010,
                    help="also embed popular games from this year on (for trend origins)")
    ap.add_argument("--old-min-reviews", type=int, default=500,
                    help="min reviews for pre---start-year games to be embedded")
    ap.add_argument("--desc-chars", type=int, default=300,
                    help="characters of each short description to embed (0 = none)")
    a = ap.parse_args()
    os.makedirs(OUTDIR, exist_ok=True)

    today = pd.Timestamp(date.today())
    df = load(a.csv)
    base = df[(df["unlisted"] == 0)]
    rel = base[(base["coming_soon"] == 0) & base["release_date"].notna()
               & (base["release_date"] >= f"{a.start_year}-01-01")
               & (base["release_date"] <= today)].copy()
    soon = base[base["coming_soon"] == 1].copy()
    print(f"{len(df)} games in CSV; {len(rel)} released {a.start_year}-{today.date()}; "
          f"{len(soon)} coming soon")

    rel["year"] = rel["release_date"].dt.year
    rel["quarter"] = rel["release_date"].dt.to_period("Q").astype(str)
    # YTD flag: released on/before today's month-day in its own year
    md = today.month * 100 + today.day
    rel["in_ytd"] = (rel["release_date"].dt.month * 100 + rel["release_date"].dt.day) <= md
    cy = today.year
    years = list(range(a.start_year, cy + 1))

    # ---- yearly & quarterly share tables ---------------------------------
    yearly, ytot = share_table(rel, "year")
    yearly.to_csv(os.path.join(OUTDIR, "tag_share_by_year.csv"), index=False)
    ytd, ytdtot = share_table(rel[rel["in_ytd"]], "year")
    ytd.to_csv(os.path.join(OUTDIR, "tag_share_ytd_by_year.csv"), index=False)
    qstart = pd.Period(today - pd.DateOffset(years=2), "Q")
    recentq = rel[rel["release_date"].dt.to_period("Q") >= qstart]
    quarterly, qtot = share_table(recentq, "quarter")
    quarterly.to_csv(os.path.join(OUTDIR, "tag_share_by_quarter.csv"), index=False)
    quarters = sorted(qtot.index)

    # ---- rising tags ------------------------------------------------------
    def idx(t, col, p):
        return t[t[col] == p].set_index("tag")[["count", "total"]]

    rise = []
    for y in years[1:]:
        if y == cy:  # partial year: same-date-range comparison
            r = rising(idx(ytd, "year", y), idx(ytd, "year", y - 1), a.min_count,
                       f"{y} YTD", f"{y - 1} same dates")
        else:
            r = rising(idx(yearly, "year", y), idx(yearly, "year", y - 1), a.min_count,
                       str(y), str(y - 1))
        rise.append(r)
    for q0, q1 in zip(quarters, quarters[1:]):
        # quarter vs same quarter a year earlier would need older data; use previous quarter
        rise.append(rising(idx(quarterly, "quarter", q1), idx(quarterly, "quarter", q0),
                           a.min_count, q1, q0))
    rise = pd.concat(rise, ignore_index=True)
    rise.to_csv(os.path.join(OUTDIR, "rising_tags.csv"), index=False)

    # ---- rising tag pairs ---------------------------------------------------
    def pair_counts(sub):
        c = Counter()
        for tl in sub["tag_list"]:
            c.update(" + ".join(p) for p in itertools.combinations(sorted(tl[:a.pair_tags]), 2))
        return pd.DataFrame({"count": pd.Series(c, dtype=int)})

    prise = []
    for y in years[1:]:
        if y == cy:
            cur, prev = rel[(rel.year == y) & rel.in_ytd], rel[(rel.year == y - 1) & rel.in_ytd]
            lc, lp = f"{y} YTD", f"{y - 1} same dates"
        else:
            cur, prev, lc, lp = rel[rel.year == y], rel[rel.year == y - 1], str(y), str(y - 1)
        pc, pp = pair_counts(cur), pair_counts(prev)
        pc["total"], pp["total"] = len(cur), len(prev)
        pc.index.name = pp.index.name = "pair"
        prise.append(rising(pc, pp, a.min_count, lc, lp, key="pair"))
    prise = pd.concat(prise, ignore_index=True)
    prise.to_csv(os.path.join(OUTDIR, "rising_tag_pairs.csv"), index=False)

    # ---- keyword themes in names -------------------------------------------
    theme_rows = []
    for theme, pat in THEMES.items():
        rx = re.compile(r"\b(?:" + pat + ")", re.I)
        hit = rel["name"].map(lambda n: bool(rx.search(n)))
        soon_hits = int(soon["name"].map(lambda n: bool(rx.search(n))).sum())
        for y in years:
            sel = rel.year == y
            c = int((hit & sel).sum())
            cytd = int((hit & sel & rel.in_ytd).sum())
            theme_rows.append({"theme": theme, "pattern": pat, "year": y, "count": c,
                               "share": c / max(1, int(sel.sum())),
                               "count_ytd": cytd,
                               "share_ytd": cytd / max(1, int((sel & rel.in_ytd).sum())),
                               "coming_soon_count": soon_hits,
                               "coming_soon_share": soon_hits / max(1, len(soon))})
    themes = pd.DataFrame(theme_rows)
    themes.to_csv(os.path.join(OUTDIR, "keyword_themes.csv"), index=False)

    # ---- coming soon (leading indicator) ------------------------------------
    soon.drop(columns=["tag_list"]).to_csv(os.path.join(OUTDIR, "coming_soon.csv"), index=False)
    s_ex = soon["tag_list"].explode().dropna().value_counts()
    cur_share = idx(ytd, "year", cy)
    lead = pd.DataFrame({"count_soon": s_ex, "share_soon": s_ex / max(1, len(soon))})
    lead = lead.join(cur_share.rename(columns={"count": "count_ytd", "total": "total_ytd"}))
    lead["share_ytd"] = lead["count_ytd"] / lead["total_ytd"]
    lead["soon_vs_now"] = lead["share_soon"] / lead["share_ytd"]
    lead = lead[lead["count_soon"] >= a.min_count].sort_values("soon_vs_now", ascending=False)
    lead.index.name = "tag"
    lead.reset_index().to_csv(os.path.join(OUTDIR, "coming_soon_tags.csv"), index=False)

    # ---- JSON for the dashboard ---------------------------------------------
    tags_by_freq = rel["tag_list"].explode().value_counts()
    tag_names = list(tags_by_freq.index)
    tag_ix = {t: i for i, t in enumerate(tag_names)}

    def series(t, col, periods):
        p = t.pivot_table(index="tag", columns=col, values="share", fill_value=0)
        p = p.reindex(columns=periods, fill_value=0)
        return {tg: [round(v * 100, 4) for v in row] for tg, row in zip(p.index, p.values)}

    def top_rows(r, key):
        out = {}
        for per, g in r.groupby("period", sort=False):
            g = g.head(a.top)
            out[per] = {"vs": g["vs"].iloc[0] if len(g) else "",
                        "rows": [[getattr(x, key), int(x.count_cur), int(x.count_prev),
                                  round(x.share_cur * 100, 3), round(x.share_prev * 100, 3),
                                  round(x.growth, 3)] for x in g.itertuples()]}
        return out

    # games for the dashboard: released since --hits-from (older hits matter for
    # trend origins) plus coming soon. Shares above still use --start-year.
    epoch = pd.Timestamp(f"{a.start_year}-01-01")
    older = base[(base.coming_soon == 0) & base.release_date.notna()
                 & (base.release_date >= f"{a.hits_from}-01-01")
                 & (base.release_date < epoch)
                 & (base.reviews >= a.old_min_reviews)]
    games = []
    for frame, flag in ((rel, 0), (older, 0), (soon, 1)):
        for g in frame.itertuples():
            d = int((g.release_date - epoch).days) if pd.notna(g.release_date) else None
            keep = [k for k, t in enumerate(g.tag_list) if t in tag_ix]
            games.append([int(g.appid), g.name, d, int(g.early_access), flag,
                          [tag_ix[g.tag_list[k]] for k in keep],
                          int(g.reviews), int(g.pct_positive), g.developer,
                          g.description[:a.desc_chars],
                          [g.w_list[k] for k in keep]])

    data = {
        "generated": str(today.date()),
        "caveat": CAVEAT,
        "min_count": a.min_count,
        "start_year": a.start_year,
        "ytd_label": f"Jan 1 - {today.strftime('%b %d')}",
        "years": years,
        "year_totals": [int(ytot.get(y, 0)) for y in years],
        "ytd_totals": [int(ytdtot.get(y, 0)) for y in years],
        "quarters": quarters,
        "quarter_totals": [int(qtot.get(q, 0)) for q in quarters],
        "tags": tag_names,
        "share_year": series(yearly, "year", years),
        "share_ytd": series(ytd, "year", years),
        "share_quarter": series(quarterly, "quarter", quarters),
        "rising": top_rows(rise, "tag"),
        "rising_pairs": top_rows(prise, "pair"),
        "coming_soon_total": len(soon),
        "coming_soon_lead": [[t, int(r.count_soon), round(r.share_soon * 100, 3),
                              round((r.share_ytd if pd.notna(r.share_ytd) else 0) * 100, 3)]
                             for t, r in lead.head(a.top).iterrows()],
        "themes": {t: THEMES[t] for t in THEMES},
        "games": games,
    }
    path = os.path.join(OUTDIR, "analysis.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUTDIR}/*.csv and analysis.json ({os.path.getsize(path) / 1e6:.1f} MB)")

    # quick console summary
    for per in (str(cy - 1), f"{cy} YTD"):
        g = rise[rise.period == per].head(10)
        print(f"\nTop rising tags {per} (vs {g.vs.iloc[0] if len(g) else '-'}):")
        for x in g.itertuples():
            print(f"  {x.tag:28s} {x.share_prev * 100:5.2f}% -> {x.share_cur * 100:5.2f}%"
                  f"  ({x.count_cur} games, x{x.growth:.2f})")


if __name__ == "__main__":
    main()
