use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::constants::*;
use crate::error::YoreError;
use crate::merkle;
use crate::state::*;

// ============================================================================
// Token helpers
//
// All escrow/stake token accounts are owned by the Config PDA, which signs
// transfers and closes with the ["config"] seeds. Every close returns the
// token account's rent lamports to a user-controlled destination, so no rent
// is ever stranded in the program.
// ============================================================================

/// Move `amount` from a user-owned token account into a program vault (user signs).
fn pull<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi = CpiContext::new(
        token_program.to_account_info(),
        TransferChecked {
            from: from.to_account_info(),
            mint: mint.to_account_info(),
            to: to.to_account_info(),
            authority: authority.clone(),
        },
    );
    transfer_checked(cpi, amount, mint.decimals)
}

/// Move `amount` out of a program vault to a user token account (Config PDA signs).
fn push<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    config: &Account<'info, Config>,
    amount: u64,
) -> Result<()> {
    let bump = config.bump;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[bump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferChecked {
            from: vault.to_account_info(),
            mint: mint.to_account_info(),
            to: to.to_account_info(),
            authority: config.to_account_info(),
        },
        signer,
    );
    transfer_checked(cpi, amount, mint.decimals)
}

/// Close an emptied program vault, returning its rent lamports to `destination`.
fn close_vault<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    config: &Account<'info, Config>,
) -> Result<()> {
    let bump = config.bump;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[bump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: destination.clone(),
            authority: config.to_account_info(),
        },
        signer,
    );
    close_account(cpi)
}

// ============================================================================
// initialize
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// The $YORE mint (SPL Token or Token-2022).
    pub yore_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    min_prover_stake: u64,
    protocol_fee_bps: u16,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.yore_mint = ctx.accounts.yore_mint.key();
    config.min_prover_stake = min_prover_stake;
    config.protocol_fee_bps = protocol_fee_bps;
    config.request_count = 0;
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}

// ============================================================================
// post_root (admin) — anchor a committed historical-state root for a slot
// ============================================================================

#[derive(Accounts)]
#[instruction(slot: u64)]
pub struct PostRoot<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + CommitmentRoot::INIT_SPACE,
        seeds = [ROOT_SEED, &slot.to_le_bytes()],
        bump
    )]
    pub commitment_root: Account<'info, CommitmentRoot>,
    pub system_program: Program<'info, System>,
}

pub fn post_root(
    ctx: Context<PostRoot>,
    slot: u64,
    root: [u8; 32],
    hash_kind: u8,
    leaf_count: u64,
) -> Result<()> {
    let cr = &mut ctx.accounts.commitment_root;
    cr.slot = slot;
    cr.root = root;
    cr.hash_kind = hash_kind;
    cr.leaf_count = leaf_count;
    cr.authority = ctx.accounts.admin.key();
    cr.posted_at = Clock::get()?.unix_timestamp;
    cr.bump = ctx.bumps.commitment_root;
    Ok(())
}

// ============================================================================
// register_prover — stake $YORE and become an active prover
// ============================================================================

#[derive(Accounts)]
pub struct RegisterProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Prover::INIT_SPACE,
        seeds = [PROVER_SEED, authority.key().as_ref()],
        bump
    )]
    pub prover: Account<'info, Prover>,
    #[account(
        init,
        payer = authority,
        seeds = [PROVER_VAULT_SEED, prover.key().as_ref()],
        bump,
        token::mint = yore_mint,
        token::authority = config,
        token::token_program = token_program,
    )]
    pub prover_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = authority,
        token::token_program = token_program,
    )]
    pub authority_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn register_prover(ctx: Context<RegisterProver>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, YoreError::Paused);
    require!(
        amount >= ctx.accounts.config.min_prover_stake,
        YoreError::InsufficientStake
    );
    pull(
        &ctx.accounts.token_program,
        &ctx.accounts.authority_token,
        &ctx.accounts.prover_vault,
        &ctx.accounts.yore_mint,
        &ctx.accounts.authority.to_account_info(),
        amount,
    )?;
    let prover = &mut ctx.accounts.prover;
    prover.authority = ctx.accounts.authority.key();
    prover.stake = amount;
    prover.active = true;
    prover.active_claims = 0;
    prover.fulfilled = 0;
    prover.slashed = 0;
    prover.vault_bump = ctx.bumps.prover_vault;
    prover.bump = ctx.bumps.prover;
    Ok(())
}

