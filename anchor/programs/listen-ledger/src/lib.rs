//! Listen Ledger
//!
//! Every piece of content the player can open (a track, a music video, a
//! radio station, a podcast, a live feed) gets a Channel account addressed by
//! the SHA-256 of its canonical id. Listeners pay a channel per minute they
//! actually listened, or send a one-off boost with a short message.
//!
//! Most of the catalogue is Creative Commons music by people who have never
//! heard of this app and have no wallet. Their money must not go to whoever
//! happens to open the channel first, so an unclaimed channel keeps what it
//! earns inside its own account. Only the attestor named in Config can bind a
//! payout wallet, and binding sweeps the held balance out in the same
//! instruction. Nothing is ever paid to the platform.
//!
//! Playlists ("crates") are hashed and published here too. When a session is
//! played from someone else's crate, the curator receives a fixed 5% of it.
//! That is the one thing streaming services do not pay for today.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("7JDfVFmUWspP1nd5a45ULVR89hDjPmAuw82ufu9x6xKu");

/// Curator share of a crate-driven stream payment, in basis points.
const CURATOR_BPS: u64 = 500;
/// One session reports at most four hours. Longer listens are split.
const MAX_SESSION_SECONDS: u32 = 4 * 60 * 60;
const MAX_LABEL_LEN: usize = 64;
const MAX_TITLE_LEN: usize = 48;
const MAX_MESSAGE_LEN: usize = 140;

#[program]
pub mod listen_ledger {
    use super::*;

    /// Names the key allowed to bind payout wallets. Runs once: the Config
    /// address is fixed, so a second call fails at account creation.
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.attestor = ctx.accounts.attestor.key();
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Opens the ledger entry for one piece of content. Anyone may open it;
    /// opening grants no rights over the money it later collects.
    pub fn open_channel(
        ctx: Context<OpenChannel>,
        content: [u8; 32],
        kind: u8,
        label: String,
    ) -> Result<()> {
        require!(kind <= 4, LedgerError::BadKind);
        require!(!label.is_empty(), LedgerError::LabelEmpty);
        require!(label.len() <= MAX_LABEL_LEN, LedgerError::LabelTooLong);

        let ch = &mut ctx.accounts.channel;
        ch.content = content;
        ch.kind = kind;
        ch.label = label;
        ch.payout = Pubkey::default();
        ch.opened_by = ctx.accounts.payer.key();
        ch.opened_at = Clock::get()?.unix_timestamp;
        ch.bump = ctx.bumps.channel;
        Ok(())
    }

