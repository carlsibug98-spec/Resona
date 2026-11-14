#!/usr/bin/env bash
# Probe upstream music sources to see what works from this sandbox
echo "=== 1. YouTube InnerTube SEARCH (WEB_REMIX) ==="
curl -s -m 15 -X POST 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)' \
  -H 'X-YouTube-Client-Name: 67' -H 'X-YouTube-Client-Version: 1.20240401.01.00' \
  --data '{"context":{"client":{"clientName":"WEB_REMIX","clientVersion":"1.20240401.01.00","hl":"en","gl":"US"}},"query":"shape of you ed sheeran","filter":"songs"}' \
  -o /tmp/yt_search.json -w "HTTP %{http_code}, %{size_download} bytes\n"
head -c 400 /tmp/yt_search.json; echo; echo

echo "=== 2. YouTube InnerTube PLAYER (IOS client) ==="
curl -s -m 15 -X POST 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.ios.youtube/19.04.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)' \
  -H 'X-Goog-Api-Format-Version: 2' \
  --data '{"context":{"client":{"clientName":"IOS","clientVersion":"19.04.2","deviceMake":"Apple","deviceModel":"iPhone14,3","osName":"iPhone","osVersion":"15.6.0.21G90","hl":"en","timeZone":"UTC","utcOffsetMinutes":0}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/yt_player.json -w "HTTP %{http_code}, %{size_download} bytes\n"
python3 - <<'EOF'
import json
try:
    d = json.load(open('/tmp/yt_player.json'))
    print("status:", d.get('playabilityStatus', {}).get('status'))
    fmts = d.get('streamingData', {}).get('adaptiveFormats', [])
    audio = [f for f in fmts if f.get('mimeType','').startswith('audio')]
    print("audio formats:", [(f.get('itag'), f.get('bitrate')) for f in audio][:6])
    if audio:
        url = audio[0].get('url','')
        print("has url:", bool(url), "| cipher fields:", [k for k in audio[0].keys() if 'ignature' in k or 'ipher' in k])
        open('/tmp/yt_stream_url.txt','w').write(url)
except Exception as e:
    print("parse error:", e)
EOF
echo

echo "=== 3. Test resolved stream URL ==="
if [ -s /tmp/yt_stream_url.txt ]; then
  curl -s -m 20 -o /dev/null -L -r 0-100000 "$(cat /tmp/yt_stream_url.txt)" -w "HTTP %{http_code}, downloaded %{size_download} bytes, type %{content_type}\n"
else
  echo "no stream url resolved"
fi
echo

echo "=== 4. LRCLIB lyrics ==="
curl -s -m 15 'https://lrclib.net/api/search?track_name=Shape%20of%20You&artist_name=Ed%20Sheeran' -H 'User-Agent: Resona/1.0 (https://github.com/resona)' -o /tmp/lrc.json -w "HTTP %{http_code}, %{size_download} bytes\n"
python3 -c "
import json
d = json.load(open('/tmp/lrc.json'))
print('results:', len(d) if isinstance(d, list) else d)
if isinstance(d, list) and d:
    print('first:', d[0].get('track'), '| synced:', bool(d[0].get('syncedLyrics')), '| plain len:', len(d[0].get('plainLyrics') or ''))
"
echo

echo "=== 5. kworb YouTube charts (trending source) ==="
curl -s -m 15 'https://kworb.net/youtube/' -H 'User-Agent: Mozilla/5.0' -o /tmp/kworb.html -w "HTTP %{http_code}, %{size_download} bytes\n"
grep -o 'watch?v=[A-Za-z0-9_-]\{11\}' /tmp/kworb.html | head -3
echo "video-id matches: $(grep -c -o 'watch?v=[A-Za-z0-9_-]\{11\}' /tmp/kworb.html)"
echo

echo "=== 6. Spotify embed page (playlist import) ==="
curl -s -m 15 -L 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M' -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' -o /tmp/sp.html -w "HTTP %{http_code}, %{size_download} bytes\n"
grep -o '__NEXT_DATA__' /tmp/sp.html | head -1
echo "name fields: $(grep -c -o '\"name\"' /tmp/sp.html)"
