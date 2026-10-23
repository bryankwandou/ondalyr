"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayerProvider, usePlayer } from "./player";
import { PlayerBar } from "./bar";
import { Stage } from "./stage";
import { Logo } from "./logo";
import { LedgerView, MusicView, PodcastView, RadioView, VideoView } from "./views";

type Tab = "music" | "videos" | "radio" | "podcasts" | "ledger";
const TABS: Tab[] = ["music", "videos", "radio", "podcasts", "ledger"];

function Inner() {
  const { t, lang, setLang } = usePlayer();
  const [tab, setTab] = useState<Tab>("music");
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 450);
    return () => clearTimeout(id);
  }, [raw]);

  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <Link href="/" className="brand-row"><Logo size={26} /><span className="brand">ondalyr</span></Link>
        <ul>
          {TABS.map((k) => (
            <li key={k}>
              <button className={tab === k ? "nav on" : "nav"} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
                {t[k]}
              </button>
            </li>
          ))}
        </ul>
        <div className="lang" role="group" aria-label="Language">
          {(["en", "id"] as const).map((l) => (
            <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </nav>

      <main className="content">
        {tab !== "ledger" && (
          <div className="searchbar">
            <input type="search" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.search} />
          </div>
        )}
        {tab === "music" && <MusicView q={q} />}
        {tab === "videos" && <VideoView q={q} />}
        {tab === "radio" && <RadioView q={q} />}
        {tab === "podcasts" && <PodcastView q={q} />}
        {tab === "ledger" && <LedgerView />}
      </main>

      <Stage />
      <PlayerBar />
    </div>
  );
}

export function Shell() {
  return (
    <PlayerProvider>
      <Inner />
    </PlayerProvider>
  );
}
