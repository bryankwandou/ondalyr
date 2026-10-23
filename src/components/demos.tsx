"use client";

// Landing page demos. Both run entirely in the browser on fixed sample data,
// so they work before anyone presses play.

import { useEffect, useMemo, useRef, useState } from "react";
import { Spectrum } from "./stage";

const LRC = [
  { t: 41.2, text: "I left the porch light on for you" },
  { t: 45.8, text: "the moths were the only ones who knew" },
  { t: 50.1, text: "every car that slowed was not your car" },
  { t: 54.6, text: "so I counted the seconds, not the stars" },
  { t: 59.3, text: "and the kettle sang the night away" },
  { t: 63.9, text: "while I practiced what I'd never say" },
  { t: 68.2, text: "come home, come home, the door is wide" },
  { t: 72.7, text: "there's a chair still warm on the left side" },
];

// What the transcriber "hears" inside the clip, with its own small errors.
function heard(clipStart: number) {
  return LRC.map((l, i) => ({
    at: l.t - clipStart + (i % 3 === 0 ? 0.3 : i % 3 === 1 ? -0.2 : 0.1),
    text: i === 5 ? "while I practised what I never say" : i === 2 ? "every car that slowed was not a car" : l.text,
  })).filter((s) => s.at >= 0 && s.at <= 30);
}

export function AlignDemo({ labels }: { labels: { start: string; votes: string; found: string; tip: string; heard: string } }) {
  const [start, setStart] = useState(47);
  const segs = useMemo(() => heard(start), [start]);
  const votes = segs.map((s) => {
    const line = LRC.find((l) => Math.abs(l.t - start - s.at) < 1);
    return line ? line.t - s.at : null;
  }).filter((v): v is number => v !== null);
  const found = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;

  // Bucket the votes into one-second bins across the song.
  const bins = Array.from({ length: 50 }, (_, i) => votes.filter((v) => Math.floor(v) - 30 === i).length);
  const peak = Math.max(1, ...bins);

  return (
    <div className="demo align-demo">
      <label className="demo-row">
        <span>{labels.start}</span>
        <input type="range" min={30} max={70} step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} />
        <output className="num">{start.toFixed(1)}s</output>
      </label>
      <div className="timeline" aria-hidden="true">
        {LRC.map((l) => (
          <span key={l.t} className="tick" style={{ left: `${((l.t - 30) / 50) * 100}%` }} />
        ))}
        <span className="clip" style={{ left: `${((start - 30) / 50) * 100}%`, width: `${(30 / 50) * 100}%` }} />
      </div>
      <div className="demo-cols">
        <div>
          <p className="demo-k">{labels.heard}</p>
          <ol className="heard">
            {segs.map((s, i) => (
              <li key={`${start}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="num">{s.at.toFixed(1)}s</span> {s.text}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="demo-k">{labels.votes}</p>
          <div className="hist" aria-hidden="true">
            {bins.map((b, i) => <i key={i} style={{ height: `${(b / peak) * 100}%` }} className={b === peak && b > 0 ? "win" : ""} />)}
          </div>
          <p className="found">
            {labels.found} <strong className="num">{found !== null ? `${found.toFixed(2)}s` : "–"}</strong>
          </p>
          <p className="muted small">{labels.tip}</p>
        </div>
      </div>
    </div>
  );
}

// How many requests and rows a listener costs, by hours per day.
export function CostDemo({ labels }: { labels: { hours: string; perSecond: string; ours: string; rows: string; requests: string; note: string } }) {
  const [hours, setHours] = useState(24);
  const naive = hours * 3600;
  const batched = Math.ceil((hours * 60) / 15) + 2;
  // One station all day is one row: seconds are added to it, not appended.
  const rows = 1;
  const max = 24 * 3600;
  return (
    <div className="demo cost-demo">
      <label className="demo-row">
        <span>{labels.hours}</span>
        <input type="range" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        <output className="num">{hours}h</output>
      </label>
      <div className="bars">
        <div className="barline">
          <span>{labels.perSecond}</span>
          <div className="meter"><i style={{ width: `${(naive / max) * 100}%` }} className="bad" /></div>
          <strong className="num">{naive.toLocaleString("en-US")}</strong>
        </div>
        <div className="barline">
          <span>{labels.ours}</span>
          <div className="meter"><i style={{ width: `${Math.max(0.6, (batched / max) * 100)}%` }} /></div>
          <strong className="num">{batched}</strong>
        </div>
      </div>
      <dl className="cost-facts">
        <div><dt className="num">{batched}</dt><dd>{labels.requests}</dd></div>
        <div><dt className="num">{rows}</dt><dd>{labels.rows}</dd></div>
        <div><dt className="num">{(naive / batched).toFixed(0)}×</dt><dd>{labels.note}</dd></div>
      </dl>
    </div>
  );
}

export function StageDemo({ art, labels }: { art?: string; labels: Record<"cover" | "video" | "orbwave", [string, string]> }) {
  const [m, setM] = useState<"cover" | "video" | "orbwave">("orbwave");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const order = ["cover", "video", "orbwave"] as const;
    timer.current = setInterval(() => setM((x) => order[(order.indexOf(x) + 1) % 3]), 3800);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto]);
  return (
    <div className="stage-demo">
      <div className="seg" role="tablist" aria-label="Stage mode">
        {(["cover", "video", "orbwave"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={m === k} className={m === k ? "on" : ""} onClick={() => { setAuto(false); setM(k); }}>
            {labels[k][0]}
          </button>
        ))}
      </div>
      <div className="sd-screen">
        <div className={`sd-layer ${m === "cover" ? "show" : ""}`}>
          {art ? <img src={art} alt="" className="sd-cover" /> : <div className="sd-cover" />}
        </div>
        <div className={`sd-layer ${m === "video" ? "show" : ""}`}>
          <div className="sd-video">
            {art && <img src={art} alt="" />}
            <span className="sd-scan" />
            <span className="sd-time num">0:12 / 0:30</span>
          </div>
        </div>
        <div className={`sd-layer ${m === "orbwave" ? "show" : ""}`}>
          <Spectrum demo art={art} />
        </div>
      </div>
      <p className="sd-cap" key={m}>{labels[m][1]}</p>
    </div>
  );
}

// Fades sections in as they enter the viewport.
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -10% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
