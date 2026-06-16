#!/usr/bin/env bash
# ============================================================
# Re-attribute every commit to the GitHub ACCOUNT (zaydenholloway)
# instead of the local machine identity (your gmail → nkkbrrpochta),
# then force-push. After this, GitHub shows zaydenholloway as the
# sole contributor.
#
# Run yourself (your token / your hands):
#   GH_TOKEN="ghp_xxx" bash scripts/fix-author.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${GH_TOKEN:?set GH_TOKEN with 'repo' scope}"
GH_USER="${GH_USER:-zaydenholloway}"
REPO="${REPO:-yore-coprocessor}"

# GitHub links commits to an account by the author email. Use the account's
# noreply address: <id>+<user>@users.noreply.github.com
ID=$(curl -s "https://api.github.com/users/${GH_USER}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
EMAIL="${ID}+${GH_USER}@users.noreply.github.com"
NAME="${GIT_NAME:-Zayden Holloway}"
echo "re-authoring all commits → ${NAME} <${EMAIL}>"

# filter-branch refuses on a dirty tree — commit any pending work first
if [ -n "$(git status --porcelain)" ]; then
  echo "committing pending changes first..."
  git add -A
  git commit -m "feat(web): socials, pixel-trail background, deploy/verify scripts" || true
fi

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter "
export GIT_AUTHOR_NAME='${NAME}'
export GIT_AUTHOR_EMAIL='${EMAIL}'
export GIT_COMMITTER_NAME='${NAME}'
export GIT_COMMITTER_EMAIL='${EMAIL}'
" -- --all

# also set the local identity so FUTURE commits stay correct
git config user.name "${NAME}"
git config user.email "${EMAIL}"

git remote set-url origin "https://${GH_TOKEN}@github.com/${GH_USER}/${REPO}.git"
git push --force --all origin
git remote set-url origin "https://github.com/${GH_USER}/${REPO}.git"
echo "✓ done — contributor on GitHub is now ${GH_USER}"
echo "  (note: re-authoring with no-reply hides the gmail; commits keep the same content)"
