"use client";

import { useEffect, useRef } from "react";
import { usePlayer, type StageMode } from "./player";
import { Lyrics } from "./lyrics";

// Radial spectrum in the Orbwave style: bands grow outward from a ring around
// the cover, mirrored left/right, with a soft additive glow.
export function Spectrum({ art, demo = false }: { art?: string; demo?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = usePlayerSafe();
  const pRef = useRef(live);
  pRef.current = live;

  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext("2d")!;
    const img = new Image();
    if (art) img.src = art;
    const bins = new Uint8Array(512);
    const N = 72;
    const smooth = new Float32Array(N);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (still && now - last < 500) return;
      last = now;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const player = pRef.current;
      const real = !demo && player ? player.bands(bins) : false;
      const playing = demo || (player?.playing ?? false);
      for (let i = 0; i < N; i++) {
        // Log-ish mapping: low bands get more resolution, like the ear.
        let v: number;
        if (real) {
          const a = Math.floor(Math.pow(i / N, 1.7) * 220) + 2;
          v = bins[a] / 255;
        } else if (playing) {
          const s = now / 1000;
          v = 0.25 + 0.35 * Math.abs(Math.sin(s * 2.1 + i * 0.37) * Math.cos(s * 1.3 + i * 0.11)) * (1 - i / N * 0.6);
        } else v = 0.04;
        smooth[i] += (v - smooth[i]) * (still ? 1 : 0.35);
      }

      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.26;
      const maxLen = Math.min(w, h) * 0.2;
      g.save();
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      g.lineWidth = Math.max(2, (Math.PI * R) / N * 0.55);
      for (let i = 0; i < N; i++) {
        for (const side of [-1, 1]) {
          const ang = -Math.PI / 2 + side * (i + 0.5) * (Math.PI / N);
          const len = 3 + smooth[i] * maxLen;
          const c = Math.cos(ang), s = Math.sin(ang);
          g.strokeStyle = `oklch(${0.72 + smooth[i] * 0.18} ${0.12 + smooth[i] * 0.06} ${70 - i * 0.4} / ${0.55 + smooth[i] * 0.45})`;
          g.beginPath();
          g.moveTo(cx + c * (R + 6), cy + s * (R + 6));
          g.lineTo(cx + c * (R + 6 + len), cy + s * (R + 6 + len));
          g.stroke();
        }
      }
      g.restore();

      const bass = (smooth[0] + smooth[1] + smooth[2]) / 3;
      const r = R * (1 + bass * 0.05);
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.clip();
      if (img.complete && img.naturalWidth) g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      else { g.fillStyle = "oklch(0.25 0.01 70)"; g.fill(); }
      g.restore();
      g.strokeStyle = "oklch(0.85 0.12 75 / 0.6)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, cy, r + 2, 0, Math.PI * 2);
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [art, demo]);

  return <canvas ref={ref} className="spectrum" aria-hidden="true" />;
}

function usePlayerSafe() {
  try { return usePlayer(); } catch { return null; }
}

function VideoSlot() {
  const { media, current } = usePlayer();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = media();
    if (!el || !slot.current) return;
    slot.current.appendChild(el);
    el.classList.add("on-stage");
    return () => {
      el.classList.remove("on-stage");
      document.getElementById("media-holder")?.appendChild(el);
    };
  }, [media, current?.id]);
  return <div ref={slot} className="video-slot" />;
}

export function Stage() {
  const { current, mode, setMode, t, error, onAir } = usePlayer();
  if (!current) {
    return (
      <section className="stage empty" aria-label="Stage">
        <Spectrum demo />
        <p className="stage-hint">{t.nothing}</p>
      </section>
    );
  }
  const modes: StageMode[] = current.hasVideo ? ["cover", "video", "orbwave"] : ["cover", "orbwave"];
  const shown: StageMode = mode === "video" && !current.hasVideo ? "cover" : mode;

  return (
    <section className="stage" aria-label="Stage">
      <div className="stage-backdrop" style={{ backgroundImage: current.art ? `url("${current.art}")` : undefined }} />
      <div className="stage-top">
        <div className="seg" role="tablist" aria-label="Stage mode">
          {modes.map((m) => (
            <button key={m} role="tab" aria-selected={shown === m} className={shown === m ? "on" : ""} onClick={() => setMode(m)}>
              {t[m]}
            </button>
          ))}
        </div>
        {current.live && <span className="live-pill">{t.live}</span>}
        {current.kind === "song" && <span className="meta-pill">{current.preview ? t.preview : t.fullTrack}</span>}
      </div>

      <div className="stage-body">
        <div className="stage-visual">
          {shown === "video" && <VideoSlot />}
          {shown === "cover" && (
            current.art ? <img className="cover-art" src={current.art} alt="" /> : <div className="cover-art placeholder" />
          )}
          {shown === "orbwave" && <Spectrum art={current.art} />}
          {shown === "orbwave" && !current.analysable && <p className="note">{t.simulated}</p>}
          {error && <p className="note warn">{t.loadFailed}</p>}
        </div>
        {(current.kind === "song" || current.kind === "video") && <Lyrics />}
        {current.kind === "radio" && (
          <aside className="lyrics aired" aria-label={t.aired}>
            <p className="lyrics-status">{onAir ? t.airedNote : t.lyricsLoading}</p>
            <div className="lyrics-scroll">
              {onAir && !onAir.history.length && <p className="line">{t.noTitles}</p>}
              {onAir?.history.map((h, k) => (
                <p key={h.at} className={k === 0 && h.title === onAir.now ? "line on" : "line past"}>
                  <span className="num aired-at">{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> {h.title}
                </p>
              ))}
            </div>
          </aside>
        )}
      </div>

      <div className="stage-title">
        <h1>{current.title}</h1>
        <p>{current.kind === "radio" && onAir?.now ? onAir.now : current.artist}</p>
      </div>
    </section>
  );
}
