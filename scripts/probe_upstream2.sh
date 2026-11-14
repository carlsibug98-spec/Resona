#!/usr/bin/env bash
echo "=== A. InnerTube PLAYER variants ==="
try_player() {
  local name="$1"; local url="$2"; local ua="$3"; local extra="$4"; local body="$5"
  code=$(curl -s -m 15 -X POST "$url" -H 'Content-Type: application/json' -H "User-Agent: $ua" $extra \
    --data "$body" -o /tmp/p_$name.json -w "%{http_code}")
  info=$(python3 - "$name" <<'EOF'
import json,sys
name=sys.argv[1]
try:
    d=json.load(open(f'/tmp/p_{name}.json'))
    ps=d.get('playabilityStatus',{}).get('status')
    fmts=d.get('streamingData',{}).get('adaptiveFormats',[]) or []
    audio=[f for f in fmts if f.get('mimeType','').startswith('audio')]
    hasurl=sum(1 for f in audio if f.get('url'))
    cipher=sum(1 for f in audio if 'signatureCipher' in f)
    print(f"status={ps} audio_fmts={len(audio)} with_url={hasurl} ciphered={cipher}")
    if audio and audio[0].get('url'):
        open(f'/tmp/url_{name}.txt','w').write(audio[0]['url'])
except Exception as e:
    print("err:", e)
EOF
)
  echo "$name -> HTTP $code | $info"
}

KEY_ANDROID="AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"
KEY_IOS="AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc"
KEY_MUSIC="AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30"

try_player android "$KEY_ANDROID" "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip" "-H 'X-YouTube-Client-Name: 3' -H 'X-YouTube-Client-Version: 19.09.37'" '{"context":{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"osName":"Android","osVersion":"11","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}'

try_player ios "$KEY_IOS" "com.google.ios.youtube/19.04.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X) gzip" "-H 'X-YouTube-Client-Name: 5' -H 'X-YouTube-Client-Version: 19.04.2'" '{"context":{"client":{"clientName":"IOS","clientVersion":"19.04.2","deviceMake":"Apple","deviceModel":"iPhone14,3","osName":"iPhone","osVersion":"15.6.0.21G90","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}'

try_player andmusic "$KEY_MUSIC" "com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 11) gzip" "-H 'X-YouTube-Client-Name: 21' -H 'X-YouTube-Client-Version: 6.42.52'" '{"context":{"client":{"clientName":"ANDROID_MUSIC","clientVersion":"6.42.52","androidSdkVersion":30,"osName":"Android","osVersion":"11","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}'

try_player web 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8' 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' "-H 'X-YouTube-Client-Name: 1' -H 'X-YouTube-Client-Version: 2.20240401.00.00'" '{"context":{"client":{"clientName":"WEB","clientVersion":"2.20240401.00.00","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}'

try_player tvembed 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8' 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15' "" '{"context":{"client":{"clientName":"TVHTML5_SIMPLY_EMBEDDED_PLAYER","clientVersion":"2.0","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","thirdParty":{"embedUrl":"https://www.youtube.com"},"contentCheckOk":true,"racyCheckOk":true}'

echo
echo "=== B. Test any successful stream URLs ==="
for f in /tmp/url_*.txt; do
  [ -s "$f" ] || continue
  echo "URL from: $f"
  curl -s -m 20 -o /dev/null -L -r 0-100000 "$(cat $f)" -w "  HTTP %{http_code}, %{size_download} bytes, %{content_type}\n"
done

echo
echo "=== C. Piped fallback instances ==="
for host in pipedapi.kavin.rocks pipedapi.adminforge.de api.piped.private.coffee pipedapi.ducks.party; do
  code=$(curl -s -m 10 -o /tmp/piped.json -w "%{http_code}" "https://$host/search?q=shape+of+you&filter=music_songs")
  echo "$host -> $code ($(head -c 80 /tmp/piped.json 2>/dev/null | tr -d '\n'))"
done

echo
echo "=== D. kworb chart pages structure ==="
grep -o 'href="[^"]*\.html"' /tmp/kworb.html | sort -u | head -12
code=$(curl -s -m 15 -o /tmp/kworb_daily.html -w "%{http_code}" 'https://kworb.net/youtube/c/US/daily.html' -H 'User-Agent: Mozilla/5.0')
echo "US daily page -> $code, $(wc -c < /tmp/kworb_daily.html) bytes"
grep -c -o 'watch?v=[A-Za-z0-9_-]\{11\}' /tmp/kworb_daily.html

echo
echo "=== E. Spotify embed token + playlist API ==="
curl -s -m 15 'https://open.spotify.com/get_access_token?reason=transport&productType=embed' -H 'User-Agent: Mozilla/5.0' -o /tmp/sptok.json -w "token HTTP %{http_code}\n"
head -c 200 /tmp/sptok.json; echo
