#!/usr/bin/env bash
# ============================================================
# Yore — verified build on mainnet (OtterSec / solana-verify).
#
#   bash scripts/verify.sh
#
# Steps:
#   1) free the broken/oversized Docker data (~20GB)  [set FREE_DOCKER=0 to skip]
#   2) start Docker, wait for the daemon
#   3) reproducible build (pulls ONE image, ~5GB)
#   4) if the reproducible hash != on-chain, upgrade the program to it
#   5) submit verification (on-chain PDA + OtterSec remote build)
#
# Needs: .deploy/deployer.json (the upgrade authority) with a little SOL.
# Optional: RPC_URL=<paid rpc> for reliability.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PROGRAM_ID="3YnWj7ftTswFDKHSj9jxxzEJCQC2FB37zrDpzqfAB7px"
REPO_URL="https://github.com/zaydenholloway/yore-coprocessor"
RPC_URL="${RPC_URL:-https://api.mainnet-beta.solana.com}"
DEPLOYER="$PWD/.deploy/deployer.json"

# 1) free disk (only your own broken docker cache; Docker recreates it empty)
if [ "${FREE_DOCKER:-1}" = "1" ]; then
  echo "▶ freeing Docker data…"
  osascript -e 'quit app "Docker"' 2>/dev/null || true
  pkill -9 -f com.docker 2>/dev/null || true
  sleep 3
  rm -rf ~/Library/Containers/com.docker.docker/Data
  echo "  free now: $(df -h /System/Volumes/Data | awk 'NR==2{print $4}')"
fi

# 2) start docker + wait
echo "▶ starting Docker…"
open -a Docker
for i in $(seq 1 120); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker info >/dev/null 2>&1 || { echo "✗ Docker did not start"; exit 1; }
echo "  docker up"

# 3) reproducible build
echo "▶ reproducible build (this pulls ~5GB the first time)…"
solana-verify build --library-name yore

# 4) compare hashes, upgrade on-chain if needed
LOCAL=$(solana-verify get-executable-hash target/deploy/yore.so)
CHAIN=$(solana-verify get-program-hash -u "$RPC_URL" "$PROGRAM_ID")
echo "  reproducible : $LOCAL"
echo "  on-chain     : $CHAIN"
if [ "$LOCAL" != "$CHAIN" ]; then
  echo "▶ hashes differ → upgrading program to the reproducible binary…"
  solana program deploy \
    --url "$RPC_URL" --keypair "$DEPLOYER" \
    --program-id target/deploy/yore-keypair.json \
    target/deploy/yore.so
else
  echo "  already matches — no upgrade needed"
fi

# 5) submit verification
echo "▶ submitting verification (OtterSec remote build + on-chain PDA)…"
solana-verify verify-from-repo --remote \
  --url "$RPC_URL" --keypair "$DEPLOYER" \
  --program-id "$PROGRAM_ID" --library-name yore \
  "$REPO_URL"

echo "✓ done — verification submitted. Check https://solscan.io/account/$PROGRAM_ID (Verified badge appears once the remote build finishes)."
