"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/sources";
import { dict, type Dict, type Lang } from "@/lib/i18n";
import { fetchLyrics, type Lyrics } from "@/lib/lyrics";
import { countPlay, countSeconds } from "@/lib/tally";

export type StageMode = "cover" | "video" | "orbwave";
type LyricState = { status: "idle" | "loading" | "none" | "ready"; data?: Lyrics; offset: number; align: "none" | "pending" | "done" | "failed" };

interface Ctx {
  t: Dict;
  lang: Lang;
  setLang(l: Lang): void;
  queue: Item[];
  index: number;
  current: Item | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  error: boolean;
  mode: StageMode;
  setMode(m: StageMode): void;
  lyrics: LyricState;
  playList(list: Item[], at: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(s: number): void;
  setVolume(v: number): void;
  media(): HTMLVideoElement | null;
  bands(out: Uint8Array): boolean;
  listened: number;
}

const PlayerCtx = createContext<Ctx | null>(null);

export function usePlayer() {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayer outside provider");
  return c;
}

function makeEl(analysed: boolean) {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  if (analysed) v.crossOrigin = "anonymous";
  v.className = "media-el";
  return v;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [queue, setQueue] = useState<Item[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVol] = useState(0.9);
  const [error, setError] = useState(false);
  const [mode, setModeState] = useState<StageMode>("cover");
  const [lyrics, setLyrics] = useState<LyricState>({ status: "idle", offset: 0, align: "none" });
  const [listened, setListened] = useState(0);

  const els = useRef<{ analysed: HTMLVideoElement; raw: HTMLVideoElement } | null>(null);
  const audio = useRef<{ ctx: AudioContext; an: AnalyserNode } | null>(null);
  const current = index >= 0 ? queue[index] ?? null : null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ondalyr.lang") as Lang | null;
      if (saved === "en" || saved === "id") setLangState(saved);
      else if (navigator.language.toLowerCase().startsWith("id")) setLangState("id");
      const m = localStorage.getItem("ondalyr.mode") as StageMode | null;
      if (m === "cover" || m === "video" || m === "orbwave") setModeState(m);
    } catch {}
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("ondalyr.lang", l); } catch {}
  };
  const setMode = (m: StageMode) => {
    setModeState(m);
    try { localStorage.setItem("ondalyr.mode", m); } catch {}
  };

  const getEls = useCallback(() => {
    if (!els.current) {
      const holder = document.getElementById("media-holder")!;
      const analysed = makeEl(true);
      const raw = makeEl(false);
      holder.append(analysed, raw);
      els.current = { analysed, raw };
    }
    return els.current;
  }, []);

  const active = useCallback((): HTMLVideoElement | null => {
    if (!els.current || !current) return null;
    return current.analysable ? els.current.analysed : els.current.raw;
  }, [current]);

  // Web Audio graph is built lazily, inside a user gesture, on the analysed element only.
  const ensureGraph = useCallback(() => {
    if (audio.current) {
      if (audio.current.ctx.state === "suspended") audio.current.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.78;
    const src = ctx.createMediaElementSource(getEls().analysed);
    src.connect(an);
    an.connect(ctx.destination);
    audio.current = { ctx, an };
  }, [getEls]);

  // Load the current item into its element and start it.
  useEffect(() => {
    if (!current) return;
    const { analysed, raw } = getEls();
    const el = current.analysable ? analysed : raw;
    const other = el === analysed ? raw : analysed;
    other.pause();
    other.removeAttribute("src");
    other.load();
    setError(false);
    setTime(0);
    setDuration(0);
    setListened(0);
    el.src = current.src;
    el.volume = volume;
    el.play().catch(() => setPlaying(false));

    const on = (e: string, f: () => void) => el.addEventListener(e, f);
    const handlers: [string, () => void][] = [
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["timeupdate", () => setTime(el.currentTime)],
      ["durationchange", () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)],
      ["error", () => { setError(true); setPlaying(false); }],
      ["ended", () => setIndex((i) => (i + 1 < queue.length ? i + 1 : i))],
    ];
    handlers.forEach(([e, f]) => on(e, f));

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album || "",
        artwork: current.art ? [{ src: current.art, sizes: "600x600" }] : [],
      });
    }
    return () => handlers.forEach(([e, f]) => el.removeEventListener(e, f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Seconds actually heard, for the devnet receipt.
  useEffect(() => {
    if (current) countPlay(current.id, current.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  useEffect(() => {
    if (!playing || !current) return;
    const { id: item, kind } = current;
    const id = setInterval(() => {
      setListened((s) => s + 1);
      countSeconds(item, kind, 1);
    }, 1000);
    return () => clearInterval(id);
  }, [playing, current]);

  // Lyrics: songs and music videos only.
  useEffect(() => {
    if (!current || (current.kind !== "song" && current.kind !== "video")) {
      setLyrics({ status: "idle", offset: 0, align: "none" });
      return;
    }
    let cancelled = false;
    setLyrics({ status: "loading", offset: 0, align: "none" });
    fetchLyrics(current.artist, current.title, current.album, current.durationSec)
      .then(async (data) => {
        if (cancelled) return;
        if (!data) return setLyrics({ status: "none", offset: 0, align: "none" });
        const canAlign = data.synced && current.kind === "song";
        setLyrics({ status: "ready", data, offset: 0, align: canAlign ? "pending" : "none" });
        if (!canAlign) return;
        const url = new URL(current.src, location.href).searchParams.get("u");
        const r = await fetch("/api/align", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, lines: data.lines.filter((l) => l.text).slice(0, 120) }),
        }).then((x) => x.json()).catch(() => ({ offset: null }));
        if (cancelled) return;
        setLyrics((s) => ({ ...s, offset: typeof r.offset === "number" ? r.offset : 0, align: typeof r.offset === "number" ? "done" : "failed" }));
      })
      .catch(() => !cancelled && setLyrics({ status: "none", offset: 0, align: "none" }));
    return () => { cancelled = true; };
  }, [current]);

  const playList = useCallback((list: Item[], at: number) => {
    getEls();
    if (list[at]?.analysable) ensureGraph();
    setQueue(list);
    setIndex(at);
    if (list[at]?.hasVideo) setModeState("video");
    else setModeState((m) => (m === "video" ? "cover" : m));
  }, [ensureGraph, getEls]);

  const toggle = useCallback(() => {
    const el = active();
    if (!el) return;
    if (current?.analysable) ensureGraph();
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, [active, current, ensureGraph]);

  const next = useCallback(() => setIndex((i) => (i + 1 < queue.length ? i + 1 : i)), [queue.length]);
  const prev = useCallback(() => {
    const el = active();
    if (el && el.currentTime > 3) el.currentTime = 0;
    else setIndex((i) => Math.max(0, i - 1));
  }, [active]);
  const seek = useCallback((s: number) => {
    const el = active();
    if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration, s));
  }, [active]);
  const setVolume = useCallback((v: number) => {
    setVol(v);
    if (els.current) { els.current.analysed.volume = v; els.current.raw.volume = v; }
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", toggle);
    ms.setActionHandler("pause", toggle);
    ms.setActionHandler("nexttrack", next);
    ms.setActionHandler("previoustrack", prev);
  }, [toggle, next, prev]);

  const bands = useCallback((out: Uint8Array) => {
    if (!audio.current || !current?.analysable || !playing) return false;
    audio.current.an.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    return true;
  }, [current, playing]);

  const value = useMemo<Ctx>(() => ({
    t: dict[lang], lang, setLang, queue, index, current, playing, time, duration, volume, error,
    mode, setMode, lyrics, playList, toggle, next, prev, seek, setVolume, media: active, bands, listened,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang, queue, index, current, playing, time, duration, volume, error, mode, lyrics, playList, toggle, next, prev, seek, setVolume, active, bands, listened]);

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      <div id="media-holder" aria-hidden="true" className="media-holder" />
    </PlayerCtx.Provider>
  );
}
