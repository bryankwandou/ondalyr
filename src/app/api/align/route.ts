// Finds where a 30-second preview sits inside the full song, by transcribing
// the clip with Whisper (Groq) and voting on offsets between transcript
// segments and LRC lines. Returns { offset } in seconds, or null when the
// match is too weak to trust (instrumental intros, other languages).

const ALLOWED = /^https:\/\/[a-z0-9-]+\.(itunes\.apple\.com|mzstatic\.com)\//;

function words(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter((w) => w.length > 1);
}

function similarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const hit = a.filter((w) => sb.has(w)).length;
  return hit / Math.max(a.length, b.length);
}

export async function POST(req: Request) {
  const key = (process.env.GROQ_API_KEY || "").replace(/^﻿/, "").trim();
  if (!key) return Response.json({ offset: null, reason: "no-key" });
  const { url, lines } = (await req.json()) as { url: string; lines: { t: number; text: string }[] };
  if (!ALLOWED.test(url) || !Array.isArray(lines)) return new Response("bad input", { status: 400 });

  const audio = await fetch(url);
  if (!audio.ok) return Response.json({ offset: null, reason: "audio" });
  const form = new FormData();
  form.append("file", new Blob([await audio.arrayBuffer()], { type: "audio/mp4" }), "clip.m4a");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) return Response.json({ offset: null, reason: `groq-${r.status}` });
  const j = (await r.json()) as { segments?: { start: number; text: string }[] };

  const votes: { offset: number; w: number }[] = [];
  for (const seg of j.segments || []) {
    const sw = words(seg.text);
    for (const line of lines) {
      const s = similarity(sw, words(line.text));
      if (s >= 0.5) votes.push({ offset: line.t - seg.start, w: s });
    }
  }
  // Cluster votes within 1.5 s and take the heaviest cluster.
  let best = { offset: 0, w: 0 };
  for (const v of votes) {
    const near = votes.filter((x) => Math.abs(x.offset - v.offset) < 1.5);
    const w = near.reduce((a, x) => a + x.w, 0);
    if (w > best.w) best = { offset: near.reduce((a, x) => a + x.offset * x.w, 0) / w, w };
  }
  return Response.json(best.w >= 1 ? { offset: best.offset, confidence: best.w } : { offset: null, reason: "weak" });
}
