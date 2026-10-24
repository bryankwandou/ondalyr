// Logs what up to 100 radio stations air, around the clock.
//
// Every 45 seconds it opens each stream just long enough to read the first
// ICY metadata block (usually 16 KB of audio, then the title) and closes it.
// Almost every song runs longer than 45 s, so none is missed, at roughly a
// sixtieth of the bandwidth of holding 100 streams open.
//
// Which titles are stored is decided in logTitle: songs by charting artists
// always, the rest only while the database is under budget.
//
//   node --env-file=.env.local scripts/recorder.mts
//
// RUN_MINUTES stops it cleanly so a scheduled job can hand over to the next.
// Only titles are stored. The audio itself is never saved.

import { neon } from "@neondatabase/serverless";
import { nowPlaying } from "../src/lib/icy.ts";
import { BUDGET_BYTES, cleanTitle, logTitle, norm } from "../src/lib/aired.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

const STATIONS = Number(process.env.STATIONS || 100);
const ROUND_MS = 45_000;
const PARALLEL = 20;
const LOG_DAYS = 30;
const RUN_MS = Number(process.env.RUN_MINUTES || 0) * 60_000;
const started = Date.now();
let stopping = false;
if (RUN_MS) setTimeout(() => (stopping = true), RUN_MS);
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Artists on Deezer's overall chart and its 21 genre charts.
async function refreshHits() {
  const genres = (await (await fetch("https://api.deezer.com/editorial")).json()).data as { id: number }[];
  const names = new Set<string>();
  for (const g of genres) {
    for (const kind of ["artists", "tracks"]) {
      const j = await (await fetch(`https://api.deezer.com/chart/${g.id}/${kind}?limit=100`)).json().catch(() => ({ data: [] }));
      for (const x of j.data ?? []) {
        const n = norm(kind === "artists" ? x.name : x.artist?.name ?? "");
        // Two-letter names would match inside unrelated titles.
        if (n.length >= 3) names.add(n);
      }
    }
  }
  if (names.size < 50) throw new Error(`only ${names.size} chart artists, keeping the old list`);
  await sql`delete from hit_artist`;
  await sql`insert into hit_artist (name) select unnest(${[...names]}::text[]) on conflict do nothing`;
  console.log(`hit list: ${names.size} artists`);
}

// Tops the watch list up with the most-clicked HTTPS music stations.
async function seedStations() {
  const [{ n }] = await sql`select count(*)::int as n from radio_watch where has_meta`;
  if (n >= STATIONS) return;
  const tags = ["pop", "hits", "top 40", "dance", "rock", "kpop", "indonesia"];
  const seen = new Map<string, { stationuuid: string; name: string; url_resolved: string; clickcount: number }>();
  for (const tag of tags) {
    const r = await fetch(`https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?order=clickcount&reverse=true&limit=60&hidebroken=true`);
    for (const s of (await r.json()) as { stationuuid: string; name: string; url_resolved: string; clickcount: number; hls: number }[]) {
      if (!s.hls && s.url_resolved.startsWith("https://")) seen.set(s.stationuuid, s);
    }
  }
  // The directory lists some streams several times under different ids.
  const have = new Set(((await sql`select url from radio_watch`) as { url: string }[]).map((r) => r.url));
  const list = [...seen.values()]
    .sort((a, b) => b.clickcount - a.clickcount)
    .filter((s) => !have.has(s.url_resolved) && (have.add(s.url_resolved), true))
    .slice(0, STATIONS * 2);
  await sql`
    insert into radio_watch (station, name, url, seeded, clicks)
    select * from unnest(${list.map((s) => s.stationuuid)}::uuid[], ${list.map((s) => s.name.trim())}::text[],
                         ${list.map((s) => s.url_resolved)}::text[], ${list.map(() => true)}::bool[], ${list.map((s) => s.clickcount)}::int[])
    on conflict (station) do nothing`;
  console.log(`seeded from ${list.length} candidate stations`);
}

type Station = { station: string; name: string; url: string };
const misses = new Map<string, number>();
let written = 0;
let polled = 0;

async function poll(s: Station) {
  const raw = await nowPlaying(s.url, 6000);
  polled++;
  const t = raw && cleanTitle(raw, s.name);
  if (!raw) {
    // Ten silent polls in a row (about 7 minutes) means no titles; stop asking.
    const m = (misses.get(s.station) ?? 0) + 1;
    misses.set(s.station, m);
    if (m >= 10) await sql`update radio_watch set has_meta = false where station = ${s.station}::uuid`;
    return;
  }
  misses.delete(s.station);
  if (t && (await logTitle(sql, s.station, t))) {
    written++;
    console.log(new Date().toISOString().slice(11, 19), s.name, "|", t);
  }
}

async function round() {
  // People's own picks first, then the seeded stations by popularity.
  const list = (await sql`
    select station, name, url from radio_watch where has_meta
    order by seeded, last_requested desc, clicks desc limit ${STATIONS}`) as Station[];
  for (let i = 0; i < list.length; i += PARALLEL) {
    await Promise.all(list.slice(i, i + PARALLEL).map((s) => poll(s).catch((e) => console.error(s.name, e.message))));
  }
  return list.length;
}

await refreshHits().catch((e) => console.error("hits", e.message));
await seedStations().catch((e) => console.error("seed", e.message));
await sql`delete from aired where at < now() - make_interval(days => ${LOG_DAYS})`;

let lastHits = Date.now();
let lastReport = 0;
while (!stopping) {
  const t0 = Date.now();
  const n = await round().catch((e) => { console.error("round", e.message); return 0; });
  if (Date.now() - lastHits > 24 * 3600_000) {
    await refreshHits().catch((e) => console.error("hits", e.message));
    await seedStations().catch((e) => console.error("seed", e.message));
    lastHits = Date.now();
  }
  if (Date.now() - lastReport > 10 * 60_000) {
    const [r] = await sql`
      select pg_database_size(current_database())::bigint as bytes,
             (select count(*) from song)::int as songs, (select count(*) from song where hit)::int as hits,
             (select count(*) from aired)::int as airings`;
    const mb = Number(r.bytes) / 1048576;
    console.log(`[status] ${n} stations, ${r.songs} songs (${r.hits} hits), ${r.airings} airings, ` +
      `${mb.toFixed(1)} MB of ${BUDGET_BYTES / 1048576} MB budget, non-hits ${mb * 1048576 < BUDGET_BYTES ? "on" : "off"}`);
    lastReport = Date.now();
  }
  await sleep(Math.max(1000, ROUND_MS - (Date.now() - t0)));
}
console.log(`stopped after ${Math.round((Date.now() - started) / 60_000)} min, ${polled} polls, ${written} airings written`);
process.exit(0);
