"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "./player";
import { loadEpisodes, searchPodcasts, searchRadio, searchSongs, searchVideos, type Item, type Show } from "@/lib/sources";
import { airdrop, connect, recordListen } from "@/lib/solana";

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setErr(false);
    fn().then((d) => live && setData(d)).catch(() => live && setErr(true));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, err };
}

function Rows({ items }: { items: Item[] }) {
  const { playList, current, playing } = usePlayer();
  return (
    <ol className="rows">
      {items.map((it, i) => {
        const on = current?.id === it.id;
        return (
          <li key={it.id}>
            <button className={on ? "row on" : "row"} onClick={() => playList(items, i)} aria-current={on ? "true" : undefined}>
              <span className="row-n num">{on && playing ? <span className="eq" aria-hidden="true"><i /><i /><i /></span> : i + 1}</span>
              {it.art ? <img src={it.art} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="row-meta">
                <strong>{it.title}</strong>
                <span>{it.artist}</span>
              </span>
              {it.live && <span className="live-dot" aria-label="live" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Tiles({ items }: { items: Item[] }) {
  const { playList } = usePlayer();
  return (
    <div className="tiles">
      {items.map((it, i) => (
        <button key={it.id} className="tile" onClick={() => playList(items, i)}>
          <span className="tile-art">{it.art ? <img src={it.art} alt="" loading="lazy" /> : null}</span>
          <strong>{it.title}</strong>
          <span>{it.artist}</span>
        </button>
      ))}
    </div>
  );
}

function State({ err, loading }: { err: boolean; loading: boolean }) {
  const { t } = usePlayer();
  if (err) return <p className="muted pad">{t.loadFailed}</p>;
  if (loading) return <div className="skeleton" aria-busy="true"><i /><i /><i /><i /></div>;
  return null;
}

export function MusicView({ q }: { q: string }) {
  const { t } = usePlayer();
  const term = q || "top hits 2026";
  const songs = useLoad(() => searchSongs(term), [term]);
  return (
    <div className="view">
      <h2>{q ? `“${q}”` : t.trending}</h2>
      <State err={songs.err} loading={!songs.data} />
      {songs.data && <Tiles items={songs.data.slice(0, 6)} />}
      {songs.data && <Rows items={songs.data} />}
    </div>
  );
}

export function VideoView({ q }: { q: string }) {
  const { t } = usePlayer();
  const term = q || "pop";
  const vids = useLoad(() => searchVideos(term), [term]);
  return (
    <div className="view">
      <h2>{t.videos}</h2>
      <State err={vids.err} loading={!vids.data} />
      {vids.data && <Tiles items={vids.data} />}
    </div>
  );
}

export function RadioView({ q }: { q: string }) {
  const { t } = usePlayer();
  const st = useLoad(() => searchRadio(q), [q]);
  return (
    <div className="view">
      <h2>{t.stations}</h2>
      <State err={st.err} loading={!st.data} />
      {st.data && <Rows items={st.data} />}
    </div>
  );
}

export function PodcastView({ q }: { q: string }) {
  const { t } = usePlayer();
  const term = q || "technology";
  const shows = useLoad(() => searchPodcasts(term), [term]);
  const [open, setOpen] = useState<Show | null>(null);
  const eps = useLoad(() => (open ? loadEpisodes(open) : Promise.resolve([] as Item[])), [open?.id]);

  if (open) {
    return (
      <div className="view">
        <button className="link" onClick={() => setOpen(null)}>← {t.back}</button>
        <div className="show-head">
          <img src={open.art} alt="" />
          <div><h2>{open.title}</h2><p className="muted">{open.author}</p></div>
        </div>
        <h3>{t.episodes}</h3>
        <State err={eps.err} loading={!eps.data} />
        {eps.data && <Rows items={eps.data} />}
      </div>
    );
  }
  return (
    <div className="view">
      <h2>{t.shows}</h2>
      <State err={shows.err} loading={!shows.data} />
      <div className="tiles">
        {shows.data?.map((s) => (
          <button key={s.id} className="tile" onClick={() => setOpen(s)}>
            <span className="tile-art"><img src={s.art} alt="" loading="lazy" /></span>
            <strong>{s.title}</strong>
            <span>{s.author}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Receipt { sig: string; title: string; seconds: number }

export function LedgerView() {
  const { t, current, listened } = usePlayer();
  const [addr, setAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    try { setReceipts(JSON.parse(localStorage.getItem("ondalyr.receipts") || "[]")); } catch {}
  }, []);

  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label);
    setMsg("");
    try { await f(); } catch (e) {
      const m = (e as Error).message;
      setMsg(m === "no-wallet" ? t.noWallet : m.slice(0, 160));
    } finally { setBusy(""); }
  };

  return (
    <div className="view">
      <h2>{t.ledger}</h2>
      <p className="muted lede">{t.ledgerIntro}</p>
      <div className="ledger-actions">
        {!addr ? (
          <button className="btn primary" disabled={!!busy} onClick={() => run("c", async () => setAddr(await connect()))}>{t.connect}</button>
        ) : (
          <>
            <span className="addr num">{t.connected}: {addr.slice(0, 4)}…{addr.slice(-4)}</span>
            <button className="btn" disabled={!!busy} onClick={() => run("a", async () => { const s = await airdrop(addr); setMsg(`airdrop ${s.slice(0, 10)}…`); })}>{t.airdrop}</button>
            <button
              className="btn primary"
              disabled={!!busy || !current}
              onClick={() => run("r", async () => {
                const sig = await recordListen(addr, current!.id, listened);
                const next = [{ sig, title: current!.title, seconds: listened }, ...receipts].slice(0, 30);
                setReceipts(next);
                try { localStorage.setItem("ondalyr.receipts", JSON.stringify(next)); } catch {}
                setMsg(t.recorded);
              })}
            >
              {t.record}{current ? ` · ${listened}s` : ""}
            </button>
          </>
        )}
      </div>
      {busy && <p className="muted">…</p>}
      {msg && <p className="note-inline" role="status">{msg}</p>}
      <ol className="receipts">
        {receipts.map((r) => (
          <li key={r.sig}>
            <span>{r.title}</span>
            <span className="num">{r.seconds}s</span>
            <a href={`https://explorer.solana.com/tx/${r.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="num">{r.sig.slice(0, 8)}…</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
