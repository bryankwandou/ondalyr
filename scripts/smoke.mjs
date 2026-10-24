// Browser checks against a running build: node scripts/smoke.mjs [baseUrl]
// Saves screenshots to docs/shots so the report can show what was checked.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const base = process.argv[2] || "http://localhost:3000";
const out = new URL("../docs/shots/", import.meta.url);
mkdirSync(out, { recursive: true });

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, String(e.message || e).split("\n")[0]]); }
  console.log(results.at(-1).join("  "));
};
// fileURLToPath decodes %20, so paths with spaces land in the real folder.
const at = (n) => fileURLToPath(new URL(n, out));
const shot = (p, n) => p.screenshot({ path: at(n) });

// html/body use overflow-x: clip, so scrollWidth no longer shows a too-wide layout.
// Count elements past the right edge instead, skipping ones inside their own scroll
// strip and the decorative cover stack that is clipped on purpose.
const overflowing = (p) => p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => {
  if (e.getBoundingClientRect().right <= innerWidth + 1 || e.closest(".hero-visual")) return false;
  for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
    if (getComputedStyle(a).overflowX !== "visible") return false;
  }
  return true;
}).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`).slice(0, 5));

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, recordVideo: label === "desktop" ? { dir: fileURLToPath(new URL("../docs/video/", import.meta.url)), size: viewport } : undefined });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));

  await check(`${label}: landing renders hero`, async () => {
    await p.goto(base, { waitUntil: "networkidle" });
    await p.getByRole("heading", { level: 1 }).waitFor();
    await shot(p, `${label}-landing.png`);
  });
  await check(`${label}: landing fits the viewport`, async () => {
    const over = await overflowing(p);
    if (over.length) throw new Error(`past the right edge: ${over.join(", ")}`);
  });
  await check(`${label}: alignment demo reacts to the slider`, async () => {
    await p.locator("#how").scrollIntoViewIfNeeded();
    const before = await p.locator(".found strong").textContent();
    await p.locator(".align-demo input[type=range]").fill("60");
    await p.waitForTimeout(400);
    const after = await p.locator(".found strong").textContent();
    if (before === after) throw new Error(`offset stayed ${after}`);
    await p.locator("#how").screenshot({ path: at(`${label}-align.png`) });
  });
  await check(`${label}: cost demo updates`, async () => {
    await p.locator("#cost").scrollIntoViewIfNeeded();
    await p.locator(".cost-demo input[type=range]").fill("8");
    await p.waitForTimeout(400);
    const n = await p.locator(".cost-facts dt").first().textContent();
    if (n !== "34") throw new Error(`expected 34 requests, got ${n}`);
    await p.locator("#cost").screenshot({ path: at(`${label}-cost.png`) });
  });
  await check(`${label}: language switch to Indonesian`, async () => {
    await p.locator(".l-nav .lang button", { hasText: "ID" }).click();
    await p.getByText("menemukan tempatnya").first().waitFor();
    await p.locator(".l-nav .lang button", { hasText: "EN" }).click();
  });

  await check(`${label}: player fits the viewport`, async () => {
    await p.goto(`${base}/listen`, { waitUntil: "domcontentloaded" });
    await p.locator(".row").first().waitFor({ timeout: 20000 });
    const over = await overflowing(p);
    if (over.length) throw new Error(`past the right edge: ${over.join(", ")}`);
  });
  // Search a song LRCLIB is known to have, so the lyrics check can't pass on an empty panel.
  await check(`${label}: searched song plays`, async () => {
    await p.locator(".searchbar input").fill("Coldplay Yellow");
    await p.locator(".row", { hasText: "Yellow" }).first().waitFor({ timeout: 20000 });
    await p.locator(".row", { hasText: "Yellow" }).first().click();
    // The desktop context also records video, which slows startup; allow for it.
    await p.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => !v.paused && v.currentTime > 1), null, { timeout: 40000 });
  });
  await check(`${label}: lyric lines appear for the playing song`, async () => {
    await p.locator(".lyrics .line").first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(4000);
    await shot(p, `${label}-player.png`);
  });
  await check(`${label}: orbwave mode draws`, async () => {
    await p.getByRole("tab", { name: "Orbwave" }).click();
    await p.waitForTimeout(1200);
    await shot(p, `${label}-orbwave.png`);
  });
  await check(`${label}: radio list loads`, async () => {
    await p.locator(".nav", { hasText: /radio/i }).first().click();
    await p.locator(".row").first().waitFor({ timeout: 20000 });
    await shot(p, `${label}-radio.png`);
  });
  await check(`${label}: tally batch accepted`, async () => {
    const status = await p.evaluate(async () => {
      const r = await fetch("/api/tally", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: localStorage.getItem("ondalyr.device") || crypto.randomUUID(), rows: [{ id: "s0smoke", kind: "song", s: 3, plays: 1 }] }) });
      return r.status;
    });
    if (status !== 204) throw new Error(`status ${status}`);
  });
  await ctx.close();
}

await check("no uncaught page errors", async () => { if (errors.length) throw new Error(errors.join(" | ")); });
await browser.close();

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
