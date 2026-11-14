#!/usr/bin/env bash
echo "=== Piped /streams sweep (with -L) ==="
HOSTS="pipedapi.adminforge.de pipedapi.ducks.party pipedapi.nosebs.ru api.piped.yt pipedapi.orangenet.cc pipedapi.drgns.space pipedapi.owo.si piped-api.lunar.icu pipedapi.phoenixthrush.com pipedapi.nadeko.net pipedapi.ducks.party api.piped.private.coffee pipedapi.darkness.services pipedapi.leptons.xyz pipedapi.reallyaweso.me pipedapi.marcosbg.dev pipedapi.smnz.de pipedapi.owo.si"
for host in $HOSTS; do
  ( code=$(curl -s -m 10 -L -o /tmp/pss.json -w "%{http_code}" "https://$host/streams/JGwWNGJdvx8" -H 'User-Agent: Mozilla/5.0')
    n=$(python3 -c "
import json
try:
    d=json.load(open('/tmp/pss.json'))
    ok=[a for a in (d.get('audioStreams') or []) if a.get('url')]
    print(len(ok))
except: print(0)
" 2>/dev/null)
    echo "$host -> $code audio_urls=$n" ) &
done
wait
echo
echo "=== Cobalt community instances ==="
curl -s -m 10 'https://instances.cobalt.best/api/instances.json' -H 'User-Agent: Mozilla/5.0' -o /tmp/cobalt.json -w "list HTTP %{http_code}\n"
python3 -c "
import json
try:
    d=json.load(open('/tmp/cobalt.json'))
    live=[i for i in d if i.get('api_online')]
    print('online instances:', len(live))
    for i in live[:10]:
        print(' ', i.get('api'), 'services_youtube:', (i.get('services') or {}).get('youtube'))
except Exception as e: print('err', e)
" 2>/dev/null
echo
echo "=== Invidious sweep 2 ==="
for host in invidious.privacyredirect.com invidious.jing.rocks iv.ggtyler.dev invidious.materialio.us iv.datura.network inv.vern.cc invidious Projekt Blue iv.catgirl.cloud; do
  code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "https://$host/api/v1/videos/JGwWNGJdvx8" -H 'User-Agent: Mozilla/5.0' 2>/dev/null)
  echo "$host -> $code"
done
