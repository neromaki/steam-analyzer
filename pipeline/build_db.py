#!/usr/bin/env python3
"""
Build the web app's database from the local Steam dump and upload it to Supabase.

    python pipeline/build_db.py                # build + upload (needs SUPABASE_DB_URL in .env)
    python pipeline/build_db.py --db postgresql://postgres:local@127.0.0.1:54329/postgres
    python pipeline/build_db.py --no-upload    # build + report only

Steps: read data/raw (steam_trends_fetch.load_records) -> slim game rows -> tag
fingerprints + description embeddings -> hit-wave leaderboard for each quality-floor
preset -> apply supabase/migrations -> replace all rows in one transaction (readers keep
seeing the old data until it commits).
"""
import argparse
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

from steam_trends_fetch import load_records, load_tag_names  # noqa: E402
from steam_trends_origins import NON_CONTENT  # noqa: E402
import embed  # noqa: E402

MIGRATIONS = os.path.join(ROOT, "supabase", "migrations")
ASSET_CDN = "https://shared.fastly.steamstatic.com/store_item_assets/"
ADULT_TAGS = {"Sexual Content", "Nudity", "Hentai", "NSFW"}
ADULT_DESCRIPTORS = {3, 4}  # Adult Only Sexual Content, Frequent Nudity or Sexual Content

# Quality-floor presets. The web app has the same values (web/src/lib/floor.ts).
PRESETS = {
    "off": {},
    "default": {"minReviews": 10, "graceDays": 90, "minPrice": 2, "excludeAdult": True},
    "strict": {"minReviews": 50, "graceDays": 90, "minPrice": 5, "excludeAdult": True},
}
SIM_DEFAULTS = {"wText": 0.3, "minSim": 0.49}  # calibrated: same strictness as tag-only 0.6
HIT_REVIEWS = 2000
LEADERBOARD_TOP = 300
FIRST_Q = 2012 * 4  # leaderboard / wave axis starts 2012Q1

BB = re.compile(r"\[/?[^\]]{0,40}\]|https?://\S+")


def env(key):
    v = os.environ.get(key)
    if v:
        return v
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            k, _, val = line.strip().partition("=")
            if k == key and val:
                return val.strip().strip('"').strip("'")
    return None


# ---------------------------------------------------------------- read the dump

def price_of(it, name):
    """Full (undiscounted) price of the game itself in GBP, not of a bundle."""
    opts = [o for o in (it.get("purchase_options") or []) if isinstance(o, dict)]
    own = [o for o in opts if o.get("packageid") and o.get("purchase_option_name") == name] \
        or [o for o in opts if o.get("packageid")] \
        or ([it["best_purchase_option"]] if isinstance(it.get("best_purchase_option"), dict) else [])
    if not own:
        return None
    o = own[0]
    c = o.get("original_price_in_cents") or o.get("price_before_bundle_discount") or o.get("final_price_in_cents")
    try:
        return round(int(c) / 100, 2) if c is not None else None
    except (TypeError, ValueError):
        return None


def header_of(it):
    a = it.get("assets") or {}
    fmt, h = a.get("asset_url_format"), a.get("header")
    return ASSET_CDN + fmt.replace("${FILENAME}", h) if fmt and h else None


def steamdb_rating(pct, n):
    """SteamDB's rating: review score pulled toward 50% when there are few reviews."""
    if not n:
        return None
    s = pct / 100
    return round((s - (s - 0.5) * 2 ** (-math.log10(n + 1))) * 100, 2)


