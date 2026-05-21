//! On-chain Merkle verification for the keccak commitment path.
//!
//! This is the trustless-against-the-committed-root primitive. A prover supplies a
//! `(target, value)` leaf plus a sibling path; the program recomputes the root with
//! the native keccak syscall and checks it equals the committed root for the slot.
//!
//! Layout (OpenZeppelin `StandardMerkleTree`-compatible so off-chain tooling matches):
//!   leaf            = keccak( keccak( target_pubkey(32) ++ value_le(8) ) )   [double-hashed]
//!   internal node   = keccak( min(a, b) ++ max(a, b) )                       [sorted pair]
//!
//! Double-hashing the leaf domain-separates leaves from internal nodes, preventing
//! second-preimage forgeries across tree levels.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

/// Compute the double-hashed leaf for a `(target, value)` pair.
pub fn leaf_hash(target: &Pubkey, value: u64) -> [u8; 32] {
    let mut buf = [0u8; 40];
    buf[..32].copy_from_slice(target.as_ref());
    buf[32..].copy_from_slice(&value.to_le_bytes());
    let inner = keccak::hash(&buf);
    keccak::hash(inner.as_ref()).to_bytes()
}

/// Fold a sorted-pair Merkle proof from `leaf` and compare against `root`.
pub fn verify_proof(leaf: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    let mut computed = leaf;
    for sib in proof {
        computed = if computed <= *sib {
            keccak::hashv(&[computed.as_ref(), sib.as_ref()]).to_bytes()
        } else {
            keccak::hashv(&[sib.as_ref(), computed.as_ref()]).to_bytes()
        };
    }
    computed == root
}
