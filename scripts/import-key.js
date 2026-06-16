/* ============================================================
   Import YOUR wallet's private key so YOUR wallet becomes the
   program's deploy payer + UPGRADE AUTHORITY (the "dev") + admin.

   Writes -> .deploy/deployer.json  (Solana CLI format, chmod 600)

   Run it LOCALLY so your key never goes through chat:
     node scripts/import-key.js                 # paste key at the prompt
   or:
     YORE_KEY="<base58-or-[..]-array>" node scripts/import-key.js

   Accepts a Phantom/Solflare base58 export, a 64/32-byte JSON
   array, all normalized to a canonical 64-int keypair file.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("@coral-xyz/anchor").utils.bytes.bs58;

const OUT = path.join(__dirname, "..", ".deploy", "deployer.json");

function toKeypair(bytes) {
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error("expected 32 or 64 key bytes, got " + bytes.length);
}

function parse(input) {
  const s = input.trim().replace(/^>?\s*/, "");
  if (s.startsWith("[")) return Uint8Array.from(JSON.parse(s));
  return Uint8Array.from(bs58.decode(s));
}

function write(input) {
  let kp;
  try {
    kp = toKeypair(parse(input));
  } catch (e) {
    console.error("✗ invalid key:", e.message);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(Array.from(kp.secretKey)));
  try { fs.chmodSync(OUT, 0o600); } catch {}
  console.log("✓ wrote", OUT, "(chmod 600, git-ignored)");
  console.log("✓ this wallet is now the deployer / upgrade authority (dev):");
  console.log("  " + kp.publicKey.toBase58());
  console.log("→ fund it with ~6.5 SOL, then tell me “deploy”.");
}

if (process.env.YORE_KEY) {
  write(process.env.YORE_KEY);
} else {
  process.stdout.write("Paste your wallet private key (base58 or [..] array) + Enter:\n> ");
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
    if (buf.includes("\n")) { process.stdin.pause(); write(buf); }
  });
}
