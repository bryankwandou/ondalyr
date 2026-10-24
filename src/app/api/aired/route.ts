// Now playing and recent history for one station. Playing a station also adds
// it to radio_watch, which is what the 24/7 recorder listens to.
//
// The stream URL is looked up from Radio Browser by station id on the server,
// never taken from the request, so this route cannot be pointed at other hosts.

import { neon } from "@neondatabase/serverless";
import { nowPlaying } from "@/lib/icy";
import { cleanTitle, history, logTitle } from "@/lib/aired";

export const maxDuration = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return new Response("bad id", { status: 400 });

  const r = await fetch(`https://de1.api.radio-browser.info/json/stations/byuuid/${id}`);
  const [st] = (await r.json().catch(() => [])) as { name: string; url_resolved: string }[];
  if (!st?.url_resolved?.startsWith("https://")) return Response.json({ now: null, history: [] });

  const raw = await nowPlaying(st.url_resolved);
  const now = raw ? cleanTitle(raw, st.name) : null;

  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ now, history: [] });
  const sql = neon(url);
  await sql`
    insert into radio_watch (station, name, url) values (${id}::uuid, ${st.name.trim()}, ${st.url_resolved})
    on conflict (station) do update set last_requested = now(), url = excluded.url, name = excluded.name`;
  if (now) await logTitle(sql, id, now);
  return Response.json({ now, history: await history(sql, id) }, { headers: { "cache-control": "no-store" } });
}
