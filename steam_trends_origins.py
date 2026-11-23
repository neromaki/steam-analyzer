#!/usr/bin/env python3
"""
Trend origins: which hit games set off a wave of similar releases?

Runs offline on steam_games.csv (step 1 output). Two modes:

    python steam_trends_origins.py                        # rank every hit by its "follower wave"
    python steam_trends_origins.py --tags "Desktop Companion"
    python steam_trends_origins.py --tags "Roguelike,Card Game" --core
    python steam_trends_origins.py --keyword "trains?|railway|locomotive"   # names + descriptions

How it works
  * Every game gets a tag fingerprint: its up-to-20 tags, weighted by vote
    weight and by rarity (IDF), so "Singleplayer"/"Indie" count for little and
    "Desktop Companion" counts for a lot.
  * A "hit" is a game with >= --min-reviews Steam reviews (reviews are the
    standard popularity proxy: roughly 30-60 sales per review).
  * A hit's "followers" are later games by OTHER developers whose fingerprint is
    very close to the hit's (cosine >= --sim). For every quarter we compute
    followers / all releases, so overall Steam growth doesn't count.
  * Wave lift = follower share in the 1-3 years after the hit (game dev takes
    time) / follower share in the 2 years before it. A lift of 3 means games
    like this became 3x more common after the hit came out.

  Theme mode (--tags / --keyword) shows the theme's share over time, when it
  took off, and the theme's hits from before the take-off ranked by how much of
  a wave each one triggered.

Writes output/origins.json (used by the dashboard) and output/hit_waves.csv.
Caveat: correlation, not proof. A hit can ride a wave rather than start it
(check the 'before' share), and tags are today's tags, not launch-day tags.
"""
import argparse
import json
import os
import re
import sys
from datetime import date

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "output")
START = pd.Period("2012Q1", "Q")


def load(path):
    df = pd.read_csv(path, keep_default_na=False, dtype={"name": str, "description": str})
    df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce")
    today = pd.Timestamp(date.today())
    df = df[(df.coming_soon == 0) & (df.unlisted == 0) & df.release_date.notna()
            & (df.release_date <= today)].copy()
    df["q"] = df.release_date.dt.to_period("Q")
    df = df[df.q >= START].reset_index(drop=True)
    df["reviews"] = pd.to_numeric(df["reviews"], errors="coerce").fillna(0).astype(int)
    df["tag_list"] = df.tags.map(lambda s: [t for t in s.split("|") if t])
    df["w_list"] = df.tag_weights.map(lambda s: [float(x) for x in s.split("|") if x])
    return df


# Tags that say how a game is sold or how players rate it, not what it is. Hits
# collect the praise tags years later, which would make them look unlike the
# brand-new imitators, so they're left out of the fingerprints.
ADULT = {"Sexual Content", "Nudity", "Hentai", "NSFW", "Mature"}

NON_CONTENT = {"Early Access", "Free to Play", "Indie", "Singleplayer", "Great Soundtrack",
               "Masterpiece", "Classic", "Cult Classic", "Addictive", "Beautiful", "Epic",
               "Replay Value", "Controller", "Moddable", "Memes", "Remake", "Sequel",
               "Massively Multiplayer", "Multiplayer", "Co-op", "Online Co-Op", "Local Co-Op",
               "Local Multiplayer", "PvP", "PvE", "Software", "Utilities"}


def fingerprints(df):
    """Row-normalised tag matrix (weight x IDF), content tags only."""
    vocab = sorted({t for tl in df.tag_list for t in tl} - NON_CONTENT)
    ix = {t: i for i, t in enumerate(vocab)}
    M = np.zeros((len(df), len(vocab)), dtype=np.float32)
    for r, (tl, wl) in enumerate(zip(df.tag_list, df.w_list)):
        if not tl:
            continue
        wl = wl if len(wl) == len(tl) else [len(tl) - k for k in range(len(tl))]
        top = max(wl) or 1
        for t, w in zip(tl, wl):
            if t in ix:
                M[r, ix[t]] = w / top
    df_count = (M > 0).sum(0)
    idf = np.log((len(df) + 1) / (df_count + 1)).astype(np.float32)
    M *= idf
    norms = np.linalg.norm(M, axis=1, keepdims=True)
    M /= np.where(norms == 0, 1, norms)
    return M, vocab


