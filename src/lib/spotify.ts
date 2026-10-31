// Whole mainstream songs through the listener's own Spotify Premium account.
//
// Login is the PKCE flow, done entirely in the browser, so no client secret
// exists anywhere. Playback goes through the Web Playback SDK, which turns this
// tab into a Spotify Connect device. Spotify streams the audio under its own
// licence; Ondalyr never sees or stores it.
//
// Development Mode (Feb 2026 rules): the app owner needs Premium, at most five
// listed users, and search returns at most 10 results per page.

import type { Item } from "./sources";

const CLIENT = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
export const spotifyEnabled = CLIENT.length > 0;

const SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
const KEY = "ondalyr.spotify";
const API = "https://api.spotify.com/v1";

type Tokens = { access: string; refresh: string; exp: number };

const redirect = () => `${location.origin}/listen`;

function b64url(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function saved(): Tokens | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function save(j: { access_token: string; refresh_token?: string; expires_in: number }, old?: Tokens | null) {
  const t: Tokens = { access: j.access_token, refresh: j.refresh_token || old?.refresh || "", exp: Date.now() + j.expires_in * 1000 };
  localStorage.setItem(KEY, JSON.stringify(t));
  return t;
}

export const spotifyLinked = () => spotifyEnabled && !!saved();

export function spotifyLogout() {
  localStorage.removeItem(KEY);
}

export async function spotifyLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem("ondalyr.pkce", JSON.stringify({ verifier, state }));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    response_type: "code", client_id: CLIENT, scope: SCOPES, redirect_uri: redirect(),
    code_challenge_method: "S256", code_challenge: challenge, state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${q}`);
}

async function tokenCall(body: Record<string, string>) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT, ...body }),
  });
  if (!r.ok) throw new Error(`spotify token ${r.status}`);
  return r.json();
}

// Called once on /listen load: trades ?code= for tokens and cleans the URL.
// Returns an error string when Spotify sent the listener back with one.
export async function spotifyFinishLogin(): Promise<string | null> {
  const u = new URL(location.href);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  const state = u.searchParams.get("state");
  if (!code && !err) return null;
  const pkce = JSON.parse(sessionStorage.getItem("ondalyr.pkce") || "null") as { verifier: string; state: string } | null;
  sessionStorage.removeItem("ondalyr.pkce");
  ["code", "state", "error"].forEach((k) => u.searchParams.delete(k));
  history.replaceState(null, "", u.pathname + u.search + u.hash);
  if (err) return err;
  if (!pkce || pkce.state !== state) return "state";
  save(await tokenCall({ grant_type: "authorization_code", code: code!, redirect_uri: redirect(), code_verifier: pkce.verifier }));
  return null;
}

export async function spotifyToken(): Promise<string> {
  const t = saved();
  if (!t) throw new Error("spotify-login");
  if (t.exp - 60_000 > Date.now()) return t.access;
  try {
    return save(await tokenCall({ grant_type: "refresh_token", refresh_token: t.refresh }), t).access;
  } catch {
    spotifyLogout();
    throw new Error("spotify-login");
  }
}

export async function spotifyApi(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await spotifyToken()}`, "content-type": "application/json", ...init.headers },
  });
  if (r.status === 401) spotifyLogout();
  if (!r.ok) throw new Error(`spotify ${r.status}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

interface SpTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

// Two pages of ten, the most Development Mode allows per request.
export async function searchSpotify(term: string): Promise<Item[]> {
  const q = encodeURIComponent(term || "year:2026");
  const pages = await Promise.all([0, 10].map((o) => spotifyApi(`/search?type=track&limit=10&offset=${o}&q=${q}`)));
  const seen = new Set<string>();
  return pages
    .flatMap((p) => (p?.tracks?.items ?? []) as SpTrack[])
    .filter((t) => t && !seen.has(t.id) && (seen.add(t.id), true))
    .map((t) => ({
      id: `sp${t.id}`,
      kind: "song",
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.album.name,
      art: t.album.images[0]?.url || "",
      src: "",
      spotify: t.uri,
      analysable: false,
      hasVideo: false,
      live: false,
      preview: false,
      durationSec: Math.round(t.duration_ms / 1000),
    }));
}

let sdk: Promise<void> | null = null;
export function loadSpotifySdk(): Promise<void> {
  if (sdk) return sdk;
  sdk = new Promise((resolve) => {
    (window as unknown as { onSpotifyWebPlaybackSDKReady: () => void }).onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    document.head.append(s);
  });
  return sdk;
}

// The subset of the SDK this app touches.
export interface SpState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { uri: string; linked_from?: { uri: string | null } } };
}
export interface SpPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(ev: string, cb: (x: never) => void): void;
  getCurrentState(): Promise<SpState | null>;
  togglePlay(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
}
export function newSpotifyPlayer(volume: number): SpPlayer {
  const P = (window as unknown as { Spotify: { Player: new (o: object) => SpPlayer } }).Spotify.Player;
  return new P({
    name: "Ondalyr",
    volume,
    getOAuthToken: (cb: (t: string) => void) => { spotifyToken().then(cb).catch(() => {}); },
  });
}
