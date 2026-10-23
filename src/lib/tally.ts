// Listening time is counted to the second in the browser and sent to the
// server in batches. A full day of nonstop radio costs at most ~96 small
// requests (one per 15 minutes), never one per second.

const KEY = "ondalyr.tally";
const DEVICE = "ondalyr.device";
const FLUSH_EVERY_MS = 15 * 60 * 1000;

interface Pending { [id: string]: { kind: string; s: number; plays: number } }

let pending: Pending = {};
let lastFlush = 0;
let wired = false;

function load() {
  try { pending = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { pending = {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch {}
}

export function deviceId() {
  try {
    let d = localStorage.getItem(DEVICE);
    if (!d) { d = crypto.randomUUID(); localStorage.setItem(DEVICE, d); }
    return d;
  } catch { return "anon"; }
}

export function flush() {
  const rows = Object.entries(pending)
    .filter(([, v]) => v.s > 0 || v.plays > 0)
    .map(([id, v]) => ({ id, kind: v.kind, s: Math.round(v.s), plays: v.plays }));
  if (!rows.length) return;
  const body = JSON.stringify({ device: deviceId(), rows });
  const ok = navigator.sendBeacon?.("/api/tally", new Blob([body], { type: "application/json" }));
  if (!ok) fetch("/api/tally", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  pending = {};
  lastFlush = Date.now();
  save();
}

function wire() {
  if (wired) return;
  wired = true;
  load();
  lastFlush = Date.now();
  // pagehide and a hidden tab are the last moments a browser reliably lets us send.
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

export function countPlay(id: string, kind: string) {
  wire();
  const p = (pending[id] ||= { kind, s: 0, plays: 0 });
  p.plays += 1;
  save();
}

export function countSeconds(id: string, kind: string, s: number) {
  wire();
  const p = (pending[id] ||= { kind, s: 0, plays: 0 });
  p.s += s;
  save();
  if (Date.now() - lastFlush > FLUSH_EVERY_MS) flush();
}
