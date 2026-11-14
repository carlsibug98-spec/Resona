#!/usr/bin/env bash
# Creates GitHub Release v1.2.0 for carlsibug98-spec/Resona and uploads assets.
# Token is read from /tmp/.ghtoken (never echoed).
set -euo pipefail
TOKEN=$(cat /tmp/.ghtoken)
REPO="carlsibug98-spec/Resona"
API="https://api.github.com/repos/$REPO"
AUTH="Authorization: Bearer $TOKEN"

BODY=$(cat <<'MD'
## What's new in v1.2.0

- **Brand-new Home screen** modeled on the Spotify desktop experience — quick-access tiles (Liked Songs, Chill Hits, Focus Flow...), *Made For You* and *Recently played* shelves, All/Music/Podcasts filter chips
- **Two-panel sidebar** — navigation plus a persistent library panel with Liked Songs and recent playlists
- **Full-width player bar** — shuffle, repeat, seekable progress, volume, like/unlike, context info
- **Performance fix** — trending data is cached server-side for 6 h; the home screen now opens instantly
- **Fixes** — build errors resolved, lyrics view and import flow polished

## Install (Windows 10 / 11, 64-bit)

1. Download `Resona-Setup-1.2.0.exe` below (~155 MB)
2. If SmartScreen shows a warning: click **More info → Run anyway** (the installer is not code-signed yet)
3. Follow the setup wizard — a desktop shortcut is created automatically

**Verify (SHA-256):**
`90e0a9327578e05147d6f9b437369c67553c4bdf00febf0a9ce17066f1682e84`

## Files

| File | Purpose |
| --- | --- |
| `Resona-Setup-1.2.0.exe` | Windows installer |
| `INSTALL-GUIDE.txt` | Step-by-step install & troubleshooting guide |

Resona is **free forever**, MIT-licensed, no account required. It is not affiliated with YouTube, Google or Spotify.
MD
)

python3 - "$BODY" <<'PY' > /tmp/release.json
import json, sys
print(json.dumps({
    "tag_name": "v1.2.0",
    "target_commitish": "main",
    "name": "Resona v1.2.0 — Spotify-style Home",
    "body": sys.argv[1],
    "draft": False,
    "prerelease": False,
}))
PY

echo "== creating release =="
RESP=$(curl -s -X POST -H "$AUTH" -H "Accept: application/vnd.github+json" "$API/releases" -d @/tmp/release.json)
echo "$RESP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if 'id' in d:
    print('OK release id:', d['id'], '| upload_url:', d['upload_url'].split('{')[0])
else:
    print('ERR', json.dumps(d)[:400]); sys.exit(1)
" > /tmp/rel_info.txt
cat /tmp/rel_info.txt
if grep -q ERR /tmp/rel_info.txt; then exit 1; fi
RELID=$(grep -o 'release id: [0-9]*' /tmp/rel_info.txt | grep -o '[0-9]*$')
UPURL=$(grep -o 'upload_url: .*' /tmp/rel_info.txt | cut -d' ' -f2)

upload () {
  local f="$1" name="$2" ctype="$3"
  echo "== uploading $name =="
  curl -s -X POST \
    -H "$AUTH" \
    -H "Content-Type: $ctype" \
    -H "Content-Length: $(stat -c%s "$f")" \
    --data-binary @"$f" \
    "$UPURL?name=$name" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if 'state' in d:
    print('OK asset:', d['name'], d['state'], round(d['size']/1024/1024,1), 'MB')
else:
    print('ERR', json.dumps(d)[:300]); sys.exit(1)
"
}

upload "/home/z/my-project/download/Resona-Setup-1.2.0.exe" "Resona-Setup-1.2.0.exe" "application/octet-stream"
upload "/home/z/my-project/download/INSTALL-GUIDE.txt" "INSTALL-GUIDE.txt" "text/plain"

echo "== release done =="