def read_games():
    names = load_tag_names()
    games, texts, fetched = [], {}, 0
    for it in load_records(types=(0,)):
        name = it.get("name")
        if not name or it.get("unlisted"):
            continue
        fetched = max(fetched, it.get("fetched_at") or 0)
        rel = it.get("release") or {}
        ts = rel.get("steam_release_date")
        d = datetime.fromtimestamp(ts, timezone.utc).date() if ts else None
        soon = bool(rel.get("is_coming_soon") or it.get("is_coming_soon"))
        tags = sorted((t for t in (it.get("tags") or []) if t.get("tagid") in names),
                      key=lambda t: -t.get("weight", 0))
        top = max((t.get("weight", 0) for t in tags), default=0) or 1
        tag_ids = [int(t["tagid"]) for t in tags]
        tag_w = [max(1, round(t.get("weight", 0) / top * 100)) for t in tags]
        rv = (it.get("reviews") or {}).get("summary_filtered") or {}
        n_rev, pct = int(rv.get("review_count") or 0), int(rv.get("percent_positive") or 0)
        bi = it.get("basic_info") or {}
        names_of = lambda k: ", ".join(x["name"] for x in bi.get(k, []) if x.get("name"))
        desc = " ".join((bi.get("short_description") or "").split())
        top8 = {names[t] for t in tag_ids[:8]}
        adult = bool(ADULT_TAGS & top8) or bool(ADULT_DESCRIPTORS & set(it.get("content_descriptorids") or []))
        games.append({
            "appid": int(it["appid"]), "name": name, "release_date": d,
            "release_q": d.year * 4 + (d.month - 1) // 3 if d else None,
            "coming_soon": soon, "early_access": bool(rel.get("is_early_access") or it.get("is_early_access")),
            "is_free": bool(it.get("is_free")), "price_gbp": price_of(it, name),
            "reviews": n_rev, "pct_positive": pct, "rating": steamdb_rating(pct, n_rev),
            "developer": names_of("developers"), "publisher": names_of("publishers"),
            "header_image": header_of(it), "short_description": desc[:300],
            "tag_ids": tag_ids, "tag_w": tag_w, "is_adult": adult,
        })
        full = BB.sub(" ", it.get("full_description_bbcode") or "")
        texts[int(it["appid"])] = f"{name}. {desc} {' '.join(full.split())[:500]}"
    return games, texts, names, datetime.fromtimestamp(fetched, timezone.utc).date()


# ---------------------------------------------------------------- vectors

def tag_vectors(games, names):
    """Sparse fingerprints: vote weight x idf over content tags, unit length.
    Same recipe as steam_trends_origins.fingerprints()."""
    all_ids = sorted(names)
    ix = {t: i + 1 for i, t in enumerate(all_ids)}  # 1-based for sparsevec
    content = {t for t in all_ids if names[t] not in NON_CONTENT}
    released = [g for g in games if not g["coming_soon"] and g["release_date"]]
    df = np.zeros(len(all_ids) + 1)
    for g in released:
        for t in g["tag_ids"]:
            if t in content:
                df[ix[t]] += 1
    idf = np.log((len(released) + 1) / (df + 1))
    n_games = np.zeros(len(all_ids) + 1, dtype=int)
    for g in released:
        for t in g["tag_ids"]:
            n_games[ix[t]] += 1
    vecs = []
    for g in games:
        pairs = {}
        for t, w in zip(g["tag_ids"], g["tag_w"]):
            if t in content:
                pairs[ix[t]] = w / 100 * idf[ix[t]]
        nrm = math.sqrt(sum(v * v for v in pairs.values())) or 1
        vecs.append({k: v / nrm for k, v in sorted(pairs.items())})
    tags = [{"id": t, "name": names[t], "ix": ix[t], "idf": float(idf[ix[t]]), "content": t in content,
             "adult": names[t] in ADULT_TAGS, "n_games": int(n_games[ix[t]])} for t in all_ids]
    return vecs, tags, len(all_ids)


def sparse_text(d, dim):
    return "{" + ",".join(f"{k}:{v:.5f}" for k, v in d.items()) + "}/" + str(dim)


def dense_tags(vecs, dim):
    M = np.zeros((len(vecs), dim + 1), dtype=np.float32)
    for r, d in enumerate(vecs):
        for k, v in d.items():
            M[r, k] = v
    return M


# ---------------------------------------------------------------- quality floor (mirrors SQL passes())

def floor_mask(games, f, data_date):
    if not f:
        return np.ones(len(games), dtype=bool)
    out = np.zeros(len(games), dtype=bool)
    grace = f.get("graceDays", 0)
    for i, g in enumerate(games):
        if f.get("excludeAdult") and g["is_adult"]:
            continue
        if f.get("earlyAccess") is False and g["early_access"]:
            continue
        if not g["coming_soon"]:
            recent = g["release_date"] and (data_date - g["release_date"]).days < grace
            if g["reviews"] < f.get("minReviews", 0) and not recent:
                continue
            mp = f.get("minPrice", 0)
            if mp > 0 and not g["is_free"] and (g["price_gbp"] is None or g["price_gbp"] < mp):
                continue
        out[i] = True
    return out


# ---------------------------------------------------------------- hit waves

