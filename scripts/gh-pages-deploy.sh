#!/usr/bin/env bash
# Deploy website/ to gh-pages branch, push website source to main, try enabling Pages.
set -euo pipefail
TOKEN=$(cat /tmp/.ghtoken)
PUSHURL="https://x-access-token:${TOKEN}@github.com/carlsibug98-spec/Resona.git"

echo "== 1. build gh-pages in temp clone =="
cd /tmp
rm -rf resona-pages
git clone --quiet --no-checkout /home/z/my-project resona-pages
cd resona-pages
git checkout --orphan gh-pages
git rm -rf . >/dev/null 2>&1 || true
cp /home/z/my-project/website/index.html .
cp -r /home/z/my-project/website/screenshots .
touch .nojekyll
git add -A
git -c user.name="carlsibug98-spec" -c user.email="carlsibug98-spec@users.noreply.github.com" \
  commit --quiet -m "Deploy Resona download site to GitHub Pages"
echo "gh-pages commit: $(git rev-parse --short HEAD) ($(git ls-files | wc -l) files)"

echo "== 2. push gh-pages (force: the branch is rebuilt as an orphan each deploy) =="
git push --force "$PUSHURL" gh-pages:gh-pages 2>&1 | grep -v '^remote:' || true

echo "== 3. commit website source on main =="
cd /home/z/my-project
git add website/
git -c user.name="carlsibug98-spec" -c user.email="carlsibug98-spec@users.noreply.github.com" \
  commit --quiet -m "Add download website source (GitHub Pages site)" || echo "nothing to commit on main"
git push "$PUSHURL" HEAD:main 2>&1 | grep -v '^remote:' || true

echo "== 4. try enabling Pages via API =="
ENABLE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/carlsibug98-spec/Resona/pages \
  -d '{"source":{"branch":"gh-pages","path":"/"}}')
echo "$ENABLE" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if 'html_url' in d:
    print('PAGES OK:', d['html_url'], '| status:', d.get('status'))
else:
    print('PAGES API:', d.get('message', '?'), '- enable manually in repo Settings > Pages if needed')
"

echo "== 5. remote state =="
git ls-remote "$PUSHURL" main gh-pages | sed 's/x-access-token:[^@]*@/**@/'
