import { PublicKey } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Off-chain mirror of `programs/yore/src/merkle.rs`.
 *
 *   leaf          = keccak( keccak( target(32) ++ value_le(8) ) )   [double-hashed]
 *   internal node = keccak( min(a,b) ++ max(a,b) )                  [sorted pair]
 *
 * Keeping these byte-for-byte identical is what makes a prover's Merkle path
 * verify against the on-chain committed root.
 */
export function leafHash(target: PublicKey, value: bigint): Buffer {
  const buf = Buffer.alloc(40);
  target.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(value, 32);
  const inner = keccak_256(buf);
  return Buffer.from(keccak_256(inner));
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  const [lo, hi] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return Buffer.from(keccak_256(Buffer.concat([lo, hi])));
}

/** Minimal sorted-pair Merkle tree; odd nodes are paired with themselves. */
export class MerkleTree {
  readonly layers: Buffer[][];

  constructor(leaves: Buffer[]) {
    let level = leaves.slice();
    this.layers = [level];
    while (level.length > 1) {
      const next: Buffer[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i];
        next.push(hashPair(left, right));
      }
      level = next;
      this.layers.push(level);
    }
  }

  get root(): Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  proof(index: number): Buffer[] {
    const out: Buffer[] = [];
    let idx = index;
    for (let l = 0; l < this.layers.length - 1; l++) {
      const level = this.layers[l];
      const sibIdx = idx ^ 1;
      out.push(sibIdx < level.length ? level[sibIdx] : level[idx]);
      idx = Math.floor(idx / 2);
    }
    return out;
  }
}
