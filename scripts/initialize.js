/* ============================================================
   Yore — one-time on-chain setup after deploy.
   Reads the SAME token from web/config.js (TOKEN_MINT), so the
   token is configured in exactly ONE place.

   Run:  RPC_URL="https://your-rpc" node scripts/initialize.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");

const cfg = require(path.join(__dirname, "..", "web", "config.js"));
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

(async () => {
  if (!cfg.HAS_TOKEN) {
    console.error("✗ Set TOKEN_MINT in web/config.js before initializing.");
    process.exit(1);
  }
  const mint = new PublicKey(cfg.TOKEN_MINT);

  const secret = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", ".deploy", "deployer.json"), "utf8")
  );
  const deployer = Keypair.fromSecretKey(Uint8Array.from(secret));

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "target", "idl", "yore.json"), "utf8")
  );

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(deployer), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  if (await connection.getAccountInfo(configPda)) {
    console.log("✓ already initialized:", configPda.toBase58());
    return;
  }

  console.log("▶ admin :", deployer.publicKey.toBase58());
  console.log("▶ mint  :", mint.toBase58());
  console.log("▶ stake :", cfg.MIN_PROVER_STAKE, "  feeBps:", cfg.PROTOCOL_FEE_BPS);

  const sig = await program.methods
    .initialize(new anchor.BN(cfg.MIN_PROVER_STAKE), Number(cfg.PROTOCOL_FEE_BPS))
    .accountsStrict({
      admin: deployer.publicKey,
      config: configPda,
      yoreMint: mint,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✓ initialized.");
  console.log("  tx     :", sig);
  console.log("  config :", configPda.toBase58());
})().catch((e) => {
  console.error("✗ initialize failed:", e.message || e);
  process.exit(1);
});