def leaderboard(games, Mt, Mx, preset, f, data_date, w_text, min_sim, after=(2, 12), before=8):
    keep = floor_mask(games, f, data_date)
    released = np.array([not g["coming_soon"] and g["release_date"] is not None and g["release_date"] <= data_date
                         for g in games])
    rq = np.array([g["release_q"] if g["release_q"] is not None else -1 for g in games])
    pool = keep & released & (rq >= FIRST_Q)
    last_q = data_date.year * 4 + (data_date.month - 1) // 3
    nq = last_q - FIRST_Q + 1
    qpos = np.where(pool, rq - FIRST_Q, -1)
    totals = np.bincount(qpos[pool], minlength=nq).astype(float)
    reviews = np.array([g["reviews"] for g in games])
    dev = np.array([g["developer"].lower() for g in games])
    hits = np.where(pool & (reviews >= HIT_REVIEWS) & (qpos >= before)
                    & ~np.array([g["is_adult"] for g in games]))[0]
    pidx = np.where(pool)[0]
    Mt_p, Mx_p = Mt[pidx], Mx[pidx]
    q_p, dev_p, rev_p = qpos[pidx], dev[pidx], reviews[pidx]
    rows = []
    for s in range(0, len(hits), 200):
        H = hits[s:s + 200]
        S = (1 - w_text) * (Mt[H] @ Mt_p.T) + w_text * (Mx[H] @ Mx_p.T)
        for k, h in enumerate(H):
            m = (S[k] >= min_sim) & (dev_p != dev[h]) & (pidx != h)
            counts = np.bincount(q_p[m], minlength=nq)
            share = np.divide(counts, totals, out=np.zeros(nq), where=totals > 0)
            hq = qpos[h]
            b, a = share[max(0, hq - before):hq], share[hq + after[0]: hq + after[1] + 1]
            if not len(b):
                continue
            sb, sa = float(b.mean()), (float(a.mean()) if len(a) else float("nan"))
            q_after = max(0, min(nq - 1, hq + after[1]) - hq - after[0] + 1)
            eps = 0.5 / max(1.0, float(totals[max(0, hq - before):hq + 1].mean()))
            lift = (sa + eps) / (sb + eps) if len(a) else float("nan")
            win_tot = totals[hq + after[0]: hq + after[1] + 1].sum()
            excess = max(0.0, (sa - sb) * win_tot) if len(a) else 0.0
            n_after = int(counts[hq + 1: hq + after[1] + 1].sum())
            score = math.log(max(lift, 1)) * math.sqrt(excess) if q_after >= 4 and lift == lift else None
            fol = np.where(m & (q_p > hq))[0]
            fol = fol[np.argsort(-rev_p[fol])][:15]
            rows.append({"appid": games[h]["appid"], "lift": lift, "sb": sb * 100, "sa": sa * 100,
                         "excess": excess, "n_after": n_after, "score": score,
                         "share": [round(float(x) * 100, 4) for x in share],
                         "followers": [games[pidx[i]]["appid"] for i in fol]})
    ranked = sorted((r for r in rows if r["score"] is not None), key=lambda r: -r["score"])[:LEADERBOARD_TOP]
    for i, r in enumerate(ranked):
        r["rank"], r["preset"] = i + 1, preset
    print(f"  leaderboard[{preset}]: {len(hits)} hits, {len(ranked)} ranked; top: "
          + ", ".join(games_by_id[r['appid']]['name'] for r in ranked[:5]), file=sys.stderr)
    return ranked


# ---------------------------------------------------------------- upload

def apply_migrations(conn):
    for fn in sorted(os.listdir(MIGRATIONS)):
        if fn.endswith(".sql"):
            sql = open(os.path.join(MIGRATIONS, fn), encoding="utf-8").read()
            conn.execute(sql)
            print(f"  applied {fn}", file=sys.stderr)
    conn.commit()


