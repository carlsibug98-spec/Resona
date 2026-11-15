#!/usr/bin/env python3
"""
Create (or update) a GitHub release and upload assets.

Usage: python3 scripts/gh-release-upload.py <tag> <release-name> <body-file> <asset-dir>

- token read from /tmp/.ghtoken
- the release is created against current main; the tag is created by GitHub
- every file in <asset-dir> is uploaded (skipped if already present)
"""
import json
import os
import sys
import urllib.request

TAG = sys.argv[1]
NAME = sys.argv[2]
BODY_FILE = sys.argv[3]
ASSET_DIR = sys.argv[4]
REPO = "carlsibug98-spec/Resona"
API = f"https://api.github.com/repos/{REPO}"
TOKEN = open("/tmp/.ghtoken").read().strip()


def call(method, url, data=None, ctype="application/json", ok=(200, 201)):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    if data is not None:
        req.add_header("Content-Type", ctype)
        data = data if isinstance(data, bytes) else json.dumps(data).encode()
    with urllib.request.urlopen(req, data) as r:
        body = r.read()
        assert r.status in ok, f"{method} {url} -> {r.status}"
        return body


# 1. create the release (or reuse it if it already exists)
try:
    rel = json.loads(call("POST", f"{API}/releases", {
        "tag_name": TAG,
        "target_commitish": "main",
        "name": NAME,
        "body": open(BODY_FILE).read(),
        "draft": False,
        "prerelease": False,
    }))
    print(f"release created: {rel['tag_name']} (id {rel['id']})")
except urllib.error.HTTPError as e:
    if e.code == 422:  # already_exists — fetch it
        rel = json.loads(call("GET", f"{API}/releases/tags/{TAG}"))
        print(f"release exists: {rel['tag_name']} (id {rel['id']})")
    else:
        raise

have = {a["name"] for a in rel["assets"]}
upload_url = rel["upload_url"].split("{")[0]

# 2. upload assets, biggest last so small metadata files land first
files = sorted(os.listdir(ASSET_DIR), key=lambda f: os.path.getsize(os.path.join(ASSET_DIR, f)))
for f in files:
    if f in have:
        print(f"  skip (already uploaded): {f}")
        continue
    path = os.path.join(ASSET_DIR, f)
    with open(path, "rb") as fh:
        data = fh.read()
    ctype = "application/octet-stream"
    if f.endswith(".yml") or f.endswith(".yaml"):
        ctype = "text/yaml"
    elif f.endswith(".txt") or f.endswith(".md"):
        ctype = "text/plain"
    call("POST", f"{upload_url}?name={f}", data, ctype=ctype, ok=(200, 201))
    print(f"  uploaded: {f} ({len(data) // (1024 * 1024)} MB)")

print("done:", TAG)
