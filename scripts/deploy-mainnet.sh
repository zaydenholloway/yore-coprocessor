#!/usr/bin/env bash
# ============================================================
# Yore — mainnet program deploy.  Run from anywhere:
#   RPC_URL="https://your-paid-rpc" bash scripts/deploy-mainnet.sh
#
# Requires: .deploy/deployer.json funded with ~6.5 SOL.
# Public mainnet RPC often rate-limits large deploys — a paid
# RPC (Helius/Triton/QuickNode) via RPC_URL is strongly advised.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

DEPLOYER="$ROOT/.deploy/deployer.json"
PROGRAM_KP="$ROOT/target/deploy/yore-keypair.json"
RPC_URL="${RPC_URL:-https://api.mainnet-beta.solana.com}"

[ -f "$DEPLOYER" ] || { echo "✗ missing $DEPLOYER (place the funded deploy keypair there)"; exit 1; }

echo "▶ deployer : $(solana address -k "$DEPLOYER")"
echo "▶ program  : $(solana address -k "$PROGRAM_KP")"
echo "▶ rpc      : $RPC_URL"
echo "▶ balance  : $(solana balance -k "$DEPLOYER" -u "$RPC_URL" 2>/dev/null || echo '?')"

echo "▶ building…"
anchor build

echo "▶ deploying to mainnet (this uploads ~430KB; may take a minute)…"
anchor deploy --provider.cluster "$RPC_URL" --provider.wallet "$DEPLOYER"

echo "✓ deployed. program id: $(solana address -k "$PROGRAM_KP")"
echo "→ next: RPC_URL=\"$RPC_URL\" node scripts/initialize.js"
echo "→ optional: hand the upgrade authority to your main wallet:"
echo "   solana program set-upgrade-authority $(solana address -k "$PROGRAM_KP") \\"
echo "     --new-upgrade-authority <YOUR_MAIN_WALLET> -k \"$DEPLOYER\" -u \"$RPC_URL\""
