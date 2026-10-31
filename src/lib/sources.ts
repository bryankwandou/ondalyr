// Every playable thing in Ondalyr reduces to one Item shape, whatever its source.

export type Kind = "song" | "video" | "radio" | "podcast";

export interface Item {
  id: string;
  kind: Kind;
  title: string;
  artist: string;
  album?: string;
  art: string;
  src: string;
  // Same-origin (proxied) sources can feed the spectrum analyser. Cross-origin
  // streams without CORS would be muted by Web Audio, so they play raw.
  analysable: boolean;
  hasVideo: boolean;
  live: boolean;
  // A preview is a 30-second excerpt that starts mid-song; its lyrics need re-timing.
  preview?: boolean;
  // Spotify track URI; played through the listener's Premium account, not src.
  spotify?: string;
  durationSec?: number;
}

const ITUNES = "https://itunes.apple.com/search";

function bigArt(url: string) {
  return url ? url.replace(/\/\d+x\d+bb\./, "/600x600bb.") : "";
}

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

export async function searchSongs(term: string): Promise<Item[]> {
  const r = await fetch(`${ITUNES}?media=music&entity=song&limit=24&term=${encodeURIComponent(term)}`);
  const j = (await r.json()) as { results: ITunesTrack[] };
  return j.results
    .filter((t) => t.previewUrl)
    .map((t) => ({
      id: `s${t.trackId}`,
      kind: "song",
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName,
      art: bigArt(t.artworkUrl100),
      src: `/api/media?u=${encodeURIComponent(t.previewUrl!)}`,
      analysable: true,
      hasVideo: false,
      live: false,
      preview: true,
      durationSec: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : undefined,
    }));
}

// Audius streams whole tracks that artists uploaded themselves, free and
// without a key. Both the API redirect and the content node send
// Access-Control-Allow-Origin: *, so the analyser can read them directly.
const AUDIUS = "https://api.audius.co/v1";
const APP = "app_name=ondalyr";

interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  is_streamable: boolean;
  artwork?: Record<string, string> | null;
  user: { name: string; is_deactivated?: boolean };
}

export async function searchFull(term: string): Promise<Item[]> {
  const url = term
    ? `${AUDIUS}/tracks/search?query=${encodeURIComponent(term)}&limit=30&${APP}`
    : `${AUDIUS}/tracks/trending?limit=30&${APP}`;
  const r = await fetch(url);
  const j = (await r.json()) as { data: AudiusTrack[] };
  return j.data
    .filter((t) => t.is_streamable && !t.user.is_deactivated)
    .map((t) => ({
      id: `sa${t.id}`,
      kind: "song",
      title: t.title,
      artist: t.user.name,
      art: t.artwork?.["480x480"] || "",
      src: `${AUDIUS}/tracks/${t.id}/stream?${APP}`,
      analysable: true,
      hasVideo: false,
      live: false,
      preview: false,
      durationSec: t.duration,
    }));
}

export async function searchVideos(term: string): Promise<Item[]> {
  const r = await fetch(`${ITUNES}?media=musicVideo&limit=18&term=${encodeURIComponent(term)}`);
  const j = (await r.json()) as { results: ITunesTrack[] };
  return j.results
    .filter((t) => t.previewUrl)
    .map((t) => ({
      id: `v${t.trackId}`,
      kind: "video",
      title: t.trackName,
      artist: t.artistName,
      art: bigArt(t.artworkUrl100),
      src: t.previewUrl!,
      analysable: false,
      hasVideo: true,
      live: false,
    }));
}

interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  country: string;
  tags: string;
  hls: number;
}

const RADIO = "https://de1.api.radio-browser.info/json/stations";

export async function searchRadio(term: string): Promise<Item[]> {
  const q = term
    ? `${RADIO}/search?name=${encodeURIComponent(term)}&limit=30&hidebroken=true&order=clickcount&reverse=true`
    : `${RADIO}/topclick/30?hidebroken=true`;
  const r = await fetch(q);
  const j = (await r.json()) as Station[];
  return j
    // HLS needs a player library; https-only avoids mixed-content blocking.
    .filter((s) => !s.hls && s.url_resolved.startsWith("https://"))
    .map((s) => ({
      id: `r${s.stationuuid}`,
      kind: "radio",
      title: s.name.trim(),
      artist: [s.country, s.tags.split(",")[0]].filter(Boolean).join(" · "),
      art: s.favicon,
      src: s.url_resolved,
      analysable: false,
      hasVideo: false,
      live: true,
    }));
}

export interface Show {
  id: string;
  title: string;
  author: string;
  art: string;
  feed: string;
}

export async function searchPodcasts(term: string): Promise<Show[]> {
  const r = await fetch(`${ITUNES}?media=podcast&limit=18&term=${encodeURIComponent(term)}`);
  const j = (await r.json()) as {
    results: { collectionId: number; collectionName: string; artistName: string; artworkUrl600?: string; artworkUrl100: string; feedUrl?: string }[];
  };
  return j.results
    .filter((p) => p.feedUrl)
    .map((p) => ({
      id: `p${p.collectionId}`,
      title: p.collectionName,
      author: p.artistName,
      art: p.artworkUrl600 || bigArt(p.artworkUrl100),
      feed: p.feedUrl!,
    }));
}

export async function loadEpisodes(show: Show): Promise<Item[]> {
  const r = await fetch(`/api/rss?u=${encodeURIComponent(show.feed)}`);
  if (!r.ok) throw new Error("feed");
  const eps = (await r.json()) as { guid: string; title: string; url: string; type: string; image?: string }[];
  return eps.map((e) => ({
    id: `e${show.id}-${e.guid}`,
    kind: "podcast",
    title: e.title,
    artist: show.title,
    art: e.image || show.art,
    src: e.url,
    analysable: false,
    hasVideo: e.type.startsWith("video"),
    live: false,
  }));
}
