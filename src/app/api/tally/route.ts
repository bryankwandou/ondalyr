// Receives batched listening time from the browser and folds it into one row
// per device, item and day. Rows grow with what people play, not with how long
// they play it, so a radio left on all week is still seven rows.

import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

// A batch covers at most one flush window plus slack; anything larger is a
// replayed or forged payload and gets clipped rather than trusted.
const MAX_SECONDS_PER_ROW = 20 * 60;
const MAX_ROWS = 50;
// Podcast ids embed feed guids, which are often URLs.
const ID = /^[srvep]\S{1,199}$/;
const KINDS = new Set(["song", "video", "radio", "podcast"]);

interface Row { id: string; kind: string; s: number; plays: number }

export async function POST(req: Request) {
  const url = process.env.DATABASE_URL;
  if (!url) return new Response(null, { status: 204 });

  let body: { device?: string; rows?: Row[] };
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const device = String(body.device || "");
  if (!/^[0-9a-f-]{36}$/.test(device)) return new Response("bad device", { status: 400 });

  const rows = (body.rows || [])
    .slice(0, MAX_ROWS)
    .filter((r) => ID.test(String(r.id)) && KINDS.has(r.kind))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      s: Math.max(0, Math.min(MAX_SECONDS_PER_ROW, Math.round(Number(r.s) || 0))),
      plays: Math.max(0, Math.min(50, Math.round(Number(r.plays) || 0))),
    }))
    .filter((r) => r.s > 0 || r.plays > 0);
  if (!rows.length) return new Response(null, { status: 204 });

  const sql = neon(url);
  // One statement for the whole batch: unnest the arrays into rows and upsert.
  await sql`
    insert into listen_day (device, item, kind, day, seconds, plays)
    select ${device}::uuid, i, k, current_date, s, p
    from unnest(${rows.map((r) => r.id)}::text[], ${rows.map((r) => r.kind)}::text[],
                ${rows.map((r) => r.s)}::int[], ${rows.map((r) => r.plays)}::int[]) as t(i, k, s, p)
    on conflict (device, item, day) do update
      set seconds = least(listen_day.seconds + excluded.seconds, 86400),
          plays = listen_day.plays + excluded.plays`;
  return new Response(null, { status: 204 });
}

// Most-heard items across everyone today. The CDN serves this for five
// minutes, so page views do not reach the database.
export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ items: [] });
  const sql = neon(url);
  const items = await sql`
    select item, kind, sum(seconds)::int as seconds, count(distinct device)::int as listeners
    from listen_day where day >= current_date - 6
    group by item, kind order by seconds desc limit 20`;
  return Response.json({ items }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
