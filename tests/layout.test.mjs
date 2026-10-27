// Layout check: can a player see what's happening? Runs the real page in WebKit (Playwright from
// ~/.claude/tools) at iPhone, iPhone SE, phone-sideways and two laptop sizes, with a full 4-card trick
// on the table, won piles with point cards, and a 13-card hand. Checks, per size:
//  - trick cards are big enough (width floor per size) and inside the felt;
//  - no trick card covers any seat's name plate, bid/points line, won pile or held cards;
//  - every trick card's corner index (rank + suit) is on top, not hidden under another trick card;
//  - all 13 cards in your hand show their rank and suit;
//  - seat text sizes meet the floor; Hearts point cards are big enough to tell apart;
//  - no page scroll in either direction.
// Usage: node tests/layout.test.mjs   (needs Playwright installed in ~/.claude/tools; ENGINE=chromium for Chrome)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(homedir(), ".claude/tools/package.json"));
const pw = require("playwright");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  try { const d = await readFile(join(ROOT, p)); res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// tw: trick card width floor; sub: seat bid/points text floor; pw: Hearts point card width floor
const SIZES = {
  phone: { ctx: { ...pw.devices["iPhone 15"], viewport: { width: 393, height: 659 } }, tw: 72, sub: 12, pw: 24 },
  se: { ctx: { ...pw.devices["iPhone SE"], viewport: { width: 320, height: 568 } }, tw: 52, sub: 12, pw: 22 },
  land: { ctx: { ...pw.devices["iPhone 15"], viewport: { width: 659, height: 393 } }, tw: 50, sub: 12, pw: 22 },
  laptop: { ctx: { viewport: { width: 1280, height: 800 } }, tw: 100, sub: 15, pw: 34 },
  wide: { ctx: { viewport: { width: 1440, height: 900 } }, tw: 110, sub: 15, pw: 36 },
};

// Deal, then play the engine forward (first legal card each turn) to trick `upto`, and show the trick
// just finished as a full 4-card cross, the way the table shows it before it's swept to the winner.
const SETUP = (kind, upto) => `(() => { const U = ${kind === "hearts" ? "HeartsUI" : "SpadesUI"}, E = ${kind === "hearts" ? "Hearts" : "Spades"}, S = U.state; let g = S.game;
  for (let i = 0; i < 400 && g.hand.phase !== "done"; i++) { const h = g.hand;
    if (h.phase === "pass") { for (let s=0;s<4;s++) if(!h.passes[s]) g = E.apply(g,{type:"pass",seat:s,cards:h.hands[s].slice(0,3)}); continue; }
    if (h.phase === "bid") { g = E.apply(g,{type:"bid",seat:h.bidTurn,bid:3}); continue; }
    if (h.phase !== "play") break;
    if (h.trickNo >= ${upto} && h.trick.length === 0) break;
    g = E.apply(g,{type:"play",seat:h.turn,card:E.legal(h,h.turn)[0]}); }
  S.game = g; S.cpuPending = null; S.busy = true; S.collecting = false; S.showTrick = g.hand.lastTrick;
  if (U === HeartsUI) S.moon = { seat: 2, chance: 0.34 }; else S.make = { bid: 0.54, nil: [0, 0, 0, 0] };   // the corner chip
  U.render(); return g.hand.trickNo; })()`;

// For the 13-card check: a fresh deal, nothing played.
const MEASURE = `(() => {
  const v = document.querySelector(".view.active"), R = (e) => e.getBoundingClientRect();
  const hit = (a, b, m = 2) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
  const out = { errs: [] };
  const felt = R(v.querySelector(".felt"));
  const slots = [...v.querySelectorAll(".trick .slot")];
  out.slots = slots.length;
  out.tw = slots.length ? Math.min(...slots.map((s) => s.offsetWidth)) : 0;
  const seatParts = [...v.querySelectorAll(".seat .plate, .seat .seat-sub, .seat .won, .seat .wpts, .seat .ofan-wrap, .seat .passpile")];
  for (const s of slots) {
    const r = R(s.querySelector(".pc"));
    if (r.left < felt.left - 1 || r.right > felt.right + 1 || r.top < felt.top - 1 || r.bottom > felt.bottom + 1) out.errs.push(s.className + " outside felt");
    for (const p of seatParts) if (hit(r, R(p))) out.errs.push(s.className + " covers " + p.className + " of seat " + p.closest(".seat").className);
    // the corner index: rank text and the suit under it
    const txt = s.querySelector("svg text"), pip = txt && txt.nextElementSibling;
    for (const e of [txt, pip]) { if (!e) continue; const q = R(e), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      if (!t || !s.contains(t)) out.errs.push(s.className + " index hidden under " + (t && t.closest(".slot") ? t.closest(".slot").className : t && (t.className.baseVal ?? t.className))); }
  }
  // the moon-risk / make-our-bid chip must not sit on a trick card's corner index
  const chip = v.querySelector(".moon"); out.chip = !!chip;
  if (chip) for (const s of slots) { const txt = s.querySelector("svg text"); if (txt && hit(R(chip), R(txt), 0)) out.errs.push("chip covers index of " + s.className); }
  const sub = v.querySelector(".seat-sub"); out.sub = sub ? parseFloat(getComputedStyle(sub).fontSize) : 0;
  const wp = v.querySelector(".wpts .wp"); out.pw = wp && wp.offsetParent ? wp.offsetWidth : null;
  out.ox = document.documentElement.scrollWidth > innerWidth + 1; out.oy = document.documentElement.scrollHeight > innerHeight + 1;
  return out; })()`;
const HAND = `(() => { const v = document.querySelector(".view.active"), bad = [];
  const cards = [...v.querySelectorAll(".hand .hc")];
  for (const c of cards) { const txt = c.querySelector("svg text"), pip = txt && txt.nextElementSibling;
    for (const e of [txt, pip]) { const q = e.getBoundingClientRect(), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      if (!t || !c.contains(t)) bad.push(c.dataset.card); } }
  return { n: cards.length, bad: [...new Set(bad)] }; })()`;

let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) pass++; else { fail++; console.log("FAIL " + name + (info ? "\n  " + info : "")); } };