def quarter_axis(df):
    qs = pd.period_range(START, df.q.max(), freq="Q")
    qi = {q: i for i, q in enumerate(qs)}
    totals = np.bincount(df.q.map(qi), minlength=len(qs)).astype(float)
    return qs, qi, totals


def waves(df, M, hits_idx, qs, qi, totals, sim, after=(2, 12), before=8):
    """For each hit: follower share per quarter, before/after shares and lift."""
    qpos = df.q.map(qi).to_numpy()
    dev = df.developer.str.lower().to_numpy()
    out = []
    S = M[hits_idx] @ M.T  # hits x games
    for k, h in enumerate(hits_idx):
        s = S[k]
        mask = (s >= sim) & (dev != dev[h])
        mask[h] = False
        counts = np.bincount(qpos[mask], minlength=len(qs))
        share = np.divide(counts, totals, out=np.zeros(len(qs)), where=totals > 0)
        hq = qpos[h]
        b = share[max(0, hq - before):hq]
        a = share[hq + after[0]: hq + after[1] + 1]
        sb = float(b.mean()) if len(b) else np.nan
        sa = float(a.mean()) if len(a) else np.nan
        n_after = int(counts[hq + 1: hq + after[1] + 1].sum())
        # games above what the pre-hit share would predict over the after-window
        win_tot = totals[hq + after[0]: hq + after[1] + 1].sum()
        excess = max(0.0, (sa - sb) * win_tot) if not np.isnan(sa) and not np.isnan(sb) else 0.0
        eps = 0.5 / max(1.0, float(np.mean(totals[max(0, hq - before):hq + 1])))  # half a game
        lift = (sa + eps) / (sb + eps) if not np.isnan(sa) and not np.isnan(sb) else np.nan
        followers = np.where(mask & (qpos > hq))[0]
        followers = followers[np.argsort(-df.reviews.to_numpy()[followers])][:15]
        out.append({"i": int(h), "share": share, "before": sb, "after": sa, "lift": lift,
                    "n_after": n_after, "excess": excess, "q_after": max(0, min(len(qs) - 1, hq + after[1]) - hq - after[0] + 1),
                    "n_before": int(counts[max(0, hq - before):hq].sum()),
                    "followers": followers.tolist(),
                    "complete": hq + after[1] < len(qs)})
    return out


def theme_mask(df, tags, core, keyword, names_only=False):
    m = np.ones(len(df), dtype=bool)
    if tags:
        for t in tags:
            m &= df.tag_list.map(lambda tl: t in (tl[:5] if core else tl)).to_numpy()
    if keyword:
        rx = re.compile(r"\b(?:" + keyword + ")", re.I)
        hit = df.name.str.contains(rx)
        if not names_only:
            hit |= df.description.str.contains(rx)
        m &= hit.to_numpy()
    return m


def influencers(df, M, m, on, qs, qi, a, lookback=12, top=12):
    """Which hits do the theme's new games look like? Hits need not carry the theme's
    tags themselves (Balatro isn't tagged Poker, but the 2026 Poker games copy it)."""
    qpos = df.q.map(qi).to_numpy()
    if a.rise:
        rise = qi[pd.Period(a.rise, freq="Q")]
    else:
        rise = on if on is not None else len(qs) - 8   # no take-off: look at the last 2 years
    new = np.where(m & (qpos >= rise))[0]
    if not len(new):
        return
    reviews = df.reviews.to_numpy()
    ok = (reviews >= a.influencer_reviews) & (qpos >= rise - lookback) & (qpos <= rise + 2)
    if not a.adult:
        ok &= ~df.tag_list.map(lambda tl: bool(ADULT & set(tl[:8]))).to_numpy()
    cand = np.where(ok)[0]
    if not len(cand):
        return
    dev = df.developer.str.lower().to_numpy()
    S = M[cand] @ M[new].T
    rows = []
    for k, c in enumerate(cand):
        hit = (S[k] >= a.sim) & (qpos[new] > qpos[c]) & (dev[new] != dev[c])
        if hit.sum():
            ex = new[hit][np.argsort(-reviews[new[hit]])][:3]
            rows.append((int(hit.sum()), c, ex))
    rows.sort(key=lambda r: (-r[0], -reviews[r[1]]))
    print(f"\nHits from the {lookback // 4} years before the rise that the theme's {len(new)} new games "
          f"(since {qs[rise]}) most closely copy (similarity >= {a.sim}, any tags):")
    print(f"{'released':10s} {'reviews':>8s}  {'copies':>6s}  game  -> e.g.")
    for n, c, ex in rows[:top]:
        g = df.iloc[c]
        print(f"{g.release_date.date()} {g.reviews:8d}  {n:4d} {n / len(new):4.0%}  {g['name']}  -> "
              + "; ".join(df.name.iloc[e] for e in ex))


