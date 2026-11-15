#!/usr/bin/env bash
# Build the v1.3.0 mockup-release publish tree on top of the remote v1.3.0 branch head.
# Stage 1: construct /tmp/publish from b2023dd + working-tree app files. No network access.
set -euo pipefail

SRC=/home/z/my-project
W=/tmp/publish
BASE=b2023dd   # remote refs/remotes/rt/v130 head ("v1.3.0 downloads + self-update")

cd "$SRC"

echo "== 1. fresh worktree at $BASE =="
git worktree remove --force "$W" 2>/dev/null || true
rm -rf "$W"
git worktree add --detach "$W" "$BASE"
cd "$W"

echo "== 2. overlay app paths from working tree =="
# Whole-directory overlays (delete files the session removed)
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
for f in README.md CHANGES.md LICENSE package.json bun.lock components.json \
         next.config.ts postcss.config.mjs tailwind.config.ts tsconfig.json \
         eslint.config.mjs; do
  cp "$SRC/$f" "$W/$f"
done

# .github: keep remote desktop.yml (it uploads latest.yml + blockmap); add test.yml
cp "$SRC/.github/workflows/test.yml" "$W/.github/workflows/test.yml"
cp "$SRC/.gitignore" "$W/.gitignore"

echo "== 3. targeted fixes =="
# a) desktop.yml: repair corrupted branch filter (was: ain] )
sed -i 's/^    branches: ain\]$/    branches: [main]/' "$W/.github/workflows/desktop.yml"
grep -n "branches:" "$W/.github/workflows/desktop.yml"

# b) test.yml: install deps before running tests
sed -i 's|^      - run: npm test$|      - run: npm install\n      - run: npm test|' "$W/.github/workflows/test.yml"
cat "$W/.github/workflows/test.yml"

# c) drop tracked sandbox junk
git rm -q --cached .zscripts/dev.pid 2>/dev/null || true
rm -f "$W/.zscripts/dev.pid"

# d) gitignore hygiene
cat >> "$W/.gitignore" <<'EOF'

# sandbox-only artifacts
/examples/
/tool-results/
.zscripts/dev.pid
EOF

echo "== 4. normalize file modes (branch convention: all files 644, dirs 755) =="
find "$W" -type d -not -path '*/.git*' -exec chmod 755 {} +
find "$W" -type f -not -path '*/.git/*' -exec chmod 644 {} +

echo "== 5. stage =="
git add -A
echo "--- staged summary ---"
git diff --cached --stat | tail -6
echo "--- file count: $(git ls-files | wc -l) (base was 164) ---"

echo "== 6. junk scan (must be empty) =="
git ls-files | grep -E '^(upload/|download/|tool-results/|examples/|db/|skills/)|token|\.env$|node_modules|dev\.log|tsbuildinfo|dev\.pid' || echo "CLEAN"
