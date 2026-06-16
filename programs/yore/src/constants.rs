//! PDA seeds and protocol enums for the Yore Coprocessor.

// ---- PDA seeds ----
pub const CONFIG_SEED: &[u8] = b"config";
pub const ROOT_SEED: &[u8] = b"root";
pub const PROVER_SEED: &[u8] = b"prover";
pub const PROVER_VAULT_SEED: &[u8] = b"prover_vault";
pub const REQUEST_SEED: &[u8] = b"request";
pub const REQUEST_VAULT_SEED: &[u8] = b"request_vault";

// ---- Request lifecycle ----
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_CLAIMED: u8 = 1;
pub const STATUS_FULFILLED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;

// ---- Query types (extensible registry) ----
/// Prove the value (e.g. lamports / token amount) committed for `target` at a slot.
pub const QUERY_BALANCE_AT_SLOT: u8 = 0;

// ---- Commitment hash kinds ----
/// Sorted-pair keccak256 Merkle tree, verified on-chain (current production path).
pub const HASH_KECCAK_MERKLE: u8 = 0;
/// Reserved: Poseidon / zkVM commitment verified via a succinct proof (future ZK path).
pub const HASH_ZK_POSEIDON: u8 = 1;

/// Upper bound on the number of accepted Merkle siblings, bounding compute per verify.
pub const MAX_PROOF_DEPTH: usize = 40;
