// Devnet listen receipts, written with the SPL Memo program. web3.js is loaded
// on demand so the player itself stays light.

const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const RPC = "https://api.devnet.solana.com";

interface Provider {
  publicKey?: { toBase58(): string; toBytes(): Uint8Array };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signTransaction<T>(tx: T): Promise<T>;
}

export function provider(): Provider | null {
  const w = window as unknown as { phantom?: { solana?: Provider }; solflare?: Provider; solana?: Provider };
  return w.phantom?.solana || w.solflare || w.solana || null;
}

export async function connect(): Promise<string> {
  const p = provider();
  if (!p) throw new Error("no-wallet");
  const r = await p.connect();
  return r.publicKey.toBase58();
}

export async function airdrop(address: string) {
  const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
  const c = new Connection(RPC, "confirmed");
  const sig = await c.requestAirdrop(new PublicKey(address), LAMPORTS_PER_SOL / 2);
  await c.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function recordListen(address: string, contentId: string, seconds: number) {
  const { Connection, PublicKey, Transaction, TransactionInstruction } = await import("@solana/web3.js");
  const p = provider();
  if (!p) throw new Error("no-wallet");
  const c = new Connection(RPC, "confirmed");
  const payer = new PublicKey(address);
  const memo = JSON.stringify({ app: "ondalyr", v: 1, id: contentId, s: Math.round(seconds) });
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey(MEMO),
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      data: new TextEncoder().encode(memo) as unknown as Buffer,
    }),
  );
  tx.feePayer = payer;
  tx.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
  const signed = await p.signTransaction(tx);
  const sig = await c.sendRawTransaction(signed.serialize());
  await c.confirmTransaction(sig, "confirmed");
  return sig;
}
