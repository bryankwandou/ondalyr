// Synced lyrics from LRCLIB, re-timed against the clip actually playing.
//
// iTunes previews are 30-second excerpts that start mid-song, so LRC times
// (measured from the start of the full track) never line up on their own.
// /api/align transcribes the clip with Whisper and returns the offset that
// best matches transcript words to LRC lines.

export interface Line {
  t: number;
  text: string;
}

export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const s of stamps) out.push({ t: Number(s[1]) * 60 + Number(s[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface Lyrics {
  lines: Line[];
  synced: boolean;
}

export async function fetchLyrics(artist: string, title: string, album?: string, duration?: number): Promise<Lyrics | null> {
  const p = new URLSearchParams({ artist_name: artist, track_name: title });
  if (album) p.set("album_name", album);
  if (duration) p.set("duration", String(duration));
  let r = await fetch(`https://lrclib.net/api/get?${p}`);
  if (!r.ok) {
    // Album names often differ between catalogues; fall back to a looser search.
    r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ artist_name: artist, track_name: title })}`);
    if (!r.ok) return null;
    const list = (await r.json()) as { syncedLyrics?: string; plainLyrics?: string }[];
    const hit = list.find((x) => x.syncedLyrics) || list[0];
    if (!hit) return null;
    return toLyrics(hit);
  }
  return toLyrics(await r.json());
}

function toLyrics(j: { syncedLyrics?: string | null; plainLyrics?: string | null }): Lyrics | null {
  if (j.syncedLyrics) return { lines: parseLrc(j.syncedLyrics), synced: true };
  if (j.plainLyrics) return { lines: j.plainLyrics.split("\n").map((text) => ({ t: -1, text })), synced: false };
  return null;
}

export function activeIndex(lines: Line[], t: number) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].t <= t) i = k;
    else break;
  }
  return i;
}