// ============================================================================
// add_stake — top up collateral
// ============================================================================

#[derive(Accounts)]
pub struct AddStake<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [PROVER_SEED, authority.key().as_ref()],
        bump = prover.bump,
        has_one = authority,
    )]
    pub prover: Account<'info, Prover>,
    #[account(
        mut,
        seeds = [PROVER_VAULT_SEED, prover.key().as_ref()],
        bump = prover.vault_bump,
    )]
    pub prover_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = authority,
        token::token_program = token_program,
    )]
    pub authority_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn add_stake(ctx: Context<AddStake>, amount: u64) -> Result<()> {
    pull(
        &ctx.accounts.token_program,
        &ctx.accounts.authority_token,
        &ctx.accounts.prover_vault,
        &ctx.accounts.yore_mint,
        &ctx.accounts.authority.to_account_info(),
        amount,
    )?;
    let prover = &mut ctx.accounts.prover;
    prover.stake = prover.stake.checked_add(amount).ok_or(YoreError::Overflow)?;
    prover.active = true;
    Ok(())
}

// ============================================================================
// deregister_prover — withdraw all collateral and reclaim ALL rent
// ============================================================================

#[derive(Accounts)]
pub struct DeregisterProver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [PROVER_SEED, authority.key().as_ref()],
        bump = prover.bump,
        has_one = authority,
        close = authority,
    )]
    pub prover: Account<'info, Prover>,
    #[account(
        mut,
        seeds = [PROVER_VAULT_SEED, prover.key().as_ref()],
        bump = prover.vault_bump,
    )]
    pub prover_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = authority,
        token::token_program = token_program,
    )]
    pub authority_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn deregister_prover(ctx: Context<DeregisterProver>) -> Result<()> {
    require!(
        ctx.accounts.prover.active_claims == 0,
        YoreError::ProverBusy
    );
    let remaining = ctx.accounts.prover_vault.amount;
    if remaining > 0 {
        push(
            &ctx.accounts.token_program,
            &ctx.accounts.prover_vault,
            &ctx.accounts.authority_token,
            &ctx.accounts.yore_mint,
            &ctx.accounts.config,
            remaining,
        )?;
    }
    // Return the vault's rent to the prover, then the Prover PDA's rent via `close`.
    close_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.prover_vault,
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.config,
    )?;
    Ok(())
}

// ============================================================================
// submit_request — escrow payment and queue a historical query
// ============================================================================

