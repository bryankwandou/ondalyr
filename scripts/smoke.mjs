// Browser checks against a running build: node scripts/smoke.mjs [baseUrl]
// Saves screenshots to docs/shots so the report can show what was checked.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const base = process.argv[2] || "http://localhost:3000";
const out = new URL("../docs/shots/", import.meta.url);
mkdirSync(out, { recursive: true });

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, String(e.message || e).split("\n")[0]]); }
};
const shot = (p, n) => p.screenshot({ path: new URL(n, out).pathname.replace(/^\/(\w:)/, "$1") });

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, recordVideo: label === "desktop" ? { dir: new URL("../docs/video/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), size: viewport } : undefined });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));

  await check(`${label}: landing renders hero`, async () => {
    await p.goto(base, { waitUntil: "networkidle" });
    await p.getByRole("heading", { level: 1 }).waitFor();
    await shot(p, `${label}-landing.png`);
  });
  await check(`${label}: no horizontal scroll`, async () => {
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) throw new Error(`overflow ${over}px`);
  });
  await check(`${label}: alignment demo reacts to the slider`, async () => {
    await p.locator("#how").scrollIntoViewIfNeeded();
    const before = await p.locator(".found strong").textContent();
    await p.locator(".align-demo input[type=range]").fill("60");
    await p.waitForTimeout(400);
    const after = await p.locator(".found strong").textContent();
    if (before === after) throw new Error(`offset stayed ${after}`);
    await p.locator("#how").screenshot({ path: new URL(`${label}-align.png`, out).pathname.replace(/^\/(\w:)/, "$1") });
  });
  await check(`${label}: cost demo updates`, async () => {
    await p.locator("#cost").scrollIntoViewIfNeeded();
    await p.locator(".cost-demo input[type=range]").fill("8");
    await p.waitForTimeout(400);
    const n = await p.locator(".cost-facts dt").first().textContent();
    if (n !== "34") throw new Error(`expected 34 requests, got ${n}`);
    await p.locator("#cost").screenshot({ path: new URL(`${label}-cost.png`, out).pathname.replace(/^\/(\w:)/, "$1") });
  });
  await check(`${label}: language switch to Indonesian`, async () => {
    await p.locator(".l-nav .lang button", { hasText: "ID" }).click();
    await p.getByText("menemukan tempatnya").first().waitFor();
    await p.locator(".l-nav .lang button", { hasText: "EN" }).click();
  });

  await check(`${label}: player loads songs and plays one`, async () => {
    await p.goto(`${base}/listen`, { waitUntil: "domcontentloaded" });
    await p.locator(".row").first().waitFor({ timeout: 20000 });
    await p.locator(".row").first().click();
    await p.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => !v.paused && v.currentTime > 1), null, { timeout: 20000 });
    await p.waitForTimeout(2500);
    await shot(p, `${label}-player.png`);
  });
  await check(`${label}: lyrics appear for the playing song`, async () => {
    await p.locator(".lyrics").first().waitFor({ timeout: 15000 });
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
