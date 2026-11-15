#!/usr/bin/env bash
# Update the v1.3.0 GitHub release body (mockup release notes + honest update note).
set -euo pipefail
TOKEN=$(tr -d '[:space:]' < "/home/z/my-project/upload/token for all.txt")
API="https://api.github.com/repos/carlsibug98-spec/Resona"
AUTH="Authorization: Bearer $TOKEN"
RID=445329468

BODY=$(cat <<'MD'
## What's new in v1.3.0 — the mockup is now the app

The approved UI mockup is the app. Every screen was rebuilt against the mockup's
stylesheet, so layout, colors and animations match the design exactly.

- **New UI everywhere** — home with greeting, quick tiles and "Jump back in" /
  "Made for you" shelves; search with genre tiles; library, playlist, artist and
  album views; trending by region (81 markets); redesigned settings
- **Karaoke-style synced lyrics** — real LRCLIB synced lyrics: lines fill as you
  listen, click a line to seek, and after you scroll manually a "Sync to song"
  button brings you back
- **Full-screen now playing** — art, lyrics, video and credits modes (real
  YouTube video playback)
- **Starter library** — a few OPM picks are seeded on first run, resolved through
  real search; clearable in Settings
- **Better downloads** — progress ring, confirm-before-remove, honest failure states
- **In-app update check** — Resona checks this repo's releases hourly and tells
  you when a new build is out

## Install (Windows 10 / 11, 64-bit)

1. Download `Resona-Setup-1.3.0.exe` below (~150 MB)
2. If SmartScreen shows a warning: click **More info → Run anyway** — the
   installer is not code-signed yet (a certificate costs ~$100+/year; see the
   README for details and the Properties → Unblock alternative)
3. Follow the setup wizard — a desktop shortcut is created automatically

## Already running the v1.3.0 build from Nov 14?

This is a refreshed 1.3.0 with the new UI. The auto-updater does not offer
same-version updates, so **install this once over your current copy** — your
library, playlists and offline music are kept.

Updating from v1.2.x: the same — install over your current copy once. From the
next release on, Resona updates itself automatically.

**Source:** the tag below is the exact source of this build.
`Resona-v1.3.0-mockup.zip` (full source) and `resona-mockup-v1.3.0.patch`
(diff from v1.2.1) are attached for convenience.

Resona is **free forever**, MIT-licensed, no account required. It is not
affiliated with YouTube, Google or Spotify.
MD
)

python3 - "$BODY" <<'PY' > /tmp/release-patch.json
import json, sys
print(json.dumps({"name": "Resona v1.3.0", "body": sys.argv[1]}))
PY

curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  --data @/tmp/release-patch.json "$API/releases/$RID" \
  | python3 -c "import json,sys; r=json.load(sys.stdin); print('updated:', r['name'], '| tag:', r['tag_name'], '| body chars:', len(r['body']))"