const browser = await pw[process.env.ENGINE || "webkit"].launch({ headless: true });   // ENGINE=chromium for Chrome
for (const [size, cfg] of Object.entries(SIZES)) {
  for (const kind of ["hearts", "spades"]) {
    const ctx = await browser.newContext(cfg.ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem("heartsSpades:v1", JSON.stringify({ hearts: { speed: "fast" }, spades: {} })); localStorage.setItem("fx:hearts-spades", JSON.stringify({ animations: false, sound: false })); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message)));
    await page.goto(BASE + "#" + kind, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector(".view.active [data-act=deal]").click());
    await page.waitForTimeout(1200);
    const hand = await page.evaluate(HAND);
    check(`${size} ${kind}: 13-card hand shows every rank and suit`, hand.n === 13 && !hand.bad.length, `${hand.n} cards, hidden: ${hand.bad.join(",")}`);
    if (kind === "hearts") {   // passing: 3 neighbouring cards picked (lifted) must still show their corners
      await page.evaluate(() => { const S = HeartsUI.state; S.sel = new Set(S.game.hand.hands[0].slice(5, 8)); HeartsUI.render(); });
      await page.waitForTimeout(300);
      const sel = await page.evaluate(HAND);
      check(`${size} hearts: 3 picked cards + the rest all show rank and suit`, sel.n === 13 && !sel.bad.length, `hidden: ${sel.bad.join(",")}`);
    }
    for (const upto of [3, 9]) {
      await page.evaluate(SETUP(kind, upto));
      await page.waitForTimeout(250);
      const m = await page.evaluate(MEASURE);
      const id = `${size} ${kind} trick ${upto}`;
      check(`${id}: full trick shown`, m.slots === 4, `${m.slots} slots`);
      check(`${id}: corner chip shown`, m.chip, "no .moon chip");
      check(`${id}: trick cards >= ${cfg.tw}px`, m.tw >= cfg.tw, `tw ${m.tw}`);
      check(`${id}: trick clear of seats, indexes on top`, !m.errs.length, m.errs.join("\n  "));
      check(`${id}: seat line >= ${cfg.sub}px`, m.sub >= cfg.sub, `sub ${m.sub}`);
      if (kind === "hearts" && m.pw != null) check(`${id}: point cards >= ${cfg.pw}px`, m.pw >= cfg.pw, `pw ${m.pw}`);
      check(`${id}: no page scroll`, !m.ox && !m.oy, JSON.stringify({ ox: m.ox, oy: m.oy }));
    }
    check(`${size} ${kind}: no page errors`, !errs.length, errs.join(" | "));
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`layout.test.mjs: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