#[derive(Accounts)]
#[instruction(query_type: u8, target: Pubkey, slot: u64, payment: u64, deadline: i64)]
pub struct SubmitRequest<'info> {
    #[account(mut)]
    pub requestor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    /// Must already exist so the query is answerable against a committed root.
    #[account(seeds = [ROOT_SEED, &slot.to_le_bytes()], bump = commitment_root.bump)]
    pub commitment_root: Account<'info, CommitmentRoot>,
    #[account(
        init,
        payer = requestor,
        space = 8 + Request::INIT_SPACE,
        seeds = [REQUEST_SEED, requestor.key().as_ref(), &config.request_count.to_le_bytes()],
        bump
    )]
    pub request: Account<'info, Request>,
    #[account(
        init,
        payer = requestor,
        seeds = [REQUEST_VAULT_SEED, request.key().as_ref()],
        bump,
        token::mint = yore_mint,
        token::authority = config,
        token::token_program = token_program,
    )]
    pub request_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = requestor,
        token::token_program = token_program,
    )]
    pub requestor_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn submit_request(
    ctx: Context<SubmitRequest>,
    query_type: u8,
    target: Pubkey,
    slot: u64,
    payment: u64,
    deadline: i64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, YoreError::Paused);
    require!(payment > 0, YoreError::ZeroPayment);
    require!(query_type == QUERY_BALANCE_AT_SLOT, YoreError::UnsupportedQuery);
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, YoreError::InvalidDeadline);

    pull(
        &ctx.accounts.token_program,
        &ctx.accounts.requestor_token,
        &ctx.accounts.request_vault,
        &ctx.accounts.yore_mint,
        &ctx.accounts.requestor.to_account_info(),
        payment,
    )?;

    let nonce = ctx.accounts.config.request_count;
    let request_vault_bump = ctx.bumps.request_vault;
    let request_bump = ctx.bumps.request;

    let req = &mut ctx.accounts.request;
    req.requestor = ctx.accounts.requestor.key();
    req.nonce = nonce;
    req.query_type = query_type;
    req.target = target;
    req.slot = slot;
    req.payment = payment;
    req.deadline = deadline;
    req.status = STATUS_OPEN;
    req.prover = Pubkey::default();
    req.claimed_at = 0;
    req.result_value = 0;
    req.fulfilled_at = 0;
    req.vault_bump = request_vault_bump;
    req.bump = request_bump;

    let config = &mut ctx.accounts.config;
    config.request_count = config
        .request_count
        .checked_add(1)
        .ok_or(YoreError::Overflow)?;
    Ok(())
}

// ============================================================================
// claim_request — a staked prover takes the work
// ============================================================================

#[derive(Accounts)]
pub struct ClaimRequest<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PROVER_SEED, authority.key().as_ref()],
        bump = prover.bump,
        has_one = authority,
    )]
    pub prover: Account<'info, Prover>,
    #[account(mut)]
    pub request: Account<'info, Request>,
}

pub fn claim_request(ctx: Context<ClaimRequest>) -> Result<()> {
    require!(!ctx.accounts.config.paused, YoreError::Paused);
    require!(ctx.accounts.prover.active, YoreError::ProverInactive);
    require!(
        ctx.accounts.prover.stake >= ctx.accounts.config.min_prover_stake,
        YoreError::InsufficientStake
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.request.status == STATUS_OPEN,
        YoreError::RequestNotOpen
    );
    require!(now <= ctx.accounts.request.deadline, YoreError::DeadlinePassed);

    let prover_authority = ctx.accounts.prover.authority;
    let req = &mut ctx.accounts.request;
    req.status = STATUS_CLAIMED;
    req.prover = prover_authority;
    req.claimed_at = now;

    let prover = &mut ctx.accounts.prover;
    prover.active_claims = prover
        .active_claims
        .checked_add(1)
        .ok_or(YoreError::Overflow)?;
    Ok(())
}

// ============================================================================
// fulfill_request — verify the Merkle proof on-chain, pay the prover, settle
// ============================================================================

