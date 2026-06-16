/* ============================================================
   YORE — single source of truth for launch-time values.

   ►►► WHEN THE $YORE TOKEN IS MINTED: paste its address into
       TOKEN_MINT below (ONE line). It feeds BOTH:
         • the website (ticker / CA copy), and
         • the on-chain deploy (`initialize` yore_mint + scripts).
   ============================================================ */
(function () {
  var YORE_CONFIG = {
    // ►►► PASTE THE $YORE SPL / Token-2022 MINT HERE ◄◄◄
    TOKEN_MINT: "TBD_PASTE_MINT_AFTER_LAUNCH",

    TICKER: "$YORE",
    NETWORK: "mainnet-beta", // "devnet" | "mainnet-beta"
    PROGRAM_ID: "3YnWj7ftTswFDKHSj9jxxzEJCQC2FB37zrDpzqfAB7px",

    // deploy/initialize parameters (base units; used by scripts/initialize.js)
    // minimal on purpose — works with a tiny token supply; raise later via governance
    MIN_PROVER_STAKE: "1", // min $YORE collateral a prover must stake (base units)
    PROTOCOL_FEE_BPS: 0, // 0 = full payment to prover (fee market = later)

    // true once a real mint has been pasted above
    get HAS_TOKEN() {
      return typeof this.TOKEN_MINT === "string" && !this.TOKEN_MINT.startsWith("TBD");
    },
    // what the ticker / CA chip copies
    get COPY_VALUE() {
      return this.HAS_TOKEN ? this.TOKEN_MINT : this.TICKER;
    },
  };

  // browser
  if (typeof window !== "undefined") window.YORE_CONFIG = YORE_CONFIG;
  // node (deploy scripts import the SAME file)
  if (typeof module !== "undefined" && module.exports) module.exports = YORE_CONFIG;
})();
