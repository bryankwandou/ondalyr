// Podcast feeds rarely send CORS headers, so the episode list is read here.
// Only enclosure metadata is returned; the media itself streams from the host.

function pick(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!/^https?:\/\//.test(u)) return new Response("bad url", { status: 400 });
  const r = await fetch(u, { headers: { "user-agent": "Ondalyr/0.1 podcast reader" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return new Response("feed unreachable", { status: 502 });
  const xml = (await r.text()).slice(0, 3_000_000);
  const items = xml.split(/<item[\s>]/i).slice(1, 41);
  const eps = items
    .map((b, i) => {
      const enc = b.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
      if (!enc) return null;
      const type = (enc[0].match(/type="([^"]+)"/i) || [, "audio/mpeg"])[1]!;
      const image = (b.match(/<itunes:image[^>]*href="([^"]+)"/i) || [])[1];
      return { guid: pick(b, "guid") || String(i), title: pick(b, "title"), url: enc[1].replace(/&amp;/g, "&"), type, image };
    })
    .filter((e) => e && e.url.startsWith("https://"));
  return Response.json(eps, { headers: { "cache-control": "public, max-age=600" } });
}
