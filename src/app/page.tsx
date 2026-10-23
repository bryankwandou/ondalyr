"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spectrum } from "@/components/stage";
import { AlignDemo, CostDemo, StageDemo, useReveal } from "@/components/demos";
import { Logo } from "@/components/logo";

const copy = {
  en: {
    nav: [["how", "How it lines up"], ["stage", "The stage"], ["cost", "Running cost"], ["ledger", "Ledger"], ["faq", "Questions"]],
    open: "Open the player",
    tag: "Songs, music videos, live radio and podcasts in one browser tab",
    h1a: "Lyrics that",
    h1b: "find their place",
    h1c: "in the song.",
    sub: "Most previews start somewhere in the middle of a track, so the synced lyrics are wrong from the first word. Ondalyr listens to the clip, works out where it sits, and moves the lyrics to match.",
    cta: "Start listening",
    cta2: "See how it works",
    stats: [["4", "kinds of media"], ["24/7", "live radio"], ["72", "spectrum bands"], ["0", "accounts needed"]],
    how: "How the lyrics line up",
    howSub: "Drag the clip. The transcript changes, every matching phrase casts a vote for an offset, and the tallest column wins.",
    steps: [
      ["Fetch", "Timed lyrics come from LRCLIB, measured against the full song."],
      ["Listen", "Whisper transcribes the 30-second clip with a timestamp on each phrase."],
      ["Vote", "Phrases that match a lyric line vote for an offset. Weak matches are thrown out instead of guessed."],
    ],
    alignLabels: { start: "Clip starts at", votes: "Votes per second of offset", found: "Offset found:", tip: "Two phrases were misheard on purpose. They still land in the right column, because the vote only needs most words to agree.", heard: "What the transcriber heard" },
    stageH: "Three ways to watch a song",
    stageSub: "Switch at any time without stopping playback. The choice is remembered for next time.",
    stageLabels: {
      cover: ["Cover", "The artwork, large, with the room tinted by its colours."],
      video: ["Video", "Music videos and video podcasts play right on the stage."],
      orbwave: ["Orbwave", "A ring of 72 mirrored bands, drawn from the audio you are hearing."],
    } as Record<"cover" | "video" | "orbwave", [string, string]>,
    sources: "What plays",
    src: [
      ["Songs", "30-second previews from the iTunes catalogue, with synced lyrics"],
      ["Music videos", "Video previews, with lyrics alongside the picture"],
      ["Live radio", "Stations from the open Radio Browser directory"],
      ["Podcasts", "Any public feed, audio or video episodes"],
    ],
    costH: "Built to be left on all day",
    costSub: "Listening time is counted to the second in your browser and sent in one small batch every fifteen minutes, or when you close the tab. The server adds it to a single row per item per day.",
    costLabels: { hours: "Hours of listening a day", perSecond: "One write per second", ours: "Ondalyr batches", rows: "database row per station per day", requests: "requests a day, at most", note: "fewer writes" },
    chain: "Listen receipts on Solana devnet",
    chainBody: "Connect a wallet and sign a Memo transaction holding the track id and the seconds you actually heard. It is devnet only, so no real money moves.",
    chainSteps: ["Connect Phantom or Solflare", "Request free devnet SOL", "Sign the receipt and open it in Explorer"],
    faqH: "Questions",
    faq: [
      ["Do I need an account?", "No. Playback, lyrics and stats work without signing in. A wallet is only needed for devnet receipts."],
      ["Why only 30 seconds of a song?", "Full tracks need licences. Ondalyr plays the official previews and links to the full song where it lives."],
      ["What happens when lyrics cannot be lined up?", "The lyrics show unsynced instead of guessing. A wrong offset is worse than none."],
      ["Does it store my listening history?", "Your browser keeps the exact counts. The server only keeps daily totals tied to a random device id, never a name or email."],
    ],
    foot: "Previews and streams belong to their owners. Ondalyr links to them and does not host them.",
  },
  id: {
    nav: [["how", "Cara kerja"], ["stage", "Panggung"], ["cost", "Biaya"], ["ledger", "Ledger"], ["faq", "Tanya jawab"]],
    open: "Buka pemutar",
    tag: "Lagu, video musik, radio live, dan podcast dalam satu tab browser",
    h1a: "Lirik yang",
    h1b: "menemukan tempatnya",
    h1c: "di dalam lagu.",
    sub: "Kebanyakan cuplikan dimulai di tengah lagu, jadi lirik bersinkron sudah meleset sejak kata pertama. Ondalyr mendengarkan cuplikan itu, mencari posisinya, lalu menggeser liriknya agar pas.",
    cta: "Mulai mendengar",
    cta2: "Lihat cara kerjanya",
    stats: [["4", "jenis media"], ["24/7", "radio live"], ["72", "pita spektrum"], ["0", "akun yang perlu dibuat"]],
    how: "Cara lirik diselaraskan",
    howSub: "Geser cuplikannya. Transkripnya berubah, setiap frasa yang cocok memberi suara untuk satu selisih waktu, dan kolom tertinggi yang menang.",
    steps: [
      ["Ambil", "Lirik bersinkron diambil dari LRCLIB, dengan waktu dari lagu penuh."],
      ["Dengar", "Whisper mentranskripsi cuplikan 30 detik, lengkap dengan waktu tiap frasa."],
      ["Pilih", "Frasa yang cocok dengan baris lirik memberi suara. Kecocokan lemah dibuang, tidak ditebak."],
    ],
    alignLabels: { start: "Cuplikan mulai di", votes: "Suara per detik selisih", found: "Selisih ditemukan:", tip: "Dua frasa sengaja salah dengar. Keduanya tetap jatuh di kolom yang benar, karena cukup sebagian besar kata yang cocok.", heard: "Yang didengar transkriptor" },
    stageH: "Tiga cara menonton lagu",
    stageSub: "Ganti kapan saja tanpa menghentikan lagu. Pilihan Anda diingat untuk lain kali.",
    stageLabels: {
      cover: ["Sampul", "Sampul album berukuran besar, dengan ruang yang diwarnai olehnya."],
      video: ["Video", "Video musik dan podcast video diputar langsung di panggung."],
      orbwave: ["Orbwave", "Cincin 72 pita bercermin, digambar dari audio yang sedang Anda dengar."],
    } as Record<"cover" | "video" | "orbwave", [string, string]>,
    sources: "Apa yang bisa diputar",
    src: [
      ["Lagu", "Cuplikan 30 detik dari katalog iTunes, dengan lirik bersinkron"],
      ["Video musik", "Cuplikan video, dengan lirik di samping gambar"],
      ["Radio live", "Stasiun dari direktori terbuka Radio Browser"],
      ["Podcast", "Feed publik apa pun, episode audio atau video"],
    ],
    costH: "Dibuat untuk menyala seharian",
    costSub: "Waktu dengar dihitung per detik di browser Anda, lalu dikirim dalam satu paket kecil setiap lima belas menit atau saat tab ditutup. Server menambahkannya ke satu baris per item per hari.",
    costLabels: { hours: "Jam mendengar per hari", perSecond: "Satu tulis per detik", ours: "Paket Ondalyr", rows: "baris database per stasiun per hari", requests: "permintaan sehari, paling banyak", note: "lebih sedikit penulisan" },
    chain: "Bukti dengar di Solana devnet",
    chainBody: "Hubungkan dompet dan tanda tangani transaksi Memo berisi id lagu dan detik yang benar-benar Anda dengar. Hanya devnet, jadi tidak ada uang sungguhan yang berpindah.",
    chainSteps: ["Hubungkan Phantom atau Solflare", "Minta SOL devnet gratis", "Tanda tangani bukti dan buka di Explorer"],
    faqH: "Tanya jawab",
    faq: [
      ["Perlu akun?", "Tidak. Pemutar, lirik, dan statistik jalan tanpa masuk. Dompet hanya perlu untuk bukti di devnet."],
      ["Kenapa lagu hanya 30 detik?", "Lagu penuh butuh lisensi. Ondalyr memutar cuplikan resmi dan menautkan ke lagu penuhnya."],
      ["Bagaimana jika lirik tidak bisa diselaraskan?", "Lirik ditampilkan tanpa sinkron, tidak ditebak. Selisih yang salah lebih buruk daripada tanpa selisih."],
      ["Apakah riwayat dengar saya disimpan?", "Browser Anda menyimpan hitungan persisnya. Server hanya menyimpan total harian dengan id perangkat acak, tanpa nama atau email."],
    ],
    foot: "Cuplikan dan siaran adalah milik pemiliknya. Ondalyr menautkannya dan tidak menyimpannya.",
  },
};

