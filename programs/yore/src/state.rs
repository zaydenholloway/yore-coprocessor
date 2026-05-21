use anchor_lang::prelude::*;

/// Singleton protocol configuration. PDA: ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Admin authority (can post roots, update params).
    pub admin: Pubkey,
    /// The $YORE mint used for payment and collateral (SPL Token or Token-2022).
    pub yore_mint: Pubkey,
    /// Minimum collateral a prover must hold to claim requests.
    pub min_prover_stake: u64,
    /// Protocol fee in basis points (reserved for the fee market; 0 = pass full payment).
    pub protocol_fee_bps: u16,
    /// Monotonic counter used as the per-request nonce.
    pub request_count: u64,
    /// Emergency pause for new requests / registrations.
    pub paused: bool,
    /// PDA bump. The Config PDA is also the authority over every escrow/stake vault.
    pub bump: u8,
}

/// A committed root over Solana's historical account state at a given slot.
/// PDA: ["root", slot.to_le_bytes()].
#[account]
#[derive(InitSpace)]
pub struct CommitmentRoot {
    pub slot: u64,
    /// Merkle root the prover's result is checked against.
    pub root: [u8; 32],
    /// HASH_KECCAK_MERKLE (on-chain verify) or HASH_ZK_POSEIDON (future ZK path).
    pub hash_kind: u8,
    /// Number of leaves committed (metadata).
    pub leaf_count: u64,
    /// Who posted this root (admin at genesis; decentralized later).
    pub authority: Pubkey,
    pub posted_at: i64,
    pub bump: u8,
}

/// A registered prover and its collateral. PDA: ["prover", authority].
#[account]
#[derive(InitSpace)]
pub struct Prover {
    pub authority: Pubkey,
    /// Collateral currently staked (in $YORE base units).
    pub stake: u64,
    pub active: bool,
    /// Number of requests claimed but not yet fulfilled/cancelled.
    pub active_claims: u64,
    /// Lifetime fulfilled requests.
    pub fulfilled: u64,
    /// Lifetime slashed amount (reserved for the dispute/slashing path).
    pub slashed: u64,
    /// Bump of the prover's stake vault token account.
    pub vault_bump: u8,
    pub bump: u8,
}

/// A historical-state query and its escrowed payment.
/// PDA: ["request", requestor, nonce.to_le_bytes()].
#[account]
#[derive(InitSpace)]
pub struct Request {
    pub requestor: Pubkey,
    pub nonce: u64,
    /// QUERY_BALANCE_AT_SLOT, etc.
    pub query_type: u8,
    /// The account key whose historical value is being proven.
    pub target: Pubkey,
    /// Slot the query is anchored to (must have a CommitmentRoot).
    pub slot: u64,
    /// Escrowed payment, paid to the prover on a verified fulfillment.
    pub payment: u64,
    /// Unix timestamp after which the request can be cancelled/reclaimed.
    pub deadline: i64,
    /// STATUS_OPEN / CLAIMED / FULFILLED.
    pub status: u8,
    /// Prover that claimed the request (default until claimed).
    pub prover: Pubkey,
    pub claimed_at: i64,
    /// The verified result (e.g. proven balance) — consumable by the requesting program.
    pub result_value: u64,
    pub fulfilled_at: i64,
    /// Bump of the request's escrow vault token account.
    pub vault_bump: u8,
    pub bump: u8,
}
