use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod merkle;
pub mod state;

pub mod instructions;
use instructions::*;

declare_id!("3YnWj7ftTswFDKHSj9jxxzEJCQC2FB37zrDpzqfAB7px");

/// Yore Coprocessor — verifiable historical-state reads for Solana.
///
/// A requesting program escrows payment for a query about Solana's past; a staked
/// prover answers it against a committed historical-state root and proves the read
/// on-chain in a single verification. Honest work is paid; the design slashes fraud.
#[program]
pub mod yore {
    use super::*;

    /// One-time protocol setup. Sets admin, the $YORE mint, and prover collateral floor.
    pub fn initialize(
        ctx: Context<Initialize>,
        min_prover_stake: u64,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize(ctx, min_prover_stake, protocol_fee_bps)
    }

    /// Admin anchors a committed historical-state root for a slot.
    pub fn post_root(
        ctx: Context<PostRoot>,
        slot: u64,
        root: [u8; 32],
        hash_kind: u8,
        leaf_count: u64,
    ) -> Result<()> {
        instructions::post_root(ctx, slot, root, hash_kind, leaf_count)
    }

    /// Stake $YORE collateral and register as an active prover.
    pub fn register_prover(ctx: Context<RegisterProver>, amount: u64) -> Result<()> {
        instructions::register_prover(ctx, amount)
    }

    /// Top up a prover's collateral.
    pub fn add_stake(ctx: Context<AddStake>, amount: u64) -> Result<()> {
        instructions::add_stake(ctx, amount)
    }

    /// Withdraw all collateral and close the prover, reclaiming all rent.
    pub fn deregister_prover(ctx: Context<DeregisterProver>) -> Result<()> {
        instructions::deregister_prover(ctx)
    }

    /// Submit a historical query and escrow its payment.
    pub fn submit_request(
        ctx: Context<SubmitRequest>,
        query_type: u8,
        target: Pubkey,
        slot: u64,
        payment: u64,
        deadline: i64,
    ) -> Result<()> {
        instructions::submit_request(ctx, query_type, target, slot, payment, deadline)
    }

    /// A staked prover claims an open request.
    pub fn claim_request(ctx: Context<ClaimRequest>) -> Result<()> {
        instructions::claim_request(ctx)
    }

    /// Fulfill a claimed request: verify the Merkle proof on-chain, pay out, settle.
    pub fn fulfill_request(
        ctx: Context<FulfillRequest>,
        value: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::fulfill_request(ctx, value, proof)
    }

    /// Requestor cancels an unclaimed request and reclaims escrow + all rent.
    pub fn cancel_request(ctx: Context<CancelRequest>) -> Result<()> {
        instructions::cancel_request(ctx)
    }

    /// Reclaim the Request PDA rent after the verified result has been consumed.
    pub fn close_request(ctx: Context<CloseRequest>) -> Result<()> {
        instructions::close_request(ctx)
    }
}
