#!/usr/bin/env bash
# Full test of the EXACT server bundle shipped inside Resona-Setup-1.0.0.exe:
# API endpoints (curl) + real UI pass (headless browser), booted exactly
# like desktop/main.js boots it (same env, same port).
set -u
SRV=/home/z/my-project/desktop/staging/server
PORT=34567
LOG=/tmp/resona-desktop-server.log

cd "$SRV"
rm -f "$LOG"
PORT=$PORT HOSTNAME=127.0.0.1 NODE_ENV=production node server.js > "$LOG" 2>&1 &
SRV_PID=$!

ok=0
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "SERVER_FAILED_TO_START"; tail -20 "$LOG"; kill $SRV_PID 2>/dev/null; exit 1
fi
echo "== server up in ${i}s =="

summ() { # summ <name> <url> <node-expr using j>
  local name="$1" url="$2" expr="$3"
  local code
  code=$(curl -s -o /tmp/t.json -w '%{http_code}' --max-time 30 "$url")
  if [ "$code" = "200" ]; then
    echo "[PASS $code] $name"
    node -e "const j=require('/tmp/t.json'); console.log('   -> ' + ($expr))" 2>/dev/null || echo "   -> (shape above)"
  else
    echo "[FAIL $code] $name :: $(head -c 100 /tmp/t.json)"
  fi
}

summ "search"  "http://127.0.0.1:$PORT/api/search?q=blinding+lights" \
  "j.tracks.length + ' tracks; #1: ' + j.tracks[0].title + ' — ' + j.tracks[0].artist + ' | dur=' + j.tracks[0].duration + 's'"

IDS=$(node -e "const j=require('/tmp/t.json'); console.log(j.tracks.slice(0,4).map(x=>x.videoId).join(','))" 2>/dev/null)
summ "durations" "http://127.0.0.1:$PORT/api/durations?ids=$IDS" "JSON.stringify(j)"

summ "trending" "http://127.0.0.1:$PORT/api/trending" \
  "Object.keys(j).join(',') + ' | ' + (j.items||j.tracks||[]).length + ' items; top: ' + (j.items||j.tracks||[])[0].title"

summ "lyrics" "http://127.0.0.1:$PORT/api/lyrics?title=Blinding%20Lights&artist=The%20Weeknd&duration=200" \
  "(j.synced||[]).length + ' synced lines; first: \"' + ((j.synced||[])[0]||{}).text + '\"'"

# radio playlist browse (used for album/radio pages)
summ "playlist(radio)" "http://127.0.0.1:$PORT/api/playlist?id=RDAMVM4NRXx6U8ABQ" \
  "(j.tracks? j.tracks.length + ' tracks; #1: ' + (j.tracks[0]||{}).title : JSON.stringify(j).slice(0,120))"

# stream resolution — expected 502 inside this sandbox (YouTube blocks datacenter IPs;
# on Windows the bundled yt-dlp.exe is used and that path is exercised by the user's PC)
summ "stream(sandbox=expected fail)" "http://127.0.0.1:$PORT/api/stream?videoId=4NRXx6U8ABQ" "j.error || j.url"

echo "== UI pass (headless browser on the production bundle) =="
agent-browser open "http://127.0.0.1:$PORT/" 2>/dev/null && echo "opened"
sleep 3
agent-browser snapshot -i 2>/dev/null | head -25
agent-browser screenshot /tmp/ui-home.png 2>/dev/null && echo "home screenshot saved"
kill $SRV_PID 2>/dev/null
agent-browser close 2>/dev/null
echo "== done =="
