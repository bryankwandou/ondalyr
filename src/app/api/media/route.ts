// Same-origin relay for iTunes preview audio, so the browser can run a Web
// Audio analyser on it. Restricted to Apple's preview hosts: this is not an
// open proxy.

const ALLOWED = /^https:\/\/(audio-ssl\.itunes\.apple\.com|[a-z0-9-]+\.itunes\.apple\.com|[a-z0-9-]+\.mzstatic\.com)\//;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!ALLOWED.test(u)) return new Response("host not allowed", { status: 400 });
  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers.range = range;
  const up = await fetch(u, { headers });
  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = up.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "public, max-age=86400");
  return new Response(up.body, { status: up.status, headers: out });
}
