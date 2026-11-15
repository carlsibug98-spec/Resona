#!/usr/bin/env bash
# Build the v1.4.0 publish tree on top of the released v1.3.0 commit.
# Stage 1 (this script): construct /tmp/publish = v1.3.0 tag + working-tree
# app files, committed as one release commit. No network access.
set -euo pipefail

SRC=/home/z/my-project
W=/tmp/publish
BASE=v1.3.0   # released tag (9a132d9)

cd "$SRC"

echo "== 1. fresh worktree at $BASE =="
git worktree remove --force "$W" 2>/dev/null || true
rm -rf "$W"
git worktree add --detach "$W" "$BASE"
cd "$W"

echo "== 2. overlay app paths from working tree =="
rsync -a --delete "$SRC/src/"      "$W/src/"
rsync -a --delete "$SRC/website/"  "$W/website/"
rsync -a --delete "$SRC/public/"   "$W/public/"
rsync -a --delete "$SRC/assets/"   "$W/assets/"
rsync -a --delete "$SRC/prisma/"   "$W/prisma/"
rsync -a --delete --exclude node_modules --exclude dist --exclude staging "$SRC/desktop/" "$W/desktop/"
rsync -a --delete "$SRC/scripts/"  "$W/scripts/"
# tests: only the *.test.ts files (shell scripts are sandbox-harness tests)
rsync -a --delete --exclude '*.sh' "$SRC/tests/" "$W/tests/"

# Root files
for f in README.md CHANGES.md LICENSE SIGNING.md package.json package-lock.json \
         bun.lock components.json next.config.ts postcss.config.mjs \
         tailwind.config.ts tsconfig.json eslint.config.mjs; do
  cp "$SRC/$f" "$W/$f"
done

# workflows: both the tests workflow and the new 3-OS desktop matrix
cp "$SRC/.github/workflows/test.yml"     "$W/.github/workflows/test.yml"
cp "$SRC/.github/workflows/desktop.yml"  "$W/.github/workflows/desktop.yml"
cp "$SRC/.gitignore" "$W/.gitignore"

echo "== 3. sanity: junk scan (must be CLEAN) =="
git add -A
git ls-files | grep -E '^(upload/|download/|tool-results/|examples/|db/|skills/)|token|\.env$|node_modules|dev\.log|tsbuildinfo|dev\.pid' || echo "CLEAN"

echo "== 4. staged summary =="
git -c user.name="Resona" -c user.email="resona@users.noreply.github.com" \
  commit -qm "v1.4.0 — real music videos, MusicBrainz credits, song radio, macOS & Linux builds

- full-screen now playing: video button plays the real YouTube video docked
  into the mockup panel; hand-off between audio and video at the same position
- credits card filled from MusicBrainz (writers/producers/performers, album,
  year) with throttling, layered caching and an honest fallback
- Start radio (track menu) + autoplay radio when the queue ends
- macOS dmg (arm64 + x64) and Linux AppImage/deb built by CI; per-platform
  yt-dlp bundled; optional CSC_LINK signing secrets documented in SIGNING.md
- settings migration: showVideo on by default, autoplayRadio added"
echo "--- $(git log --oneline -1)"
echo "--- file count: $(git ls-files | wc -l) (v1.3.0 was 170)"

echo "== 5. quick verify: version + key files =="
grep -m1 '"version"' package.json desktop/package.json
ls SIGNING.md .github/workflows/desktop.yml >/dev/null && echo "new files present"
grep -q "radioFor" src/lib/server/innertube.ts && echo "radio code present"
grep -q "1.4.0" src/lib/version.ts && echo "version.ts at 1.4.0"
echo "== done =="
