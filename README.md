<div align="center">

# Yore Coprocessor

**Verifiable historical-state coprocessor for Solana.**
Read the past. Prove it on-chain.

[yorecoprocessor.com](https://yorecoprocessor.com) · `$YORE`

</div>

---

Solana programs are blind to their own history. The runtime exposes only the current
state of the accounts handed to an instruction — there is no syscall for *"what was the
state of account X at slot S."* Today, protocols that need a historical fact (an airdrop
snapshot, a time-weighted price, a past-eligibility check) run an off-chain script and
have a privileged signer push the result, forcing users to trust both.

**Yore turns historical reads into a verifiable, permissionless market.** A program submits
a query about the past; a staked prover answers it against a committed historical-state
root; and the on-chain verifier checks the result in a single call. The asymmetry is the
design: producing the answer takes real indexing and compute, while verifying it costs one
proof check — so provers are paid only for verified work and slashed for invalid proofs.

## On-chain program

Deployed on **mainnet-beta**: [`3YnWj7ftTswFDKHSj9jxxzEJCQC2FB37zrDpzqfAB7px`](https://solscan.io/account/3YnWj7ftTswFDKHSj9jxxzEJCQC2FB37zrDpzqfAB7px)

Built with **Anchor 0.31.1**. Four PDAs and the full request lifecycle:

| Account | Role |
| --- | --- |
| `Config` | admin, `$YORE` mint, prover collateral floor |
| `CommitmentRoot` | committed historical-state root per slot |
| `Prover` | registered prover + staked collateral |
| `Request` | a query + escrowed payment + verified result |

Instructions: `initialize`, `post_root`, `register_prover`, `add_stake`,
`deregister_prover`, `submit_request`, `claim_request`, `fulfill_request`,
`cancel_request`, `close_request`.

Two properties are first-class and covered by tests:

- **Token-2022** — all payment and collateral flows use `anchor_spl::token_interface`
  (`transfer_checked` / `close_account`), so the program works with both SPL Token and
  Token-2022 mints.
- **Full rent reclamation** — every closeable account returns *all* of its lamports to a
  user-controlled destination (data PDAs via Anchor `close = …`; escrow/stake token vaults
  via `close_account` CPI). Nothing is stranded in the program.

The `fulfill_request` instruction verifies a sorted-pair **keccak Merkle proof** on-chain
against the committed root (cheap, native syscall). The ZK path (SP1 → Groth16 →
`alt_bn128`) layers on top of the same verifier interface.

## Proof model

| Path | Settles by | Best for |
| --- | --- | --- |
| ZK | succinct proof checked on-chain | instant-finality, high-value reads |
| Optimistic | result + bond + challenge window | cheap, high-volume reads |
| Hybrid (default) | optimistic, auto-escalates to ZK | most traffic |

## Repository layout

```
programs/yore/      Anchor program (Rust)
  src/lib.rs          program entrypoints
  src/state.rs        account layouts
  src/instructions.rs accounts contexts + handlers
  src/merkle.rs       on-chain keccak Merkle verifier
tests/yore.ts       end-to-end integration (Token-2022 + proof + rent)
scripts/            deploy, initialize, token-mint config helpers
web/                marketing site + demo console (yorecoprocessor.com)
docs/               concept + design research
```

## Build & test

```bash
anchor build           # compile program + generate IDL
anchor test            # spin up a local validator and run the suite (9 passing)
```

## Deploy

The `$YORE` mint is configured in exactly one place — `web/config.js` (`TOKEN_MINT`) —
which feeds both the website and the on-chain `initialize`.

```bash
node scripts/set-mint.js <MINT_ADDRESS>     # one variable, set once
bash scripts/deploy-mainnet.sh              # deploy the program (upgradeable)
node scripts/initialize.js                  # configure admin, mint, collateral floor
```

## Status

| Milestone | State |
| --- | --- |
| Phase 0 — devnet/mainnet MVP, balance-at-slot, on-chain Merkle verify | shipped + tested |
| Phase 1 — TWAP-over-range, holding-at-snapshot, optimistic path | roadmap |
| Phase 2 — permissionless prover auction, slashing, fee market | roadmap |
| Phase 3 — decentralized archivists, retrievability proofs | roadmap |

## Honest positioning

A proof attests correct computation **against the committed root**, not that the root
reflects reality. At genesis, commitment correctness leans on existing archives;
decentralizing archival and removing that trust is roadmap work, stated plainly.

---

<div align="center"><sub>Solana / SVM · ZK &amp; verifiable-compute infrastructure</sub></div>