#[derive(Accounts)]
pub struct FulfillRequest<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [PROVER_SEED, authority.key().as_ref()],
        bump = prover.bump,
        has_one = authority,
    )]
    pub prover: Account<'info, Prover>,
    #[account(
        mut,
        constraint = request.status == STATUS_CLAIMED @ YoreError::RequestNotClaimed,
        constraint = request.prover == authority.key() @ YoreError::NotAssignedProver,
    )]
    pub request: Account<'info, Request>,
    #[account(
        seeds = [ROOT_SEED, &request.slot.to_le_bytes()],
        bump = commitment_root.bump,
    )]
    pub commitment_root: Account<'info, CommitmentRoot>,
    #[account(
        mut,
        seeds = [REQUEST_VAULT_SEED, request.key().as_ref()],
        bump = request.vault_bump,
    )]
    pub request_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = authority,
        token::token_program = token_program,
    )]
    pub prover_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: only receives reclaimed escrow-vault rent; pinned to request.requestor.
    #[account(mut, address = request.requestor)]
    pub requestor: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn fulfill_request(
    ctx: Context<FulfillRequest>,
    value: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    require!(proof.len() <= MAX_PROOF_DEPTH, YoreError::ProofTooDeep);

    let now = Clock::get()?.unix_timestamp;
    {
        let req = &ctx.accounts.request;
        require!(now <= req.deadline, YoreError::DeadlinePassed);
        require!(
            req.query_type == QUERY_BALANCE_AT_SLOT,
            YoreError::UnsupportedQuery
        );
        require!(
            ctx.accounts.commitment_root.hash_kind == HASH_KECCAK_MERKLE,
            YoreError::HashKindMismatch
        );
        let leaf = merkle::leaf_hash(&req.target, value);
        require!(
            merkle::verify_proof(leaf, &proof, ctx.accounts.commitment_root.root),
            YoreError::InvalidProof
        );
    }

    let payment = ctx.accounts.request.payment;
    // Pay the prover the escrowed fee (full payment for the MVP fee model).
    push(
        &ctx.accounts.token_program,
        &ctx.accounts.request_vault,
        &ctx.accounts.prover_token,
        &ctx.accounts.yore_mint,
        &ctx.accounts.config,
        payment,
    )?;
    // Return the escrow vault's rent to the requestor.
    close_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.request_vault,
        &ctx.accounts.requestor.to_account_info(),
        &ctx.accounts.config,
    )?;

    let req = &mut ctx.accounts.request;
    req.status = STATUS_FULFILLED;
    req.result_value = value;
    req.fulfilled_at = now;

    let prover = &mut ctx.accounts.prover;
    prover.fulfilled = prover.fulfilled.checked_add(1).ok_or(YoreError::Overflow)?;
    prover.active_claims = prover
        .active_claims
        .checked_sub(1)
        .ok_or(YoreError::Overflow)?;
    Ok(())
}

// ============================================================================
// cancel_request — requestor reclaims an unclaimed request + ALL rent
// ============================================================================

#[derive(Accounts)]
pub struct CancelRequest<'info> {
    #[account(mut, address = request.requestor)]
    pub requestor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.yore_mint)]
    pub yore_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, close = requestor)]
    pub request: Account<'info, Request>,
    #[account(
        mut,
        seeds = [REQUEST_VAULT_SEED, request.key().as_ref()],
        bump = request.vault_bump,
    )]
    pub request_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = yore_mint,
        token::authority = requestor,
        token::token_program = token_program,
    )]
    pub requestor_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn cancel_request(ctx: Context<CancelRequest>) -> Result<()> {
    require!(
        ctx.accounts.request.status == STATUS_OPEN,
        YoreError::RequestNotOpen
    );
    let payment = ctx.accounts.request.payment;
    // Refund the escrow, then return the escrow vault's rent to the requestor.
    push(
        &ctx.accounts.token_program,
        &ctx.accounts.request_vault,
        &ctx.accounts.requestor_token,
        &ctx.accounts.yore_mint,
        &ctx.accounts.config,
        payment,
    )?;
    close_vault(
        &ctx.accounts.token_program,
        &ctx.accounts.request_vault,
        &ctx.accounts.requestor.to_account_info(),
        &ctx.accounts.config,
    )?;
    // The Request PDA's rent is returned to the requestor via `close = requestor`.
    Ok(())
}

// ============================================================================
// close_request — reclaim the Request PDA rent after the result is consumed
// ============================================================================

#[derive(Accounts)]
pub struct CloseRequest<'info> {
    #[account(mut, address = request.requestor)]
    pub requestor: Signer<'info>,
    #[account(
        mut,
        close = requestor,
        constraint = request.status == STATUS_FULFILLED @ YoreError::RequestNotFulfilled,
    )]
    pub request: Account<'info, Request>,
}

pub fn close_request(_ctx: Context<CloseRequest>) -> Result<()> {
    // `close = requestor` returns all remaining rent to the requestor.
    Ok(())
}
