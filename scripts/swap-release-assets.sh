#!/usr/bin/env bash
# Swap the v1.3.0 release assets with the fresh CI build and attach source deliverables.
# Polls the installer run; if still building after the timeout, exits 2 (rerun later).
set -euo pipefail
TOKEN=$(tr -d '[:space:]' < "/home/z/my-project/upload/token for all.txt")
API="https://api.github.com/repos/carlsibug98-spec/Resona"
AUTH="Authorization: Bearer $TOKEN"
RID=445329468
RUN=43642926514
DL=/home/z/my-project/download
WORK=/tmp/release-assets

echo "== 1. poll installer run =="
for i in $(seq 1 32); do
  read -r STATUS CONCL < <(curl -s -H "$AUTH" "$API/actions/runs/$RUN" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['status'], r['conclusion'])")
  echo "   [$i] $STATUS / $CONCL"
  [ "$STATUS" = "completed" ] && break
  sleep 15
done
if [ "$STATUS" != "completed" ]; then echo "STILL BUILDING - rerun this script later"; exit 2; fi
if [ "$CONCL" != "success" ]; then echo "BUILD FAILED ($CONCL) - not swapping assets"; exit 1; fi

echo "== 2. download artifact =="
rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK"
AID=$(curl -s -H "$AUTH" "$API/actions/runs/$RUN/artifacts" | python3 -c "import json,sys; a=json.load(sys.stdin)['artifacts'][0]; print(a['id'])")
curl -s -L -H "$AUTH" -o artifact.zip "$API/actions/artifacts/$AID/zip"
unzip -q artifact.zip
echo "   artifact contents:"; ls -la
EXE=$(ls **/Resona-Setup-*.exe Resona-Setup-*.exe 2>/dev/null | head -1 || true)
[ -z "$EXE" ] && { echo "NO EXE IN ARTIFACT"; exit 1; }
echo "   exe: $EXE ($(du -h "$EXE" | cut -f1))"

echo "== 3. write fresh INSTALL-GUIDE.txt =="
cat > INSTALL-GUIDE.txt <<'MD'
RESONA v1.3.0 (mockup release) — INSTALL GUIDE (Windows 10/11, 64-bit)
======================================================================

1. DOWNLOAD
   Get Resona-Setup-1.3.0.exe from this release page (~150 MB).

2. IF SMARTSCREEN APPEARS ("Windows protected your PC")
   The installer is not code-signed yet (an authenticode certificate costs
   ~$100+/year — see the README for the plan). The build is produced by
   GitHub Actions from the tagged source below.
   Option A: click "More info" -> "Run anyway".
   Option B: right-click the .exe -> Properties -> check "Unblock" -> OK,
             then run normally.

3. INSTALL
   Follow the setup wizard. A desktop shortcut is created automatically.
   Your library, playlists and offline music carry over if you install
   over an existing copy.

4. ALREADY RUNNING THE v1.3.0 BUILD FROM NOV 14?
   This is a refreshed 1.3.0 with the new UI. The auto-updater does not
   offer same-version updates, so install this once over your current
   copy. Future releases update themselves automatically.

5. WHAT'S IN THIS BUILD
   - The approved UI mockup is now the app (every screen rebuilt)
   - Karaoke-style synced lyrics (LRCLIB), click a line to seek
   - Full-screen now playing: art / lyrics / video / credits
   - First-run starter library (OPM picks, clearable in Settings)
   - Download progress ring, confirm-before-remove
   - In-app update check against this repo's releases

6. TROUBLESHOOTING
   - Antivirus flags the installer: it is an unsigned NSIS installer;
     verify the SHA-256 in latest.yml matches your download, then allow it.
   - App does not start: check the log at %APPDATA%\resona\logs\main.log.
   - No audio in downloads: some servers cap quality; try another source.

Resona is free forever, MIT-licensed, not affiliated with YouTube,
Google or Spotify.
MD

echo "== 4. delete stale assets =="
for A in "Resona-Setup-1.3.0.exe" "Resona-Setup-1.3.0.exe.blockmap" "latest.yml" "INSTALL-GUIDE.txt"; do
  ASID=$(curl -s -H "$AUTH" "$API/releases/$RID/assets" | python3 -c "
import json,sys
for a in json.load(sys.stdin):
    if a['name'] == '$A': print(a['id']); break")
  if [ -n "${ASID:-}" ]; then
    curl -s -X DELETE -H "$AUTH" "$API/releases/assets/$ASID" && echo "   deleted $A"
  fi
done

echo "== 5. upload fresh assets =="
UP=$(curl -s -H "$AUTH" "$API/releases/$RID" | python3 -c "import json,sys; print(json.load(sys.stdin)['upload_url'].split('{')[0])")
upload() {  # file, name, ctype
  curl -s -X POST -H "$AUTH" -H "Content-Type: $3" --data-binary "@$1" "$UP?name=$2" \
    | python3 -c "import json,sys; a=json.load(sys.stdin); print('   uploaded:', a.get('name'), a.get('size'), 'bytes')"
}
upload "$EXE" "Resona-Setup-1.3.0.exe" "application/octet-stream"
[ -f "$(dirname "$EXE")/latest.yml" ] && upload "$(dirname "$EXE")/latest.yml" "latest.yml" "text/yaml"
[ -f "$(dirname "$EXE")/Resona-Setup-1.3.0.exe.blockmap" ] && upload "$(dirname "$EXE")/Resona-Setup-1.3.0.exe.blockmap" "Resona-Setup-1.3.0.exe.blockmap" "application/octet-stream"
upload INSTALL-GUIDE.txt "INSTALL-GUIDE.txt" "text/plain"
upload "$DL/Resona-v1.3.0-mockup.zip" "Resona-v1.3.0-mockup.zip" "application/zip"
upload "$DL/resona-mockup-v1.3.0.patch" "resona-mockup-v1.3.0.patch" "text/plain"
upload "$DL/CHANGES-v1.3.0.md" "CHANGES-v1.3.0.md" "text/markdown"

echo "== 6. final asset list =="
curl -s -H "$AUTH" "$API/releases/$RID/assets" | python3 -c "
import json,sys
for a in json.load(sys.stdin): print('  ', a['name'], '-', a['size'], 'bytes')"
echo "DONE"
