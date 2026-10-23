"use client";

import { usePlayer } from "./player";

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const I = {
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
  next: <path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z" />,
  prev: <path d="M18 6l-8.5 6L18 18zM6 6h2v12H6z" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{d}</svg>;
}

export function PlayerBar() {
  const p = usePlayer();
  const c = p.current;
  const pct = p.duration ? (p.time / p.duration) * 100 : 0;

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 5;
    if (e.key === "ArrowRight") p.seek(p.time + step);
    else if (e.key === "ArrowLeft") p.seek(p.time - step);
    else if (e.key === "Home") p.seek(0);
    else if (e.key === "End") p.seek(p.duration);
    else return;
    e.preventDefault();
  };

  return (
    <footer className="bar" aria-label="Player">
      <div className="bar-now">
        {c?.art ? <img src={c.art} alt="" /> : <div className="ph" />}
        <div className="bar-meta">
          <strong>{c?.title ?? "—"}</strong>
          <span>{c?.artist ?? ""}</span>
        </div>
      </div>

      <div className="bar-center">
        <div className="bar-ctrls">
          <button className="ib" onClick={p.prev} aria-label={p.t.prev} disabled={!c}><Icon d={I.prev} /></button>
          <button className="ib main" onClick={p.toggle} aria-label={p.playing ? p.t.pause : p.t.play} disabled={!c}>
            <Icon d={p.playing ? I.pause : I.play} />
          </button>
          <button className="ib" onClick={p.next} aria-label={p.t.next} disabled={!c}><Icon d={I.next} /></button>
        </div>
        <div className="bar-seek">
          <span className="num">{c?.live ? p.t.live : fmt(p.time)}</span>
          <div
            className="track"
            role="slider"
            tabIndex={c && !c.live ? 0 : -1}
            aria-label={p.t.seek}
            aria-valuemin={0}
            aria-valuemax={Math.round(p.duration)}
            aria-valuenow={Math.round(p.time)}
            aria-valuetext={`${fmt(p.time)} / ${fmt(p.duration)}`}
            aria-disabled={!c || c.live}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              if (!c || c.live) return;
              const r = e.currentTarget.getBoundingClientRect();
              p.seek(((e.clientX - r.left) / r.width) * p.duration);
            }}
          >
            <div className="fill" style={{ transform: `scaleX(${c?.live ? 1 : pct / 100})` }} />
          </div>
          <span className="num">{c?.live ? "" : fmt(p.duration)}</span>
        </div>
      </div>

      <div className="bar-right">
        <input
          type="range" min={0} max={1} step={0.01} value={p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          aria-label={p.t.volume}
        />
      </div>
    </footer>
  );
}
