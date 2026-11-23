"""
Description embeddings for "games that are about the same thing".

Uses the small sentence-transformers model all-MiniLM-L6-v2 on CPU. Results are cached
in data/embeddings.npz keyed by appid + a hash of the text, so a refresh only embeds
games that are new or whose store text changed.

One-off install:  python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
                  python -m pip install sentence-transformers
"""
import hashlib
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "data", "embeddings.npz")
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DIM = 384


def _hash(text):
    return int.from_bytes(hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest(), "little", signed=True)


def _load_cache():
    if not os.path.exists(CACHE):
        return {}
    z = np.load(CACHE)
    return {int(a): (int(h), i) for i, (a, h) in enumerate(zip(z["appids"], z["hashes"]))}, z["vecs"]


def embed(texts, batch=256):
    """texts: {appid: text}. Returns (appids array, float32 unit vectors [n, 384]) in the
    order of `texts`."""
    appids = np.fromiter(texts.keys(), dtype=np.int64, count=len(texts))
    hashes = np.array([_hash(t) for t in texts.values()], dtype=np.int64)
    out = np.zeros((len(texts), DIM), dtype=np.float16)
    todo = np.ones(len(texts), dtype=bool)

    cached = _load_cache()
    if cached:
        index, vecs = cached
        for k, (a, h) in enumerate(zip(appids, hashes)):
            hit = index.get(int(a))
            if hit and hit[0] == h:
                out[k] = vecs[hit[1]]
                todo[k] = False
    n_todo = int(todo.sum())
    print(f"Embeddings: {len(texts) - n_todo} cached, {n_todo} to compute", file=sys.stderr)

    if n_todo:
        from sentence_transformers import SentenceTransformer  # slow import; only when needed
        model = SentenceTransformer(MODEL, device="cpu")
        model.max_seq_length = 256
        vals = list(texts.values())
        idx = np.where(todo)[0]
        step = batch * 40
        for s in range(0, len(idx), step):
            chunk = idx[s:s + step]
            v = model.encode([vals[i] for i in chunk], batch_size=batch, normalize_embeddings=True,
                             show_progress_bar=False, convert_to_numpy=True)
            out[chunk] = v.astype(np.float16)
            print(f"  embedded {min(s + step, len(idx))}/{len(idx)}", file=sys.stderr)
            _save(appids, hashes, out, todo, upto=s + step, idx=idx)
        _save(appids, hashes, out, todo, upto=len(idx), idx=idx)
    v = out.astype(np.float32)
    v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
    return appids, v


def _save(appids, hashes, out, todo, upto, idx):
    """Save everything computed so far (cached + this run), so an interrupted run resumes."""
    done = ~todo
    done[idx[:upto]] = True
    tmp = CACHE + ".tmp.npz"
    np.savez(tmp, appids=appids[done], hashes=hashes[done], vecs=out[done])
    os.replace(tmp, CACHE)


def pca_reduce(v, dims=128, sample=30000, seed=0):
    """Centre, project onto the top `dims` principal components, re-normalise.
    Centring removes the direction every description shares, which sharpens cosine."""
    rng = np.random.default_rng(seed)
    mu = v.mean(0)
    s = v[rng.choice(len(v), min(sample, len(v)), replace=False)] - mu
    _, sv, vt = np.linalg.svd(s, full_matrices=False)
    comp = vt[:dims]
    kept = float((sv[:dims] ** 2).sum() / (sv ** 2).sum())
    r = (v - mu) @ comp.T
    r /= np.maximum(np.linalg.norm(r, axis=1, keepdims=True), 1e-9)
    return r.astype(np.float32), kept
