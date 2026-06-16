use anchor_lang::prelude::*;

#[error_code]
pub enum YoreError {
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Stake is below the minimum prover collateral")]
    InsufficientStake,
    #[msg("Prover is not active")]
    ProverInactive,
    #[msg("Prover still has in-flight claimed requests")]
    ProverBusy,
    #[msg("Request is not open")]
    RequestNotOpen,
    #[msg("Request is not claimed")]
    RequestNotClaimed,
    #[msg("Request is not fulfilled")]
    RequestNotFulfilled,
    #[msg("Request is past its deadline")]
    DeadlinePassed,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Payment must be greater than zero")]
    ZeroPayment,
    #[msg("Caller is not the prover assigned to this request")]
    NotAssignedProver,
    #[msg("Merkle proof verification against the committed root failed")]
    InvalidProof,
    #[msg("Proof is deeper than the maximum allowed depth")]
    ProofTooDeep,
    #[msg("Unsupported query type")]
    UnsupportedQuery,
    #[msg("Commitment root hash kind does not match the query path")]
    HashKindMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
}