def onset(share, qs, smooth=4, base=8, factor=1.5, first="2015Q1", counts=None, min_games=10):
    """First quarter where the rolling share beats the trailing baseline by `factor`
    and stays above it, with at least `min_games` games in the window. Quarters before
    `first` have too few releases to judge."""
    r = pd.Series(share).rolling(smooth, min_periods=smooth).mean().to_numpy()
    start = max(base + smooth, int((pd.Period(first, freq="Q") - qs[0]).n) + smooth)
    for i in range(start, len(r)):
        if counts is not None and counts[i - smooth + 1:i + 1].sum() < min_games:
            continue
        baseline = np.nanmean(r[i - base - smooth:i - smooth + 1])
        if baseline > 0 and r[i] >= factor * baseline and np.all(r[i:] >= factor * baseline * 0.8):
            return i - smooth + 1  # start of the window that crossed
    return None


def fmt_pct(x):
    return f"{x * 100:.2f}%"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(HERE, "steam_games.csv"))
    ap.add_argument("--tags", help="comma-separated tags (AND) for theme mode")
    ap.add_argument("--core", action="store_true", help="tags must be in each game's top 5 tags")
    ap.add_argument("--keyword", help="regex searched in names + short descriptions")
    ap.add_argument("--min-reviews", type=int, default=2000, help="hit threshold")
    ap.add_argument("--sim", type=float, default=0.6, help="follower similarity threshold")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--names-only", action="store_true", help="match --keyword in game names only")
    ap.add_argument("--rise", help="theme mode: start of the rise to explain, e.g. 2025Q1 "
                                   "(default: the detected take-off, else the last 2 years)")
    ap.add_argument("--influencer-reviews", type=int, default=1000,
                    help="theme mode: minimum reviews for a hit to count as a possible cause")
    ap.add_argument("--adult", action="store_true",
                    help="also rank adult games (left out by default: Steam's 2018 adult-content "
                         "policy change made that whole category surge, swamping everything else)")
    a = ap.parse_args()
    os.makedirs(OUTDIR, exist_ok=True)

    df = load(a.csv)
    print(f"{len(df)} released games since {START}; building tag fingerprints...", file=sys.stderr)
    M, vocab = fingerprints(df)
    qs, qi, totals = quarter_axis(df)
    qlabels = [str(q) for q in qs]

    if a.tags or a.keyword:
        tags = [t.strip() for t in (a.tags or "").split(",") if t.strip()]
        all_tags = {t for tl in df.tag_list for t in tl}
        unknown = [t for t in tags if t not in all_tags]
        if unknown:
            sys.exit(f"Unknown tag(s): {unknown}")
        m = theme_mask(df, tags, a.core, a.keyword, a.names_only)
        counts = np.bincount(df.q.map(qi)[m], minlength=len(qs))
        share = counts / np.where(totals == 0, 1, totals)
        on = onset(share, qs, counts=counts)
        label = " + ".join(tags) + (" (core)" if a.core else "") + (f' ~ /{a.keyword}/' if a.keyword else "")
        print(f"\nTheme: {label}   {m.sum()} games since {START}")
        print("Year   games   share")
        yr = df[m].groupby(df.release_date.dt.year).size()
        ytot = df.groupby(df.release_date.dt.year).size()
        for y in ytot.index:
            print(f"{y}  {int(yr.get(y, 0)):6d}  {fmt_pct(yr.get(y, 0) / ytot[y])}")
        if on is not None:
            print(f"\nTake-off: around {qlabels[on]} (rolling share passed 1.5x its prior 2-year level)")
        else:
            print("\nNo clear take-off quarter detected (share never sustainably beat 1.5x its baseline).")
        influencers(df, M, m, on, qs, qi, a)
        cutoff = on if on is not None else len(qs) - 1
        cand = np.where(m & (df.q.map(qi).to_numpy() <= cutoff) & (df.reviews.to_numpy() >= 200))[0]
        cand = cand[np.argsort(-df.reviews.to_numpy()[cand])][:a.top]
        if len(cand):
            W = waves(df, M, cand, qs, qi, totals, a.sim)
            print(f"\nTheme hits released before the take-off, and the wave of look-alikes after each:")
            print(f"{'released':10s} {'reviews':>8s}  {'lift':>5s}  {'before':>7s} {'after':>7s}  game")
            for w in sorted(W, key=lambda w: -(df.reviews[w['i']] * (w['lift'] if w['lift'] == w['lift'] else 1))):
                g = df.iloc[w["i"]]
                print(f"{g.release_date.date()} {g.reviews:8d}  x{w['lift']:4.1f}  {fmt_pct(w['before']):>7s} "
                      f"{fmt_pct(w['after']):>7s}  {g['name']}  ({g.developer})")
        return

    # ---- global mode: rank every hit by its follower wave -----------------------
    hits = np.where(df.reviews.to_numpy() >= a.min_reviews)[0]
    hits = hits[df.q.iloc[hits].map(qi).to_numpy() >= 8]  # need a 2-year "before" window
    if not a.adult:
        adult = df.tag_list.map(lambda tl: bool(ADULT & set(tl[:8]))).to_numpy()
        hits = hits[~adult[hits]]
    print(f"Measuring follower waves for {len(hits)} hits (>= {a.min_reviews} reviews)...", file=sys.stderr)
    W = []
    for k in range(0, len(hits), 400):  # chunk to bound memory
        W += waves(df, M, hits[k:k + 400], qs, qi, totals, a.sim)
    rows = []
    for w in W:
        g = df.iloc[w["i"]]
        rows.append({"appid": int(g.appid), "name": g["name"], "developer": g.developer,
                     "release_date": str(g.release_date.date()), "reviews": int(g.reviews),
                     "top_tags": ", ".join(g.tag_list[:6]),
                     "share_before": w["before"], "share_after": w["after"], "lift": w["lift"],
                     "followers_after": w["n_after"], "excess_games": round(w["excess"], 1),
                     "quarters_after": w["q_after"], "window_complete": w["complete"]})
    res = pd.DataFrame(rows)
    # score: how much the look-alike share rose (log lift) x how many extra games that
    # meant. Hits with under 4 quarters of after-window are too recent to score.
    res["wave_score"] = (np.log(res.lift.clip(lower=1)) * np.sqrt(res.excess_games)).round(2)
    res.loc[res.quarters_after < 4, "wave_score"] = np.nan
    res = res.sort_values("wave_score", ascending=False, na_position="last")
    res.to_csv(os.path.join(OUTDIR, "hit_waves.csv"), index=False)

    # JSON for the dashboard: all hits with their quarterly follower-share curve
    curves = {}
    for w in W:
        g = df.iloc[w["i"]]
        curves[int(g.appid)] = {
            "share": [round(float(x) * 100, 4) for x in w["share"]],
            "lift": None if w["lift"] != w["lift"] else round(w["lift"], 2),
            "before": round(w["before"] * 100, 4) if w["before"] == w["before"] else None,
            "after": round(w["after"] * 100, 4) if w["after"] == w["after"] else None,
            "n_after": int(w["n_after"]), "complete": bool(w["complete"]),
            "followers": [int(df.appid.iloc[f]) for f in w["followers"]],
        }
    json.dump({"quarters": qlabels, "sim": a.sim, "min_reviews": a.min_reviews,
               "curves": curves,
               "ranking": [int(x) for x in res.dropna(subset=["wave_score"]).appid.head(300)]},
              open(os.path.join(OUTDIR, "origins.json"), "w", encoding="utf-8"),
              separators=(",", ":"))
    print(f"Wrote output/hit_waves.csv and output/origins.json ({len(res)} hits)", file=sys.stderr)
    print(f"\nHits that set off the biggest waves of look-alike releases:")
    print(f"{'released':10s} {'reviews':>8s} {'lift':>6s} {'extra':>6s}  game  [top tags]")
    for r in res.head(a.top).itertuples():
        print(f"{r.release_date} {r.reviews:8d}  x{r.lift:4.1f} {r.excess_games:6.0f}  {r.name}  [{r.top_tags}]")


if __name__ == "__main__":
    main()