    /// Settles one listening session: `seconds` listened, `lamports` paid.
    /// When the session came from another person's crate, 5% goes to them.
    pub fn stream(
        ctx: Context<Stream>,
        content: [u8; 32],
        seconds: u32,
        lamports: u64,
    ) -> Result<()> {
        let _ = content;
        require!(seconds > 0, LedgerError::NothingListened);
        require!(seconds <= MAX_SESSION_SECONDS, LedgerError::SessionTooLong);

        let listener_key = ctx.accounts.listener.key();
        let mut curator_cut: u64 = 0;

        if let Some(crate_acc) = ctx.accounts.curation.as_mut() {
            let curator = ctx
                .accounts
                .curator
                .as_ref()
                .ok_or(LedgerError::CuratorMissing)?;
            require_keys_eq!(curator.key(), crate_acc.owner, LedgerError::CuratorMismatch);
            // Listening to your own crate earns you nothing; the count still
            // moves, the money does not.
            if crate_acc.owner != listener_key {
                curator_cut = lamports
                    .checked_mul(CURATOR_BPS)
                    .ok_or(LedgerError::Overflow)?
                    / 10_000;
                if curator_cut > 0 {
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.listener.to_account_info(),
                                to: curator.to_account_info(),
                            },
                        ),
                        curator_cut,
                    )?;
                }
                crate_acc.earned = crate_acc.earned.saturating_add(curator_cut);
            }
            crate_acc.sessions = crate_acc.sessions.saturating_add(1);
        }

        let artist_part = lamports.checked_sub(curator_cut).ok_or(LedgerError::Overflow)?;
        route_payment(
            &ctx.accounts.channel,
            ctx.accounts.payout.as_ref(),
            &ctx.accounts.listener,
            &ctx.accounts.system_program,
            artist_part,
        )?;

        let ch = &mut ctx.accounts.channel;
        if ch.payout == Pubkey::default() {
            ch.held = ch.held.saturating_add(artist_part);
        }
        ch.seconds = ch.seconds.saturating_add(seconds as u64);
        ch.sessions = ch.sessions.saturating_add(1);
        ch.received = ch.received.saturating_add(artist_part);

        let st = &mut ctx.accounts.stats;
        if st.wallet == Pubkey::default() {
            st.wallet = listener_key;
            st.bump = ctx.bumps.stats;
        }
        st.seconds = st.seconds.saturating_add(seconds as u64);
        st.sessions = st.sessions.saturating_add(1);
        st.paid = st.paid.saturating_add(lamports);

        emit!(Streamed {
            channel: ch.key(),
            listener: listener_key,
            seconds,
            lamports,
            curator_cut,
        });
        Ok(())
    }

    /// A one-off payment with a short message, shown on the live stage.
    pub fn boost(
        ctx: Context<Boost>,
        content: [u8; 32],
        lamports: u64,
        message: String,
    ) -> Result<()> {
        let _ = content;
        require!(lamports > 0, LedgerError::NothingPaid);
        require!(message.len() <= MAX_MESSAGE_LEN, LedgerError::MessageTooLong);

        route_payment(
            &ctx.accounts.channel,
            ctx.accounts.payout.as_ref(),
            &ctx.accounts.listener,
            &ctx.accounts.system_program,
            lamports,
        )?;

        let ch = &mut ctx.accounts.channel;
        if ch.payout == Pubkey::default() {
            ch.held = ch.held.saturating_add(lamports);
        }
        ch.boosts = ch.boosts.saturating_add(1);
        ch.received = ch.received.saturating_add(lamports);

        emit!(Boosted {
            channel: ch.key(),
            listener: ctx.accounts.listener.key(),
            lamports,
            message,
            at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Binds the artist's wallet after their identity has been checked off
    /// chain, and pays out everything the channel held for them.
    pub fn bind_payout(ctx: Context<BindPayout>, content: [u8; 32]) -> Result<()> {
        let _ = content;
        let payout_key = ctx.accounts.payout.key();
        require!(payout_key != Pubkey::default(), LedgerError::BadPayout);

        let held = ctx.accounts.channel.held;
        if held > 0 {
            let from = ctx.accounts.channel.to_account_info();
            let to = ctx.accounts.payout.to_account_info();
            **from.try_borrow_mut_lamports()? = from
                .lamports()
                .checked_sub(held)
                .ok_or(LedgerError::Overflow)?;
            **to.try_borrow_mut_lamports()? = to
                .lamports()
                .checked_add(held)
                .ok_or(LedgerError::Overflow)?;
        }

        let ch = &mut ctx.accounts.channel;
        ch.payout = payout_key;
        ch.held = 0;

        emit!(PayoutBound {
            channel: ch.key(),
            payout: payout_key,
            released: held,
        });
        Ok(())
    }

    /// Publishes a playlist by the hash of its canonical item list.
    pub fn publish_crate(
        ctx: Context<PublishCrate>,
        hash: [u8; 32],
        title: String,
        items: u16,
    ) -> Result<()> {
        require!(!title.is_empty(), LedgerError::LabelEmpty);
        require!(title.len() <= MAX_TITLE_LEN, LedgerError::LabelTooLong);
        require!(items > 0, LedgerError::EmptyCrate);

        let c = &mut ctx.accounts.curation;
        c.owner = ctx.accounts.owner.key();
        c.hash = hash;
        c.title = title;
        c.items = items;
        c.published_at = Clock::get()?.unix_timestamp;
        c.bump = ctx.bumps.curation;
        Ok(())
    }
}

/// Sends a payment to the bound payout wallet, or into the channel account
/// itself while the channel is unclaimed.
fn route_payment<'info>(
    channel: &Account<'info, Channel>,
    payout: Option<&UncheckedAccount<'info>>,
    listener: &Signer<'info>,
    system: &Program<'info, System>,
    lamports: u64,
) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    let to = if channel.payout == Pubkey::default() {
        channel.to_account_info()
    } else {
        let p = payout.ok_or(LedgerError::PayoutMissing)?;
        require_keys_eq!(p.key(), channel.payout, LedgerError::BadPayout);
        p.to_account_info()
    };
    system_program::transfer(
        CpiContext::new(
            system.to_account_info(),
            system_program::Transfer {
                from: listener.to_account_info(),
                to,
            },
        ),
        lamports,
    )
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = attestor, space = 8 + Config::SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub attestor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content: [u8; 32])]
pub struct OpenChannel<'info> {
    #[account(init, payer = payer, space = 8 + Channel::SPACE, seeds = [b"channel", content.as_ref()], bump)]
    pub channel: Account<'info, Channel>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content: [u8; 32])]
