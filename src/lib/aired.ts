// Shared by the /api/aired route and the 24/7 recorder, so both apply the same
// rules for what counts as a song and what gets stored.

import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

// Songs by charting artists are always kept. Everything else is kept only while
// the database is below this size; Neon's free tier stops at 512 MB.
export const BUDGET_BYTES = 350 * 1024 * 1024;

const FILLER = /^(more (songs|music)|up next|coming (up|next)|commercial|advert|station id|jingle|news\b|tracklist|kontakt|now playing info)|livestream|="|https?:|www\./i;
const DOMAIN = /\b[\w-]+\.(com|net|org|fm|ru|de|online|radio|co|uk|io)\b/i;
const compact = (s: string) => norm(s).replace(/ /g, "");

// Lowercase, accents dropped, punctuation to single spaces. Keeps non-Latin
// letters so Korean or Japanese titles still match chart names.
export function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Returns "Artist - Title" style text, or null for what is not a song. Every
// rule below comes from a real station in the first recorder run: the station's
// own name, ads and fillers, URLs, numeric catalogue ids, "+"-encoded titles.
export function cleanTitle(raw: string, station: string): string | null {
  // Some stations prefix the artist with a byte-order mark or zero-width space.
  let title = raw.replace(/[​-‍﻿]/g, "").replace(/^\s*(now playing|on air|playing)\s*[:\-]\s*/i, "").trim();
  if (!title.includes(" ") && title.includes("+")) title = title.replace(/\+/g, " ");
  // "… - Classic Vinyl on walmradio.com": drop a trailing segment that is a plug.
  title = title.replace(/\s+-\s+[^-]*\b[\w-]+\.(com|net|org|fm)\b[^-]*$/i, "").replace(/\s*-\s*$/, "").trim();
  // "KissFM - Artist - Song": drop a leading segment that is the station.
  const segs = title.split(" - ");
  if (segs.length > 2 && compact(segs[0]) === compact(station)) title = segs.slice(1).join(" - ");

  if (FILLER.test(title) || DOMAIN.test(title)) return null;
  if (!/\p{L}/u.test(title)) return null;
  if (compact(title) === compact(station)) return null;
  // A song names both artist and title; a bare phrase is a slogan or a show.
  const parts = title.split(" - ");
  const by = / by /i.test(title);
  if (parts.length < 2 && !by) return null;
  if (parts.length === 2 && compact(parts[0]) === compact(parts[1])) return null;
  // "*** Bayern 3 - Bayerns Hitradio Nummer 1 …" is the station's slogan.
  if (parts.length === 2 && compact(parts[0]) === compact(station)) return null;
  if (parts.length >= 2 && parts.some((p) => !/\p{L}/u.test(p))) return null;
  return title;
}

// Every name that could be an artist in the title. Stations disagree on order
// ("Artist - Song" vs "Song - Artist" vs "Song by Artist"), so each side is
// tried, split on the usual separators. A chart artist must equal one of these
// exactly; matching inside the text would turn "Rain Or Shine" into a hit.
export function artistCandidates(title: string): string[] {
  const sides = title.split(" - ");
  const by = / by (.+)$/i.exec(title);
  if (by) sides.push(by[1]);
  const out = new Set<string>();
  for (const side of sides) {
    out.add(norm(side));
    for (const p of side.split(/,|&|\/|;|\s(?:feat\.?|ft\.?|featuring|with|and|x|vs\.?)\s/i)) {
      const n = norm(p);
      if (n.length >= 3) out.add(n);
    }
  }
  return [...out];
}

// One statement: skip if it repeats the station's previous song, decide `hit`
// against the chart artists, drop non-hits once over budget, upsert the song
// and append the airing. Returns whether a row was written.
export async function logTitle(sql: Sql, station: string, title: string): Promise<boolean> {
  const key = norm(title);
  const rows = await sql`
    with prev as (
      select s.key from aired a join song s on s.id = a.song
      where a.station = ${station}::uuid order by a.at desc limit 1
    ), meta as (
      select exists (select 1 from hit_artist where name = any(${artistCandidates(title)}::text[])) as hit
    ), up as (
      insert into song (key, title, hit)
      select ${key}, ${title}, meta.hit from meta
      where not exists (select 1 from prev where prev.key = ${key})
        and (meta.hit or pg_database_size(current_database()) < ${BUDGET_BYTES})
      on conflict (key) do update set
        plays = song.plays + 1, last_at = now(), hit = song.hit or excluded.hit,
        stations = song.stations + (not exists (
          select 1 from aired a where a.song = song.id and a.station = ${station}::uuid))::int
      returning id
    )
    insert into aired (station, song) select ${station}::uuid, id from up returning song`;
  return rows.length > 0;
}

export async function history(sql: Sql, station: string) {
  return sql`
    select s.title, s.hit, a.at from aired a join song s on s.id = a.song
    where a.station = ${station}::uuid order by a.at desc limit 30`;
}
