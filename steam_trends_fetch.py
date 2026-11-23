#!/usr/bin/env python3
"""
Step 1 of 3: download every game on Steam, with every field the store API
offers, into a local data dump. Then derive steam_games.csv from it.

Usage:
    pip install requests pandas
    python steam_trends_fetch.py               # full fetch -> data/ + steam_games.csv
    python steam_trends_fetch.py --limit 500   # quick test on 500 apps
    python steam_trends_fetch.py --csv-only    # rebuild CSV from the local dump, no network
    python steam_trends_fetch.py --all-types   # also DLC, software, videos, hardware

API key: put STEAM_API_KEY=xxxx in a .env file next to this script, or set the
STEAM_API_KEY environment variable (free key: https://steamcommunity.com/dev/apikey).
Without a key it still works, but has to scan every possible appid (slower).

Local dump (everything later steps need; no re-download required):
    data/raw/part-*.jsonl.gz   one raw IStoreBrowseService/GetItems store_item per line,
                               all fields: release, tags (+weights), reviews, basic_info
                               (short description, developers, publishers, franchises),
                               full_description_bbcode, screenshots, trailers, assets,
                               platforms, languages, ratings, categories, prices/purchase
                               options, included_items, links, related_items (demos etc).
                               Each line also has "fetched_at" (unix ts). Later lines win.
    data/tags.json             tagid -> tag name
    data/categories.json       Steam store categories (ids used in "categories")
Use load_records() from this module to read the dump from Python.

Safe to stop and re-run: parts are written atomically every 20 batches, and apps
already in the dump are skipped. Entries older than --max-age-days (default 30)
are re-fetched, so a refresh months later picks up new games, tags and reviews.

Response facts checked against the live API (Nov 2026):
  * success == 1 for real apps; unknown ids come back with success 15, appid 0
    (match on "id"), no "type". type: 0 game, 1 demo, 4 DLC, 6 music, 11 soundtrack,
    12 playtest. Batches above ~100 ids fail (URL too long -> HTTP 400).
  * release.steam_release_date (unix ts), release.is_coming_soon,
    release.is_early_access, release.custom_release_date_message.
  * tags[] = {tagid, weight}; reviews.summary_filtered.{review_count, percent_positive}.
"""
import argparse
import csv
import glob
import gzip
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.steampowered.com"
DATA = os.path.join(HERE, "data")
RAW = os.path.join(DATA, "raw")
OUT = os.path.join(HERE, "steam_games.csv")
BATCH = 100
PART_BATCHES = 20  # batches per part file
PAUSE = 1.0  # seconds between requests; be polite
VERSION = 3  # bump when the requested fields change, so older records get re-fetched

DATA_REQUEST = {
    "include_assets": True, "include_release": True, "include_platforms": True,
    "include_all_purchase_options": True, "include_screenshots": True,
    "include_trailers": True, "include_ratings": True, "include_tag_count": 20,
    "include_reviews": True, "include_basic_info": True,
    "include_supported_languages": True, "include_full_description": True,
    "include_included_items": True, "include_assets_without_overrides": True,
    "include_links": True,
}

session = requests.Session()
session.headers["User-Agent"] = "steam-trends-research/1.0"


def load_key():
    key = os.environ.get("STEAM_API_KEY", "").strip()
    env = os.path.join(HERE, ".env")
    if not key and os.path.exists(env):
        for line in open(env, encoding="utf-8-sig"):
            k, _, v = line.partition("=")
            if k.strip() == "STEAM_API_KEY":
                key = v.strip().strip('"').strip("'")
    return key


KEY = load_key()


