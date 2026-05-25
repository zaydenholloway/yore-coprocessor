import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Yore } from "../target/types/yore";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { leafHash, MerkleTree } from "./merkle";

const QUERY_BALANCE_AT_SLOT = 0;
const HASH_KECCAK_MERKLE = 0;
const STATUS_CLAIMED = 1;
const STATUS_FULFILLED = 2;

describe("yore coprocessor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Yore as Program<Yore>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const requestor = Keypair.generate();
  const prover = Keypair.generate();

  const DECIMALS = 6;
  const MIN_STAKE = new BN(1_000_000); // 1 YORE
  const PAYMENT = new BN(500_000); // 0.5 YORE
  const SLOT = new BN(123_456_789);

  // The historical fact we will prove: targetWallet held BALANCE at SLOT.
  const targetWallet = Keypair.generate();
  const BALANCE = new BN(4_200_000_000);

  let mint: PublicKey;
  let requestorAta: PublicKey;
  let proverAta: PublicKey;

  // PDAs
  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  )[0];
  const rootPda = PublicKey.findProgramAddressSync(
    [Buffer.from("root"), SLOT.toArrayLike(Buffer, "le", 8)],
    program.programId
  )[0];
  const proverPda = PublicKey.findProgramAddressSync(
    [Buffer.from("prover"), prover.publicKey.toBuffer()],
    program.programId
  )[0];
  const proverVaultPda = PublicKey.findProgramAddressSync(
    [Buffer.from("prover_vault"), proverPda.toBuffer()],
    program.programId
  )[0];

  // Build a committed Merkle tree containing the target leaf at index 2.
  const TARGET_INDEX = 2;
  const others = [1, 2, 3, 4].map((i) =>
    leafHash(Keypair.generate().publicKey, BigInt(i * 7))
  );
  const targetLeaf = leafHash(targetWallet.publicKey, BigInt(BALANCE.toString()));
  const tree = new MerkleTree([
    others[0],
    others[1],
    targetLeaf,
    others[2],
    others[3],
  ]);

  let reqPda: PublicKey;
  let reqVaultPda: PublicKey;

  before(async () => {
    for (const kp of [requestor, prover]) {
      const sig = await connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
    }
    mint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    requestorAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        requestor.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
    ).address;
    proverAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        prover.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
    ).address;
    await mintTo(
      connection,
      admin,
      mint,
      requestorAta,
      admin,
      10_000_000,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    await mintTo(
      connection,
      admin,
      mint,
      proverAta,
      admin,
      10_000_000,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
  });

  it("initializes the protocol", async () => {
    await program.methods
      .initialize(MIN_STAKE, 0)
      .accountsStrict({
        admin: admin.publicKey,
        config: configPda,
        yoreMint: mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const cfg = await program.account.config.fetch(configPda);
    assert.ok(cfg.admin.equals(admin.publicKey));
    assert.ok(cfg.yoreMint.equals(mint));
    assert.equal(cfg.minProverStake.toString(), MIN_STAKE.toString());
  });

  it("posts a committed historical-state root", async () => {
    await program.methods
      .postRoot(SLOT, Array.from(tree.root), HASH_KECCAK_MERKLE, new BN(5))
      .accountsStrict({
        admin: admin.publicKey,
        config: configPda,
        commitmentRoot: rootPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const cr = await program.account.commitmentRoot.fetch(rootPda);
    assert.deepEqual(Buffer.from(cr.root), tree.root);
  });

  it("registers a prover with staked $YORE (Token-2022)", async () => {
    await program.methods
      .registerProver(MIN_STAKE)
      .accountsStrict({
        authority: prover.publicKey,
        config: configPda,
        yoreMint: mint,
        prover: proverPda,
        proverVault: proverVaultPda,
        authorityToken: proverAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([prover])
      .rpc();
    const p = await program.account.prover.fetch(proverPda);
    assert.equal(p.stake.toString(), MIN_STAKE.toString());
    assert.isTrue(p.active);
    const vault = await getAccount(
      connection,
      proverVaultPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(vault.amount.toString(), MIN_STAKE.toString());
  });

  it("submits a historical query, escrowing a Token-2022 payment", async () => {
    const cfg = await program.account.config.fetch(configPda);
    reqPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("request"),
        requestor.publicKey.toBuffer(),
        cfg.requestCount.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
    reqVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("request_vault"), reqPda.toBuffer()],
      program.programId
    )[0];
    const deadline = new BN(Math.floor(Date.now() / 1000) + 3600);

    await program.methods
      .submitRequest(QUERY_BALANCE_AT_SLOT, targetWallet.publicKey, SLOT, PAYMENT, deadline)
      .accountsStrict({
        requestor: requestor.publicKey,
        config: configPda,
        yoreMint: mint,
        commitmentRoot: rootPda,
        request: reqPda,
        requestVault: reqVaultPda,
        requestorToken: requestorAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([requestor])
      .rpc();

    const r = await program.account.request.fetch(reqPda);
    assert.ok(r.target.equals(targetWallet.publicKey));
    assert.equal(r.payment.toString(), PAYMENT.toString());
    const vault = await getAccount(
      connection,
      reqVaultPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(vault.amount.toString(), PAYMENT.toString());
  });

  it("a staked prover claims the request", async () => {
    await program.methods
      .claimRequest()
      .accountsStrict({
        authority: prover.publicKey,
        config: configPda,
        prover: proverPda,
        request: reqPda,
      })
      .signers([prover])
      .rpc();
    const r = await program.account.request.fetch(reqPda);
    assert.equal(r.status, STATUS_CLAIMED);
    assert.ok(r.prover.equals(prover.publicKey));
  });

  it("rejects a fulfillment with a wrong value (proof fails)", async () => {
    const proof = tree.proof(TARGET_INDEX).map((p) => Array.from(p));
    let threw = false;
    try {
      await program.methods
        .fulfillRequest(new BN(999), proof)
        .accountsStrict({
          authority: prover.publicKey,
          config: configPda,
          yoreMint: mint,
          prover: proverPda,
          request: reqPda,
          commitmentRoot: rootPda,
          requestVault: reqVaultPda,
          proverToken: proverAta,
          requestor: requestor.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([prover])
        .rpc();
    } catch (e) {
      threw = true;
      assert.include(e.toString(), "InvalidProof");
    }
    assert.isTrue(threw, "expected the bad proof to be rejected");
  });

  it("fulfills with a valid proof, pays the prover, reclaims escrow rent", async () => {
    const proof = tree.proof(TARGET_INDEX).map((p) => Array.from(p));
    const before = (
      await getAccount(connection, proverAta, undefined, TOKEN_2022_PROGRAM_ID)
    ).amount;

    await program.methods
      .fulfillRequest(BALANCE, proof)
      .accountsStrict({
        authority: prover.publicKey,
        config: configPda,
        yoreMint: mint,
        prover: proverPda,
        request: reqPda,
        commitmentRoot: rootPda,
        requestVault: reqVaultPda,
        proverToken: proverAta,
        requestor: requestor.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([prover])
      .rpc();

    const r = await program.account.request.fetch(reqPda);
    assert.equal(r.status, STATUS_FULFILLED);
    assert.equal(r.resultValue.toString(), BALANCE.toString());

    const after = (
      await getAccount(connection, proverAta, undefined, TOKEN_2022_PROGRAM_ID)
    ).amount;
    assert.equal((after - before).toString(), PAYMENT.toString());

    // Escrow vault closed -> its rent was reclaimed.
    assert.isNull(
      await connection.getAccountInfo(reqVaultPda),
      "request vault should be closed"
    );
  });

  it("closes the fulfilled request, returning ALL rent to the requestor", async () => {
    const balBefore = await connection.getBalance(requestor.publicKey);
    const reqInfo = await connection.getAccountInfo(reqPda);
    const rent = reqInfo!.lamports;

    await program.methods
      .closeRequest()
      .accountsStrict({ requestor: requestor.publicKey, request: reqPda })
      .signers([requestor])
      .rpc();

    const balAfter = await connection.getBalance(requestor.publicKey);
    assert.isNull(
      await connection.getAccountInfo(reqPda),
      "request account should be closed"
    );
    assert.equal(balAfter - balBefore, rent, "full rent returns to requestor");
  });

  it("lets a prover deregister, withdrawing stake and reclaiming all rent", async () => {
    const before = (
      await getAccount(connection, proverAta, undefined, TOKEN_2022_PROGRAM_ID)
    ).amount;

    await program.methods
      .deregisterProver()
      .accountsStrict({
        authority: prover.publicKey,
        config: configPda,
        yoreMint: mint,
        prover: proverPda,
        proverVault: proverVaultPda,
        authorityToken: proverAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([prover])
      .rpc();

    const after = (
      await getAccount(connection, proverAta, undefined, TOKEN_2022_PROGRAM_ID)
    ).amount;
    assert.equal((after - before).toString(), MIN_STAKE.toString());
    assert.isNull(
      await connection.getAccountInfo(proverPda),
      "prover account should be closed"
    );
    assert.isNull(
      await connection.getAccountInfo(proverVaultPda),
      "prover vault should be closed"
    );
  });
});
