/* ============================================================
   Set the $YORE token mint in ONE place (web/config.js).
   It feeds both the website and the on-chain initialize.

     node scripts/set-mint.js <MINT_ADDRESS>
   ============================================================ */
const fs = require("fs");
const path = require("path");

const mint = (process.argv[2] || "").trim();
if (!mint) {
  console.error("usage: node scripts/set-mint.js <MINT_ADDRESS>");
  process.exit(1);
}
if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
  console.error("✗ not a valid base58 Solana address:", mint);
  process.exit(1);
}

const f = path.join(__dirname, "..", "web", "config.js");
let s = fs.readFileSync(f, "utf8");
const re = /(TOKEN_MINT:\s*")[^"]*(")/;
if (!re.test(s)) {
  console.error("✗ TOKEN_MINT line not found in web/config.js");
  process.exit(1);
}
s = s.replace(re, `$1${mint}$2`);
fs.writeFileSync(f, s);
console.log("✓ TOKEN_MINT set to", mint);
console.log("  in", f);
console.log("→ next (after deploy): RPC_URL=... node scripts/initialize.js");
