#!/bin/bash
# update-build-json.sh — run before every commit to stamp build.json
# Usage: bash update-build-json.sh
# Or install as git pre-commit hook:
#   cp update-build-json.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > build.json << EOF
{
  "sha": "${SHA}",
  "builtAt": "${BUILT_AT}"
}
EOF

# Also patch PBS_BUILD_SHA in player.html
if [ -f player.html ]; then
  # Update the window.PBS_BUILD_SHA line
  sed -i '' "s/window\.PBS_BUILD_SHA = '[a-z0-9]*'/window.PBS_BUILD_SHA = '${SHA}'/" player.html
  # Update the PBS_BUILD_DATE line
  sed -i '' "s/window\.PBS_BUILD_DATE = '[^']*'/window.PBS_BUILD_DATE = '${BUILT_AT}'/" player.html
  # Update footer badge
  sed -i '' "s/main · [a-z0-9]* · [0-9T: ZPD-]*/main · ${SHA} · $(date '+%b %d %I:%M%p')/" player.html
fi

echo "[update-build-json] sha=${SHA} builtAt=${BUILT_AT}"
git add build.json player.html 2>/dev/null || true
