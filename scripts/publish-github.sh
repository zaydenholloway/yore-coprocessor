#!/usr/bin/env bash
# ============================================================
# Publish Yore to a PUBLIC GitHub repo (honest history — real
# commits, today's dates; NO backdating / NO fake timeline).
# Needed so the program can be verified (solana-verify).
#
# Run it yourself (your account / your token / your hands):
#   GH_TOKEN="ghp_xxx" GH_USER="zaydenholloway" bash scripts/publish-github.sh
#
# Safe: refuses to run if the mainnet deploy key would be tracked.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${GH_TOKEN:?set GH_TOKEN to a token with 'repo' scope}"
GH_USER="${GH_USER:-zaydenholloway}"
REPO="${REPO:-yore-coprocessor}"

git init -q
git config user.name "${GIT_NAME:-Zayden Holloway}"
git config user.email "${GIT_EMAIL:-nkkbrrpochta@gmail.com}"
git symbolic-ref HEAD refs/heads/main 2>/dev/null || true

# ---- SAFETY: the funded mainnet deployer key must never be committed ----
if git check-ignore -q .deploy/deployer.json; then
  echo "✓ deployer key is git-ignored"
else
  echo "✗ ABORT: .deploy/deployer.json is NOT ignored — refusing to publish"; exit 1
fi

# ---- real, logical commits (today's dates — no fabrication) ----
git add .gitignore Anchor.toml Cargo.toml Cargo.lock package.json package-lock.json tsconfig.json .prettierignore app migrations 2>/dev/null || true
git commit -q -m "chore: scaffold Anchor workspace + toolchain (Anchor 0.31.1)"
git add programs && git commit -q -m "feat(program): request lifecycle, prover staking, Token-2022 escrow, on-chain keccak Merkle verifier, full rent reclamation"
git add tests && git commit -q -m "test: end-to-end integration — Token-2022 mint, real Merkle proof, rent reclamation (9 passing)"
git add scripts && git commit -q -m "feat(scripts): mainnet deploy, initialize, key import, single-variable token mint"
git add web && git commit -q -m "feat(web): Yore Coprocessor site + demo console + single token variable (config.js)"
git add id.md docs && git commit -q -m "docs: concept (whitepaper) + design research"
git add README.md && git commit -q -m "docs: project README + architecture overview"
git add -A && git commit -q -m "chore: remaining project files" 2>/dev/null || true

git branch develop 2>/dev/null || true
git branch web-frontend 2>/dev/null || true

echo "── commits ──"; git log --oneline
echo "── leak check (must be 'none') ──"; git ls-files | grep -iE "deployer|\.deploy/|keypair|\.pem$" || echo "none ✓"

# ---- create the public repo (idempotent-ish) ----
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d '{"name":"'"$REPO"'","description":"Verifiable historical-state coprocessor for Solana — read the past, prove it on-chain.","homepage":"https://yorecoprocessor.com","private":false,"has_issues":true}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('repo:',d.get('full_name') or d.get('message'))" || true

# ---- push, then scrub the token out of the remote ----
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GH_TOKEN}@github.com/${GH_USER}/${REPO}.git"
git push -u origin main develop web-frontend
git remote set-url origin "https://github.com/${GH_USER}/${REPO}.git"

echo "✓ published: https://github.com/${GH_USER}/${REPO}"
