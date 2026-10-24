// Shoutcast/Icecast stations interleave a metadata block into the audio every
// `icy-metaint` bytes when the request carries `Icy-MetaData: 1`. The block
// holds `StreamTitle='Artist - Song';`, which is what the station says it is
// airing. Used by the edge route (one read) and the recorder (continuous).

export function parseTitle(block: string): string | null {
  const m = /StreamTitle='(.*?)';/s.exec(block);
  const t = m?.[1]?.trim();
  // Some stations send a dash or their own name between songs; neither is a song.
  return t && t !== "-" && t.length < 300 ? t : null;
}

// Calls onTitle for every metadata block until the stream ends or signal aborts.
// Resolves false when the station sends no metadata at all.
export async function readTitles(url: string, onTitle: (t: string) => void, signal: AbortSignal): Promise<boolean> {
  const r = await fetch(url, { headers: { "Icy-MetaData": "1", "User-Agent": "Ondalyr/1.0" }, signal, redirect: "follow" });
  const metaint = Number(r.headers.get("icy-metaint"));
  if (!r.ok || !r.body || !metaint) {
    await r.body?.cancel().catch(() => {});
    return false;
  }
  const reader = r.body.getReader();
  let skip = metaint; // audio bytes left before the next length byte
  let need = -1; // metadata bytes still to collect; -1 means "in audio"
  let meta: number[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      let i = 0;
      while (i < value.length) {
        if (need < 0) {
          const take = Math.min(skip, value.length - i);
          skip -= take;
          i += take;
          if (skip === 0 && i < value.length) {
            need = value[i++] * 16;
            meta = [];
            if (need === 0) { need = -1; skip = metaint; }
          }
        } else {
          const take = Math.min(need, value.length - i);
          for (let k = 0; k < take; k++) meta.push(value[i + k]);
          need -= take;
          i += take;
          if (need === 0) {
            const t = parseTitle(new TextDecoder().decode(new Uint8Array(meta)).replace(/\0+$/, ""));
            if (t) onTitle(t);
            need = -1;
            skip = metaint;
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return true;
}

// First title the station sends, or null within the timeout.
export async function nowPlaying(url: string, timeoutMs = 8000): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let found: string | null = null;
  try {
    await readTitles(url, (t) => { found = t; ac.abort(); }, ac.signal);
  } catch {
    // aborted on purpose once a title arrived, or the station failed
  } finally {
    clearTimeout(timer);
  }
  return found;
}
