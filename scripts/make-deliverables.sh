#!/usr/bin/env bash
# Generate v1.3.0 deliverables from the pushed commit in /tmp/publish:
#   download/Resona-v1.3.0-mockup.zip        (source zip, Resona-main/ prefix)
#   download/resona-mockup-v1.3.0.patch      (v1.2.1 baseline -> v1.3.0, git-apply verified)
#   download/CHANGES-v1.3.0.md               (changelog copy)
set -euo pipefail

SRC=/home/z/my-project
DL=$SRC/download
PUB=/tmp/publish
BASEZIP="$SRC/upload/files (1).zip"

mkdir -p "$DL"

echo "== 1. source zip from pushed commit =="
cd "$PUB"
git archive --format=zip --prefix=Resona-main/ -o "$DL/Resona-v1.3.0-mockup.zip" HEAD
echo "   $(du -h "$DL/Resona-v1.3.0-mockup.zip" | cut -f1)  ($(git rev-parse --short HEAD))"

echo "== 2. changelog =="
cp CHANGES.md "$DL/CHANGES-v1.3.0.md"

echo "== 3. patch: v1.2.1 baseline -> v1.3.0 =="
rm -rf /tmp/patchgen && mkdir -p /tmp/patchgen && cd /tmp/patchgen
git init -q .
unzip -q "$BASEZIP" -d bx
unzip -q bx/Resona-main-redesign.zip          # -> ./Resona-main/
git add -A
git -c user.name=base -c user.email=base@base commit -qm "v1.2.1 baseline"
rsync -a --delete --exclude .git "$PUB/" Resona-main/
git add -A
git diff --cached --binary > "$DL/resona-mockup-v1.3.0.patch"
echo "   $(du -h "$DL/resona-mockup-v1.3.0.patch" | cut -f1), $(grep -c '^diff --git' "$DL/resona-mockup-v1.3.0.patch") files"

echo "== 4. verify patch applies cleanly to fresh baseline =="
rm -rf /tmp/patchtest && mkdir -p /tmp/patchtest && cd /tmp/patchtest
git init -q .
unzip -q /tmp/patchgen/bx/Resona-main-redesign.zip
git add -A && git -c user.name=t -c user.email=t@t commit -qm base
git apply --check "$DL/resona-mockup-v1.3.0.patch" && echo "   git apply --check: OK"
git apply "$DL/resona-mockup-v1.3.0.patch" && echo "   git apply: OK"
diff -r --exclude=.git Resona-main "$PUB" >/dev/null && echo "   applied tree == published tree: OK"

echo "== done =="
ls -la "$DL"