pub struct Stream<'info> {
    #[account(mut, seeds = [b"channel", content.as_ref()], bump = channel.bump)]
    pub channel: Account<'info, Channel>,
    #[account(
        init_if_needed,
        payer = listener,
        space = 8 + ListenerStats::SPACE,
        seeds = [b"listener", listener.key().as_ref()],
        bump
    )]
    pub stats: Account<'info, ListenerStats>,
    #[account(mut)]
    pub listener: Signer<'info>,
    /// CHECK: compared against `channel.payout` before any lamports move.
    #[account(mut)]
    pub payout: Option<UncheckedAccount<'info>>,
    #[account(mut)]
    pub curation: Option<Account<'info, Crate>>,
    /// CHECK: compared against `curation.owner` before any lamports move.
    #[account(mut)]
    pub curator: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content: [u8; 32])]
pub struct Boost<'info> {
    #[account(mut, seeds = [b"channel", content.as_ref()], bump = channel.bump)]
    pub channel: Account<'info, Channel>,
    #[account(mut)]
    pub listener: Signer<'info>,
    /// CHECK: compared against `channel.payout` before any lamports move.
    #[account(mut)]
    pub payout: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content: [u8; 32])]
pub struct BindPayout<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = attestor)]
    pub config: Account<'info, Config>,
    pub attestor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"channel", content.as_ref()],
        bump = channel.bump,
        constraint = channel.payout == Pubkey::default() @ LedgerError::AlreadyBound
    )]
    pub channel: Account<'info, Channel>,
    /// CHECK: any system wallet the attestor has verified off chain.
    #[account(mut)]
    pub payout: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct PublishCrate<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Crate::SPACE,
        seeds = [b"crate", owner.key().as_ref(), hash.as_ref()],
        bump
    )]
    pub curation: Account<'info, Crate>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub attestor: Pubkey,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 32 + 1;
}

#[account]
pub struct Channel {
    pub content: [u8; 32],
    pub kind: u8,
    pub label: String,
    pub payout: Pubkey,
    pub opened_by: Pubkey,
    pub opened_at: i64,
    pub seconds: u64,
    pub sessions: u64,
    pub boosts: u64,
    pub received: u64,
    pub held: u64,
    pub bump: u8,
}
impl Channel {
    pub const SPACE: usize = 32 + 1 + (4 + MAX_LABEL_LEN) + 32 + 32 + 8 + 8 * 5 + 1;
}

#[account]
pub struct ListenerStats {
    pub wallet: Pubkey,
    pub seconds: u64,
    pub sessions: u64,
    pub paid: u64,
    pub bump: u8,
}
impl ListenerStats {
    pub const SPACE: usize = 32 + 8 * 3 + 1;
}

#[account]
pub struct Crate {
    pub owner: Pubkey,
    pub hash: [u8; 32],
    pub title: String,
    pub items: u16,
    pub sessions: u64,
    pub earned: u64,
    pub published_at: i64,
    pub bump: u8,
}
impl Crate {
    pub const SPACE: usize = 32 + 32 + (4 + MAX_TITLE_LEN) + 2 + 8 * 3 + 1;
}

#[event]
pub struct Streamed {
    pub channel: Pubkey,
    pub listener: Pubkey,
    pub seconds: u32,
    pub lamports: u64,
    pub curator_cut: u64,
}

#[event]
pub struct Boosted {
    pub channel: Pubkey,
    pub listener: Pubkey,
    pub lamports: u64,
    pub message: String,
    pub at: i64,
}

#[event]
pub struct PayoutBound {
    pub channel: Pubkey,
    pub payout: Pubkey,
    pub released: u64,
}

#[error_code]
pub enum LedgerError {
    #[msg("Content kind must be 0-4")]
    BadKind,
    #[msg("Label is empty")]
    LabelEmpty,
    #[msg("Label is too long")]
    LabelTooLong,
    #[msg("A session must report at least one second")]
    NothingListened,
    #[msg("A session may report at most four hours")]
    SessionTooLong,
    #[msg("A boost must carry a payment")]
    NothingPaid,
    #[msg("Boost message is longer than 140 bytes")]
    MessageTooLong,
    #[msg("Crate account given without its curator")]
    CuratorMissing,
    #[msg("Curator does not own this crate")]
    CuratorMismatch,
    #[msg("This channel has a payout wallet; pass it")]
    PayoutMissing,
    #[msg("Payout account does not match the channel")]
    BadPayout,
    #[msg("This channel already has a payout wallet")]
    AlreadyBound,
    #[msg("A crate needs at least one item")]
    EmptyCrate,
    #[msg("Arithmetic overflow")]
    Overflow,
}
