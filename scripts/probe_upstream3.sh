#!/usr/bin/env bash
echo "=== A. InnerTube PLAYER variants (fixed) ==="
KEY_ANDROID="AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"
KEY_IOS="AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc"

curl -s -m 15 -X POST "https://www.youtube.com/youtubei/v1/player?key=$KEY_ANDROID&prettyPrint=false" \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip' \
  -H 'X-YouTube-Client-Name: 3' -H 'X-YouTube-Client-Version: 19.09.37' \
  --data '{"context":{"client":{"clientName":"ANDROID","clientVersion":"19.09.37","androidSdkVersion":30,"osName":"Android","osVersion":"11","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/p_android.json -w "android: HTTP %{http_code}, %{size_download}b | "
python3 -c "
import json
d=json.load(open('/tmp/p_android.json'))
ps=d.get('playabilityStatus',{}).get('status')
fmts=[f for f in (d.get('streamingData',{}).get('adaptiveFormats') or []) if f.get('mimeType','').startswith('audio')]
print(f'status={ps} audio={len(fmts)} urls={sum(1 for f in fmts if f.get(\"url\"))} cipher={sum(1 for f in fmts if \"signatureCipher\" in f)}')
"

curl -s -m 15 -X POST "https://www.youtube.com/youtubei/v1/player?key=$KEY_IOS&prettyPrint=false" \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: com.google.ios.youtube/19.04.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X) gzip' \
  -H 'X-YouTube-Client-Name: 5' -H 'X-YouTube-Client-Version: 19.04.2' \
  --data '{"context":{"client":{"clientName":"IOS","clientVersion":"19.04.2","deviceMake":"Apple","deviceModel":"iPhone14,3","osName":"iPhone","osVersion":"15.6.0.21G90","hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/p_ios.json -w "ios: HTTP %{http_code}, %{size_download}b | "
python3 -c "
import json
d=json.load(open('/tmp/p_ios.json'))
ps=d.get('playabilityStatus',{}).get('status')
fmts=[f for f in (d.get('streamingData',{}).get('adaptiveFormats') or []) if f.get('mimeType','').startswith('audio')]
print(f'status={ps} audio={len(fmts)} urls={sum(1 for f in fmts if f.get(\"url\"))} cipher={sum(1 for f in fmts if \"signatureCipher\" in f)}')
"

echo
echo "=== B. Piped /streams fallback ==="
curl -s -m 20 'https://api.piped.private.coffee/streams/JGwWNGJdvx8' -H 'User-Agent: Mozilla/5.0' -o /tmp/piped_streams.json -w "HTTP %{http_code}, %{size_download}b\n"
python3 -c "
import json
d=json.load(open('/tmp/piped_streams.json'))
aud=d.get('audioStreams') or []
print('audioStreams:', len(aud))
for a in aud[:4]: print(' ', a.get('itag'), a.get('mimeType'), a.get('bitrate'), 'url:', bool(a.get('url')), a.get('url','')[:60])
"
echo
echo "=== C. kworb trending.html ==="
curl -s -m 15 'https://kworb.net/youtube/trending.html' -H 'User-Agent: Mozilla/5.0' -o /tmp/kw_trend.html -w "HTTP %{http_code}, %{size_download}b\n"
python3 - <<'EOF'
import re
html = open('/tmp/kw_trend.html', encoding='utf-8', errors='ignore').read()
ids = re.findall(r'watch\?v=([A-Za-z0-9_-]{11})', html)
print('video ids:', len(set(ids)))
rows = re.findall(r'<tr>(.*?)</tr>', html, re.S)[:3]
for r in rows[:3]:
    cells = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
    print(' row cells:', [re.sub('<[^>]+>','',c).strip()[:50] for c in cells])
EOF
echo
echo "=== D. Spotify embed __NEXT_DATA__ content ==="
python3 - <<'EOF'
import json, re
html = open('/tmp/sp.html', encoding='utf-8', errors='ignore').read()
m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
if not m:
    print('no NEXT_DATA'); raise SystemExit
d = json.loads(m.group(1))
def find_key(obj, key, path='root', depth=0):
    hits=[]
    if depth>14: return hits
    if isinstance(obj, dict):
        for k,v in obj.items():
            if k==key: hits.append((path+'.'+k, v))
            hits += find_key(v, key, path+'.'+k, depth+1)
    elif isinstance(obj, list):
        for i,v in enumerate(obj[:50]):
            hits += find_key(v, key, f'{path}[{i}]', depth+1)
    return hits
for key in ('trackList','entity','data'):
    hits = find_key(d, key)
    print(key, '->', len(hits), 'hits')
tl = find_key(d, 'trackList')
if tl:
    items = tl[0][1]
    print('trackList len:', len(items))
    print('sample:', json.dumps(items[0], ensure_ascii=False)[:300] if items else None)
EOF