def get(url, params, tries=8):
    for i in range(tries):
        try:
            r = session.get(url, params=params, timeout=120)
            if r.status_code == 429 or r.status_code >= 500:
                wait = min(300, int(r.headers.get("Retry-After") or 0) or 15 * 2 ** i)
                print(f"  HTTP {r.status_code}, backing off {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            if r.status_code in (401, 403):
                sys.exit(f"HTTP {r.status_code} from {url.split('?')[0]}: is STEAM_API_KEY valid?")
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as e:
            wait = 5 * (i + 1)
            print(f"  error: {e}; retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"giving up on {url}")


def app_list_keyed(all_types=False):
    """All appids via IStoreService/GetAppList (needs a key)."""
    ids, last = [], 0
    t = "true" if all_types else "false"
    while True:
        data = get(f"{API}/IStoreService/GetAppList/v1/", {
            "key": KEY, "include_games": "true", "include_dlc": t,
            "include_software": t, "include_videos": t,
            "include_hardware": t, "max_results": 50000, "last_appid": last,
        }).get("response", {})
        ids += [a["appid"] for a in data.get("apps", [])]
        print(f"  app list: {len(ids)} so far")
        if not data.get("have_more_results"):
            return ids
        last = data["last_appid"]
        time.sleep(PAUSE)


def fetch_batch(appids):
    req = {
        "ids": [{"appid": a} for a in appids],
        "context": {"language": "english", "country_code": "GB"},
        "data_request": DATA_REQUEST,
    }
    params = {"input_json": json.dumps(req)}
    if KEY:
        params["key"] = KEY
    data = get(f"{API}/IStoreBrowseService/GetItems/v1/", params)
    return data.get("response", {}).get("store_items", [])


# ---------------------------------------------------------------- local dump

def parts():
    return sorted(glob.glob(os.path.join(RAW, "part-*.jsonl.gz")))


def _iter_lines():
    for p in parts():
        with gzip.open(p, "rt", encoding="utf-8") as f:
            yield from f


def load_index():
    """appid -> (fetched_at, version) for the newest record of each app."""
    idx = {}
    for line in _iter_lines():
        # cheap parse: these keys are written first on every line
        r = json.loads(line)
        idx[r["appid"]] = (r.get("fetched_at", 0), r.get("v", 1))
    return idx


def load_records(types=(0,), include_missing=False):
    """Yield the newest raw record per app from the dump (two streaming passes)."""
    newest = {}
    for i, line in enumerate(_iter_lines()):
        newest[json.loads(line)["appid"]] = i
    keep = set(newest.values())
    for i, line in enumerate(_iter_lines()):
        if i in keep:
            r = json.loads(line)
            if r.get("missing"):
                if include_missing:
                    yield r
            elif types is None or r.get("type") in types:
                yield r


class PartWriter:
    """Buffers records and writes them as an atomic gzip part file."""

    def __init__(self):
        os.makedirs(RAW, exist_ok=True)
        self.buf, self.batches = [], 0

    def add(self, records):
        self.buf += [json.dumps(r, ensure_ascii=False) for r in records]
        self.batches += 1
        if self.batches >= PART_BATCHES:
            self.flush()

    def flush(self):
        if not self.buf:
            return
        name = os.path.join(RAW, f"part-{time.strftime('%Y%m%d-%H%M%S')}-{time.time_ns() % 10**9:09d}.jsonl.gz")
        with gzip.open(name + ".tmp", "wt", encoding="utf-8", compresslevel=6) as f:
            f.write("\n".join(self.buf) + "\n")
        os.replace(name + ".tmp", name)
        self.buf, self.batches = [], 0


def process(chunk, writer, now):
    """Fetch one batch into the writer. Returns number of real apps found."""
    items = fetch_batch(chunk)
    recs, seen = [], set()
    for it in items:
        aid = it.get("appid") or it.get("id")
        if it.get("success") != 1 or not aid:
            continue
        rec = {"appid": aid, "fetched_at": now, "v": VERSION}
        rec.update({k: v for k, v in it.items() if k != "appid"})
        recs.append(rec)
        seen.add(aid)
    recs += [{"appid": a, "fetched_at": now, "v": VERSION, "missing": True}
             for a in chunk if a not in seen]
    writer.add(recs)
    return len(seen)


def compact():
    """Rewrite the dump keeping only the newest record per app."""
    old = parts()
    lines, ids = 0, set()
    for line in _iter_lines():
        lines += 1
        ids.add(json.loads(line)["appid"])
    if lines == len(ids):
        return  # no stale duplicates
    w = PartWriter()
    n = 0
    for r in load_records(types=None, include_missing=True):
        w.buf.append(json.dumps(r, ensure_ascii=False))
        n += 1
        if len(w.buf) >= BATCH * PART_BATCHES:
            w.flush()
            time.sleep(0.001)  # unique part names
    w.flush()
    for p in old:
        os.remove(p)
    print(f"Compacted dump: {n} records in {len(parts())} parts")


def save_lookups():
    os.makedirs(DATA, exist_ok=True)
    try:
        r = session.get("https://store.steampowered.com/tagdata/populartags/english", timeout=60)
        r.raise_for_status()
        tags = {t["tagid"]: t["name"] for t in r.json()}
    except Exception:
        params = {"language": "english"}
        if KEY:
            params["key"] = KEY
        data = get(f"{API}/IStoreService/GetTagList/v1/", params)
        tags = {t["tagid"]: t["name"] for t in data["response"]["tags"]}
    json.dump(tags, open(os.path.join(DATA, "tags.json"), "w", encoding="utf-8"), indent=0)
    try:
        params = {"language": "english"}
        if KEY:
            params["key"] = KEY
        cats = get(f"{API}/IStoreBrowseService/GetStoreCategories/v1/", params)["response"]["categories"]
        json.dump(cats, open(os.path.join(DATA, "categories.json"), "w", encoding="utf-8"), indent=1)
    except Exception as e:
        print(f"  (couldn't save categories: {e})")


def load_tag_names():
    p = os.path.join(DATA, "tags.json")
    if not os.path.exists(p):
        save_lookups()
    return {int(k): v for k, v in json.load(open(p, encoding="utf-8")).items()}


# ---------------------------------------------------------------- CSV

def write_csv():
    names = load_tag_names()
    rows = 0
    with open(OUT, "w", newline="", encoding="utf-8") as out:
        w = csv.writer(out)
        w.writerow(["appid", "name", "release_date", "coming_soon", "early_access",
                    "unlisted", "release_text", "tags", "tag_weights",
                    "reviews", "pct_positive", "developer", "publisher", "franchise",
                    "is_free", "price_gbp", "description"])
        for it in load_records(types=(0,)):
            if "name" not in it:
                continue
            rel = it.get("release") or {}
            ts = rel.get("steam_release_date")
            date = datetime.fromtimestamp(ts, timezone.utc).date().isoformat() if ts else ""
            tags = sorted(it.get("tags") or [], key=lambda t: -t.get("weight", 0))
            rv = (it.get("reviews") or {}).get("summary_filtered") or {}
            bi = it.get("basic_info") or {}
            names_of = lambda k: ", ".join(d["name"] for d in bi.get(k, []) if d.get("name"))
            price = (it.get("best_purchase_option") or {}).get("final_price_in_cents")
            w.writerow([it["appid"], it.get("name", ""), date,
                        int(bool(rel.get("is_coming_soon"))),
                        int(bool(rel.get("is_early_access"))),
                        int(bool(it.get("unlisted"))),
                        rel.get("custom_release_date_message", ""),
                        "|".join(names.get(t["tagid"], str(t["tagid"])) for t in tags),
                        "|".join(str(t.get("weight", 0)) for t in tags),
                        rv.get("review_count", 0), rv.get("percent_positive", 0),
                        names_of("developers"), names_of("publishers"), names_of("franchises"),
                        int(bool(it.get("is_free"))),
                        f"{int(price) / 100:.2f}" if price else "",
                        " ".join((bi.get("short_description") or "").split())])
            rows += 1
    print(f"Done: {rows} games written to {OUT}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--limit", type=int, help="only fetch this many new apps (testing)")
    ap.add_argument("--max-age-days", type=float, default=30,
                    help="re-fetch records older than this (default 30)")
    ap.add_argument("--csv-only", action="store_true", help="rebuild the CSV from the dump only")
    ap.add_argument("--scan", action="store_true", help="force the keyless appid scan")
    ap.add_argument("--all-types", action="store_true",
                    help="with a key: also fetch DLC, software, videos, hardware")
    a = ap.parse_args()

    if not a.csv_only:
        now = int(time.time())
        cutoff = now - a.max_age_days * 86400
        done = {aid for aid, (ts, v) in load_index().items() if ts >= cutoff and v >= VERSION}
        print(f"Fresh in dump: {len(done)} apps")
        w = PartWriter()
        try:
            if KEY and not a.scan:
                print("Fetching app list (with API key)...")
                ids = [x for x in dict.fromkeys(app_list_keyed(a.all_types)) if x not in done]
                if a.limit:
                    ids = ids[-a.limit:]  # newest apps: most informative for testing
                print(f"{len(ids)} apps to fetch")
                for n in range(0, len(ids), BATCH):
                    process(ids[n:n + BATCH], w, now)
                    if (n // BATCH) % 20 == 0:
                        print(f"  {n + BATCH}/{len(ids)}", flush=True)
                    time.sleep(PAUSE)
            else:
                # Keyless: ISteamApps/GetAppList now returns 404, so walk appids
                # (all multiples of 10) until a long empty stretch.
                print("No API key: scanning appid range (slow; a key is recommended)")
                appid, empty, fetched = 10, 0, 0
                while True:
                    chunk = [x for x in range(appid, appid + BATCH * 10, 10) if x not in done]
                    appid += BATCH * 10
                    if chunk:
                        empty = 0 if process(chunk, w, now) else empty + 1
                        fetched += len(chunk)
                        time.sleep(PAUSE)
                    if appid % 100000 == 10:
                        print(f"  scanned up to appid {appid}", flush=True)
                    if (appid > 4_000_000 and empty >= 50) or (a.limit and fetched >= a.limit):
                        break
        finally:
            w.flush()
        save_lookups()
        compact()

    write_csv()


if __name__ == "__main__":
    main()
