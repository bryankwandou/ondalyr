"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "./player";
import { activeIndex } from "@/lib/lyrics";

export function Lyrics() {
  const { lyrics, time, t, seek } = usePlayer();
  const box = useRef<HTMLDivElement>(null);
  const lines = lyrics.data?.lines ?? [];
  const songTime = time + lyrics.offset;
  const i = lyrics.data?.synced ? activeIndex(lines, songTime) : -1;

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el || !box.current) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
  }, [i]);

  if (lyrics.status === "loading") return <aside className="lyrics muted">{t.lyricsLoading}</aside>;
  if (lyrics.status !== "ready") return <aside className="lyrics muted">{t.noLyrics}</aside>;

  // Progress through the active line drives a left-to-right fill.
  const cur = lines[i];
  const nxt = lines[i + 1];
  const frac = cur && nxt ? Math.min(1, Math.max(0, (songTime - cur.t) / Math.max(0.5, nxt.t - cur.t))) : 0;

  const status =
    lyrics.align === "pending" ? t.aligning : lyrics.align === "done" ? t.aligned : lyrics.align === "failed" ? t.unaligned : !lyrics.data!.synced ? t.plainLyrics : "";

  return (
    <aside className="lyrics" aria-label={t.lyrics}>
      {status && <p className="lyrics-status">{status}</p>}
      <div className="lyrics-scroll" ref={box}>
        {lines.map((l, k) => (
          <p
            key={k}
            data-i={k}
            className={k === i ? "line on" : k < i ? "line past" : "line"}
            style={k === i ? ({ "--fill": `${frac * 100}%` } as React.CSSProperties) : undefined}
            onClick={lyrics.data!.synced ? () => seek(l.t - lyrics.offset) : undefined}
          >
            {l.text || "♪"}
          </p>
        ))}
      </div>
    </aside>
  );
}