def upload(db_url, games, tags, tvecs, xvecs, dim, boards, meta):
    import psycopg
    t0 = time.time()
    with psycopg.connect(db_url, autocommit=False) as conn:
        conn.execute("set statement_timeout = 0")
        apply_migrations(conn)
        with conn.transaction():
            conn.execute("truncate meta, leaderboard, game_vec, games, tags")
            with conn.cursor().copy("copy tags (id, name, ix, idf, content, adult, n_games) from stdin") as cp:
                for t in tags:
                    cp.write_row([t["id"], t["name"], t["ix"], t["idf"], t["content"], t["adult"], t["n_games"]])
            cols = ["appid", "name", "release_date", "release_q", "coming_soon", "early_access", "is_free",
                    "price_gbp", "reviews", "pct_positive", "rating", "developer", "publisher", "header_image",
                    "short_description", "tag_ids", "tag_w", "is_adult"]
            with conn.cursor().copy(f"copy games ({', '.join(cols)}) from stdin") as cp:
                for g in games:
                    cp.write_row([g[c] for c in cols])
            print(f"  games copied ({time.time() - t0:.0f}s)", file=sys.stderr)
            with conn.cursor().copy("copy game_vec (appid, tag_vec, text_vec) from stdin") as cp:
                for g, tv, xv in zip(games, tvecs, xvecs):
                    cp.write_row([g["appid"], sparse_text(tv, dim),
                                  "[" + ",".join(f"{x:.4f}" for x in xv) + "]"])
            print(f"  vectors copied ({time.time() - t0:.0f}s)", file=sys.stderr)
            with conn.cursor().copy("copy leaderboard (preset, rank, appid, lift, share_before, share_after, excess, "
                                    "n_after, score, first_q, share, followers) from stdin") as cp:
                for b in boards:
                    for r in b:
                        cp.write_row([r["preset"], r["rank"], r["appid"], r["lift"], r["sb"], r["sa"], r["excess"],
                                      r["n_after"], r["score"], FIRST_Q, r["share"], r["followers"]])
            conn.execute("insert into meta (id, built_at, fetched_to, n_games, settings) values (1, now(), %s, %s, %s)",
                         [meta["fetched_to"], len(games), json.dumps(meta["settings"])])
        conn.execute("analyze")
        conn.commit()
        size = conn.execute("select pg_database_size(current_database())").fetchone()[0] / 1e6
        rows = conn.execute("select (select count(*) from games), (select count(*) from game_vec), "
                            "(select count(*) from leaderboard)").fetchone()
        sizes = conn.execute("select relname, pg_total_relation_size(c.oid) / 1e6 from pg_class c "
                             "join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' "
                             "and c.relkind = 'r' order by 2 desc").fetchall()
    print(f"Uploaded in {time.time() - t0:.0f}s: {rows[0]} games, {rows[1]} vectors, {rows[2]} leaderboard rows")
    print("Table sizes: " + ", ".join(f"{n} {s:.0f} MB" for n, s in sizes))
    print(f"Database size: {size:.0f} MB" + ("   WARNING: near the 500 MB free-tier limit" if size > 450 else ""))


# ---------------------------------------------------------------- main

games_by_id = {}


def main():
    ap = argparse.ArgumentParser(description="Build and upload the web app database.")
    ap.add_argument("--db", help="Postgres URL (default: SUPABASE_DB_URL from .env)")
    ap.add_argument("--no-upload", action="store_true", help="build and report only")
    ap.add_argument("--w-text", type=float, default=SIM_DEFAULTS["wText"])
    ap.add_argument("--min-sim", type=float, default=SIM_DEFAULTS["minSim"])
    ap.add_argument("--text-dims", type=int, default=128)
    a = ap.parse_args()

    t0 = time.time()
    games, texts, names, fetched_to = read_games()
    games_by_id.update({g["appid"]: g for g in games})
    print(f"{len(games)} games read ({time.time() - t0:.0f}s); data date {fetched_to}", file=sys.stderr)

    tvecs, tags, dim = tag_vectors(games, names)
    appids, X = embed.embed({g["appid"]: texts[g["appid"]] for g in games})
    Xr, kept = embed.pca_reduce(X, a.text_dims)
    print(f"Text vectors: PCA to {a.text_dims} dims keeps {kept:.0%} of variance", file=sys.stderr)

    Mt = dense_tags(tvecs, dim)
    boards = [leaderboard(games, Mt, Xr, p, f, fetched_to, a.w_text, a.min_sim) for p, f in PRESETS.items()]
    del Mt

    meta = {"fetched_to": fetched_to,
            "settings": {"presets": PRESETS, "wText": a.w_text, "minSim": a.min_sim, "hitReviews": HIT_REVIEWS,
                         "textModel": embed.MODEL, "textDims": a.text_dims, "firstQ": FIRST_Q}}
    if a.no_upload:
        print("Built (not uploaded).")
        return
    db = a.db or env("SUPABASE_DB_URL")
    if not db:
        sys.exit("No database URL: add SUPABASE_DB_URL to .env (see .env.example) or pass --db.")
    upload(db, games, tags, tvecs, Xr, dim, boards, meta)


if __name__ == "__main__":
    main()
