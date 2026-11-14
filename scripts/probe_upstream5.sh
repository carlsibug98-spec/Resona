#!/usr/bin/env bash
echo "=== A. TVHTML5_SIMPLY_EMBEDDED_PLAYER (proper test) ==="
curl -s -m 15 -X POST 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' \
  --data '{"context":{"client":{"clientName":"TVHTML5_SIMPLY_EMBEDDED_PLAYER","clientVersion":"2.0","hl":"en","gl":"US"},"thirdParty":{"embedUrl":"https://www.google.com"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/p_tv.json -w "HTTP %{http_code}, %{size_download}b | "
python3 -c "
import json
d=json.load(open('/tmp/p_tv.json'))
ps=d.get('playabilityStatus',{})
print('status=',ps.get('status'))
fmts=[f for f in (d.get('streamingData',{}).get('adaptiveFormats') or []) if f.get('mimeType','').startswith('audio')]
print('audio=',len(fmts),'urls=',sum(1 for f in fmts if f.get('url')),'cipher=',sum(1 for f in fmts if 'signatureCipher' in f))
"
echo

echo "=== B. ANDROID_VR client ==="
curl -s -m 15 -X POST 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent:com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip' \
  --data '{"context":{"client":{"clientName":"ANDROID_VR","clientVersion":"1.61.48","deviceMake":"Oculus","deviceModel":"Quest 3","osName":"Android","osVersion":"12","androidSdkVersion":32,"hl":"en","gl":"US"}},"videoId":"JGwWNGJdvx8","contentCheckOk":true,"racyCheckOk":true}' \
  -o /tmp/p_vr.json -w "HTTP %{http_code}, %{size_download}b | "
python3 -c "
import json
d=json.load(open('/tmp/p_vr.json'))
ps=d.get('playabilityStatus',{})
print('status=',ps.get('status'))
fmts=[f for f in (d.get('streamingData',{}).get('adaptiveFormats') or []) if f.get('mimeType','').startswith('audio')]
print('audio=',len(fmts),'urls=',sum(1 for f in fmts if f.get('url')))
"
echo

echo "=== C. Piped official instance list + streams sweep ==="
curl -s -m 15 'https://piped-instances.kavin.rocks/' -H 'User-Agent: Mozilla/5.0' -o /tmp/piped_list.json -w "list HTTP %{http_code}\n"
python3 -c "
import json
try:
    d=json.load(open('/tmp/piped_list.json'))
    hosts=[i['api_url'].replace('https://','') for i in d]
    print(len(hosts),'instances'); open('/tmp/piped_hosts.txt','w').write('\n'.join(hosts))
except Exception as e: print('err', e)
" 2>/dev/null
while read -r host; do
  [ -z "$host" ] && continue
  ( code=$(curl -s -m 12 -o /tmp/ps_$$.json -w "%{http_code}" "https://$host/streams/JGwWNGJdvx8" -H 'User-Agent: Mozilla/5.0')
    n=$(python3 -c "
import json
try:
    d=json.load(open('/tmp/ps_$$.json'))
    ok=[a for a in (d.get('audioStreams') or []) if a.get('url')]
    print(len(ok))
except: print(0)
" 2>/dev/null)
    echo "$host -> $code audio_urls=$n"
    if [ "$n" -gt 0 ] 2>/dev/null; then cp /tmp/ps_$$.json /tmp/piped_streams_ok.json; echo "FOUND_WORKING=$host" > /tmp/piped_ok.txt; fi ) &
done < /tmp/piped_hosts.txt
wait
if [ -f /tmp/piped_ok.txt ]; then
  cat /tmp/piped_ok.txt
  url=$(python3 -c "
import json
d=json.load(open('/tmp/piped_streams_ok.json'))
ok=[a for a in d['audioStreams'] if a.get('url')]
print(ok[0]['url'])")
  echo "testing first stream url..."
  curl -s -m 20 -o /dev/null -L -r 0-100000 "$url" -w "HTTP %{http_code}, %{size_download}b, %{content_type}\n"
fi