export default function Landing() {
  const [lang, setLang] = useState<"en" | "id">("en");
  const [arts, setArts] = useState<string[]>([]);
  const c = copy[lang];
  useReveal();

  useEffect(() => {
    try {
      const s = localStorage.getItem("ondalyr.lang");
      if (s === "en" || s === "id") setLang(s);
      else if (navigator.language.toLowerCase().startsWith("id")) setLang("id");
    } catch {}
    fetch("https://itunes.apple.com/search?media=music&entity=album&limit=8&term=indie")
      .then((r) => r.json())
      .then((j) => setArts(j.results.map((a: { artworkUrl100: string }) => a.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb."))))
      .catch(() => {});
  }, []);

  const pick = (l: "en" | "id") => {
    setLang(l);
    try { localStorage.setItem("ondalyr.lang", l); } catch {}
  };

  return (
    <div className="landing" lang={lang}>
      <header className="l-nav">
        <Link href="/" className="brand-row" aria-label="Ondalyr home"><Logo /><span className="brand">ondalyr</span></Link>
        <nav className="anchors" aria-label="Sections">
          {c.nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <div className="nav-right">
          <div className="lang" role="group" aria-label="Language">
            {(["en", "id"] as const).map((l) => (
              <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => pick(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <Link href="/listen" className="btn primary small">{c.open}</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{c.tag}</p>
          <h1>{c.h1a} <em>{c.h1b}</em> {c.h1c}</h1>
          <p className="sub">{c.sub}</p>
          <div className="hero-ctas">
            <Link href="/listen" className="btn primary big">{c.cta}</Link>
            <a href="#how" className="btn big ghost">{c.cta2}</a>
          </div>
          <dl className="stats">
            {c.stats.map(([n, l]) => <div key={l}><dt className="num">{n}</dt><dd>{l}</dd></div>)}
          </dl>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="stack">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="card3d" style={{ "--i": i } as React.CSSProperties}>
                {arts[i] ? <img src={arts[i]} alt="" /> : null}
              </div>
            ))}
          </div>
          <div className="hero-orb"><Spectrum demo art={arts[3]} /></div>
        </div>
      </section>

      <section id="how" className="band" data-reveal>
        <h2>{c.how}</h2>
        <p className="band-sub">{c.howSub}</p>
        <ol className="steps">
          {c.steps.map(([h, b], i) => (
            <li key={h}><span className="num">0{i + 1}</span><h3>{h}</h3><p>{b}</p></li>
          ))}
        </ol>
        <AlignDemo labels={c.alignLabels} />
      </section>

      <section id="stage" className="band split" data-reveal>
        <div>
          <h2>{c.stageH}</h2>
          <p className="band-sub">{c.stageSub}</p>
          <h3 className="mini">{c.sources}</h3>
          <dl className="srcs">
            {c.src.map(([h, b]) => (<div key={h}><dt>{h}</dt><dd>{b}</dd></div>))}
          </dl>
        </div>
        <StageDemo art={arts[1]} labels={c.stageLabels} />
      </section>

      <section id="cost" className="band" data-reveal>
        <h2>{c.costH}</h2>
        <p className="band-sub">{c.costSub}</p>
        <CostDemo labels={c.costLabels} />
      </section>

      <section id="ledger" className="band split" data-reveal>
        <div>
          <h2>{c.chain}</h2>
          <p className="band-sub">{c.chainBody}</p>
          <Link href="/listen" className="btn primary">{c.open}</Link>
        </div>
        <ol className="chain-steps">
          {c.chainSteps.map((s, i) => <li key={s}><span className="num">{i + 1}</span>{s}</li>)}
        </ol>
      </section>

      <section id="faq" className="band" data-reveal>
        <h2>{c.faqH}</h2>
        <div className="faq">
          {c.faq.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <footer className="l-foot">
        <div className="brand-row"><Logo size={22} /><span className="brand">ondalyr</span></div>
        <p>{c.foot}</p>
      </footer>
    </div>
  );
}
