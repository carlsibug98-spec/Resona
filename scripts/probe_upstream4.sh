#!/usr/bin/env bash
echo "=== A. InnerTube 400 error body ==="
head -c 274 /tmp/p_android.json; echo; echo

echo "=== B. InnerTube with NEWER client versions ==="
curl -s -m 15 -X POST 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' \
  --data '{"context":{"client":{"clientName":"IOS","clientVersion":"20.10.4","deviceMake":"Apple","deviceModel":"iPhone16,2","osName":"iPhone","osVersion":"18.3.2.22D82","hl":"en","gl":"US","timeZone":"UTC","utcOffsetMinutes":0}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/p_ios2.json -w "ios-new: HTTP %{http_code}, %{size_download}b | "
python3 -c "
import json
d=json.load(open('/tmp/p_ios2.json'))
ps=d.get('playabilityStatus',{})
print('status=',ps.get('status'),'| reason=',str(ps.get('reason'))[:60])
fmts=[f for f in (d.get('streamingData',{}).get('adaptiveFormats') or []) if f.get('mimeType','').startswith('audio')]
print('audio=',len(fmts),'urls=',sum(1 for f in fmts if f.get('url')))
"
echo

echo "=== C. Invidious instances /api/v1/videos ==="
for host in inv.nadeko.net invidious.nerdvpn.de yewtu.be iv.melmac.space invidious.f5.si; do
  code=$(curl -s -m 12 -o /tmp/inv.json -w "%{http_code}" "https://$host/api/v1/videos/JGwWNGJdvx8?fields=adaptiveFormats,title,lengthSeconds" -H 'User-Agent: Mozilla/5.0')
  info=$(python3 -c "
import json
try:
    d=json.load(open('/tmp/inv.json'))
    fmts=[f for f in (d.get('adaptiveFormats') or []) if str(f.get('type','')).startswith('audio')]
    print(f'audio={len(fmts)} with_url={sum(1 for f in fmts if f.get(\"url\"))}')
except Exception as e: print('err')
" 2>/dev/null)
  echo "$host -> $code | $info"
done

echo
echo "=== D. Piped instances /streams ==="
for host in api.piped.private.coffee pipedapi.ducks.party pipedapi.reallyaweso.me pipedapi.leptons.xyz; do
  code=$(curl -s -m 15 -o /tmp/ps.json -w "%{http_code}" "https://$host/streams/JGwWNGJdvx8" -H 'User-Agent: Mozilla/5.0')
  info=$(python3 -c "
import json
try:
    d=json.load(open('/tmp/ps.json'))
    aud=d.get('audioStreams') or []
    ok=[a for a in aud if a.get('url')]
    print(f'audio={len(aud)} with_url={len(ok)}')
    if ok: open('/tmp/piped_url.txt','w').write(ok[0]['url'])
except Exception as e: print('err')
" 2>/dev/null)
  echo "$host -> $code | $info"
done
if [ -s /tmp/piped_url.txt ]; then
  echo "test piped stream url:"
  curl -s -m 20 -o /dev/null -L -r 0-100000 "$(cat /tmp/piped_url.txt)" -w "  HTTP %{http_code}, %{size_download}b, %{content_type}\n"
fi

echo
echo "=== E. InnerTube videos batch endpoint (metadata hydration) ==="
curl -s -m 15 -X POST 'https://www.youtube.com/youtubei/v1/videos?prettyPrint=false' \
  -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)' \
  --data '{"context":{"client":{"clientName":"WEB","clientVersion":"2.20240401.00.00","hl":"en","gl":"US"}},"videoIds":["JGwWNGJdvx8","7wtfhZwyrcc"]}' \
  -o /tmp/yt_videos.json -w "HTTP %{http_code}, %{size_download}b\n"
python3 -c "
import json
d=json.load(open('/tmp/yt_videos.json'))
vs=d.get('contents',[])
print('returned videos:', len(vs))
for v in vs[:2]:
    t=v.get('title',{}).get('runs',[{}])[0].get('name')
    dur=v.get('lengthText',{}).get('simpleText')
    th=(v.get('thumbnail',{}).get('thumbnails') or [{}])[-1].get('url','')[:60]
    print(' ', t, '|', dur, '|', th)
"

echo
echo "=== F. YouTube oEmbed (no-key metadata) ==="
curl -s -m 10 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=JGwWNGJdvx8&format=json' -H 'User-Agent: Mozilla/5.0' -o /tmp/oe.json -w "HTTP %{http_code}\n"
head -c 300 /tmp/oe.json; echo
