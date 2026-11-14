#!/usr/bin/env bash
# Publishes a Resona release to GitHub.
#
#   ./scripts/gh-release.sh 1.3.0
#
# Requires: the installer built at desktop/dist/Resona-Setup-<version>.exe
# and a token with repo access in /tmp/.ghtoken (never echoed).
#
# IMPORTANT: latest.yml must be uploaded — it is the feed the desktop app's
# auto-updater reads to notice and download new versions.
set -euo pipefail

VERSION="${1:?usage: gh-release.sh <version> e.g. gh-release.sh 1.3.0}"
TOKEN=$(cat /tmp/.ghtoken)
REPO="carlsibug98-spec/Resona"
API="https://api.github.com/repos/$REPO"
AUTH="Authorization: Bearer $TOKEN"

EXE="desktop/dist/Resona-Setup-$VERSION.exe"
LATEST_YML="desktop/dist/latest.yml"
[ -f "$EXE" ] || { echo "missing $EXE — build it first (npx electron-builder --win nsis)"; exit 1; }

BODY=$(cat <<MD
## What's new in v$VERSION

- **Downloads that just work** — the app now keeps its own downloader (yt-dlp) up to date automatically, with a live fallback fleet of community instances (approach ported from OpenSpot).
- **Self-updating desktop app** — on launch it checks GitHub releases, downloads any newer build in the background, and installs it on restart. No more manual reinstalling.
- **Honest download UI** — the button disappears on servers that truly can't download, shows setup progress on first run, and removing an offline copy now asks first.
- Partial restore with merge/replace, mobile now-playing screen, and all earlier v1.2.x fixes.

## Install (Windows 10 / 11, 64-bit)

1. Download \`Resona-Setup-$VERSION.exe\` below
2. If SmartScreen shows a warning: click **More info → Run anyway** (the installer is not code-signed yet)
3. Follow the setup wizard — a desktop shortcut is created automatically

Updating from v1.2.x: install this once over your current copy (your library and offline music are kept). From v1.3.0 on, Resona updates itself automatically - future releases install on restart.
MD
)

python3 - "$BODY" "$VERSION" <<'PY' > /tmp/release.json
import json, sys
print(json.dumps({
    "tag_name": "v" + sys.argv[2],
    "target_commitish": "v" + sys.argv[2],
    "name": f"Resona v{sys.argv[2]}",
    "body": sys.argv[1],
    "draft": False,
    "prerelease": False,
}))
PY

echo "== creating release v$VERSION =="
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
UPURL=$(grep -o 'upload_url: .*' /tmp/rel_info.txt | cut -d ' ' -f2)

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

upload "$EXE" "Resona-Setup-$VERSION.exe" "application/octet-stream"

# differential update map (optional - full download works without it)
if [ -f "desktop/dist/Resona-Setup-$VERSION.exe.blockmap" ]; then
  upload "desktop/dist/Resona-Setup-$VERSION.exe.blockmap" "Resona-Setup-$VERSION.exe.blockmap" "application/octet-stream"
fi

# the auto-updater feed — without this, installed apps never see the update
if [ -f "$LATEST_YML" ]; then
  upload "$LATEST_YML" "latest.yml" "text/yaml"
else
  echo "WARNING: $LATEST_YML not found — the in-app auto-updater will NOT see this release."
  echo "         Build with the publish config present so electron-builder emits latest.yml."
fi

if [ -f "download/INSTALL-GUIDE.txt" ]; then
  upload "download/INSTALL-GUIDE.txt" "INSTALL-GUIDE.txt" "text/plain"
fi

echo "== release v$VERSION done =="
