// Sounds, celebrations and animations (js/game-fx.js on top of the shared js/fx.js).
// Plays real Hearts and Spades hands through the engines, feeds the table snapshots the UI
// would draw into GameFX.observe(), and checks which sounds, celebrations and animations fire.
// Run: node tests/fx.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ---------- fake browser bits (before fx.js loads) ----------
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.matchMedia = () => ({ matches: false });
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = (x) => Object.assign({ connect() {}, disconnect() {} }, x);
let clock = 0;
class FakeAC {
  constructor() { this.sampleRate = 8000; this.state = "running"; this.destination = {}; }
  get currentTime() { return (clock += 1); }   // every play() is far apart, so the throttle never hides a sound
  createGain() { return node({ gain: param() }); }
  createOscillator() { return node({ type: "sine", frequency: param(), start() {}, stop() {} }); }
  createBufferSource() { return node({ buffer: null, start() {}, stop() {} }); }
  createBiquadFilter() { return node({ type: "lowpass", frequency: param(), Q: param() }); }
  createStereoPanner() { return node({ pan: param() }); }
  createDynamicsCompressor() { return node({}); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAC;
const created = [];
const htmlClasses = new Set();
globalThis.document = {
  addEventListener() {}, removeEventListener() {}, getElementById: () => null, head: null,
  documentElement: { classList: { toggle: (c, on) => (on ? htmlClasses.add(c) : htmlClasses.delete(c)), contains: (c) => htmlClasses.has(c) } },
  body: { appendChild() {} },
  createElement: (tag) => { const e = { tag, style: {}, setAttribute() {}, remove() {}, getContext: () => null }; created.push(e); return e; },
};
globalThis.innerWidth = 393; globalThis.innerHeight = 659;
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);

await import("../js/fx.js");
const FX = globalThis.FX;
const C = require("../js/cards.js");
const H = require("../js/hearts.js");
const Sp = require("../js/spades.js");
const GameFX = require("../js/game-fx.js");

// ---------- spies ----------
let played = [], celebrations = [], animated = 0;
const realPlay = FX.play.bind(FX), realCelebrate = FX.celebrate.bind(FX);
FX.play = (name, o) => { const ok = realPlay(name, o); if (ok) played.push(name); return ok; };
FX.celebrate = (o) => { celebrations.push(o.kind); return realCelebrate(o); };
// A fake table: every element it hands out counts calls to animate().
const fakeEl = () => ({
  textContent: "0", isConnected: true, style: {},
  getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 40 }),
  animate() { animated++; const a = { onfinish: null, oncancel: null }; setTimeout(() => a.onfinish && a.onfinish(), 0); return a; },
});
const table = { querySelector: () => fakeEl(), querySelectorAll: () => [fakeEl(), fakeEl()] };
const reset = () => { played = []; celebrations = []; animated = 0; created.length = 0; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (n) => played.filter((x) => x === n).length;

GameFX.init();
FX.unlock();    // stands in for the player's first tap
assert.ok(FX.ready, "fake audio is running");

// ---------- drivers: the same snapshots the table UIs draw ----------
const firstLegal = (list) => list[0];
/** Plays one Hearts hand (no passing) from a fixed deal, first legal card each time. */
async function heartsHand(seed, opts) {
  let g = H.apply(null, { type: "new", opts: Object.assign({ passing: "none" }, opts) });
  g = H.apply(g, { type: "deal", deck: C.shuffle(C.deck(), C.makeRng(seed)) });
  GameFX.observe("hearts", null, table);
  GameFX.observe("hearts", { g, me: 0, dealAnim: true }, table);
  while (g.hand.phase === "play") {
    const h = g.hand, seat = h.turn;
    g = H.apply(g, { type: "play", seat, card: firstLegal(H.legal(h, seat)) });
    if (g.hand.trick.length === 0) {
      GameFX.observe("hearts", { g, me: 0, show: g.hand.lastTrick, busy: true }, table);
      GameFX.observe("hearts", { g, me: 0, show: g.hand.lastTrick, busy: true, collecting: true }, table);
    }
    GameFX.observe("hearts", { g, me: 0 }, table);
  }
  return g;
}

/** Plays one Spades hand with fixed bids, first legal card each time. */
function spadesHand(seed, bids, bagsBefore) {
  let g = Sp.apply(null, { type: "new", opts: { target: 500 } });
  if (bagsBefore) g.bags = bagsBefore.slice();
  g = Sp.apply(g, { type: "deal", deck: C.shuffle(C.deck(), C.makeRng(seed)) });
  GameFX.observe("spades", null, table);
  GameFX.observe("spades", { g, me: 0, dealAnim: true }, table);
  while (g.hand.phase === "bid") {
    const s = g.hand.bidTurn;
    g = Sp.apply(g, { type: "bid", seat: s, bid: bids[s], blind: false });
    GameFX.observe("spades", { g, me: 0 }, table);
  }
  while (g.hand.phase === "play") {
    const h = g.hand, seat = h.turn;
    g = Sp.apply(g, { type: "play", seat, card: firstLegal(Sp.legal(h, seat)) });
    if (g.hand.trick.length === 0) {
      GameFX.observe("spades", { g, me: 0, show: g.hand.lastTrick, busy: true }, table);
      GameFX.observe("spades", { g, me: 0, show: g.hand.lastTrick, busy: true, collecting: true }, table);
    }
    GameFX.observe("spades", { g, me: 0 }, table);
  }
  return g;
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { reset(); await fn(); pass++; console.log("  PASS " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n    " + e.message); }
}

await t("hearts hand: deal, 52 cards, 13 sweeps, hearts broken once, Q♠ thud once, your-turn chime", async () => {
  const g = await heartsHand(7);
  assert.equal(count("shuffle"), 1, "one shuffle at the deal");
  await wait(700);  // deal ticks are spread over the deal animation
  assert.equal(count("cardDeal"), 4, "deal ticks");
  assert.equal(count("cardSlide"), 52, "one slide per card played");
  assert.equal(count("whoosh"), 13, "one sweep per trick");
  assert.equal(count("heartsBroken"), g.hand.heartsBroken ? 1 : 0, "hearts broken sting once");
  assert.equal(count("queenThud"), 1, "the queen of spades is taken once a hand");
  assert.ok(count("turn") >= 1, "your turn chime");
  assert.ok(count("turn") <= 13, "chime only when it becomes your turn");
});

await t("hearts game over: win when you have the lowest score, lose otherwise", async () => {
  // A real finished hand, marked as the game's end with you (seat 0) or Across as the winner.
  const g = await heartsHand(11);
  const done = JSON.parse(JSON.stringify(g));
  const before = { g: JSON.parse(JSON.stringify(g)), me: 0, show: g.hand.lastTrick, busy: true };
  for (const [winners, want] of [[[0], "win"], [[2], "lose"]]) {
    celebrations = [];
    done.over = true; done.winners = winners;
    GameFX.observe("hearts", before, table);
    GameFX.observe("hearts", { g: done, me: 0 }, table);
    await wait(1300);
    assert.deepEqual(celebrations.filter((k) => k !== "big"), [want]);
  }
});

await t("hearts: shooting the moon is a big moment", async () => {
  // A real finished hand with its result set to a moon by seat 0 (first-legal play rarely shoots it).
  const g = await heartsHand(12);
  const before = { g: JSON.parse(JSON.stringify(g)), me: 0, show: g.hand.lastTrick, busy: true };
  const moon = JSON.parse(JSON.stringify(g));
  moon.hand.result = { pts: [0, 26, 26, 26], moonBy: 0, moonHow: "add" };
  reset();
  GameFX.observe("hearts", before, table);
  GameFX.observe("hearts", { g: moon, me: 0 }, table);
  await wait(50);
  assert.ok(celebrations.includes("big"), "big celebration for the moon");
});

await t("spades hand: bids, nil made or set, bags penalty, made or set", async () => {
  const g = spadesHand(21, [0, 1, 1, 1], [9, 9]);
  await wait(1300);
  const h = g.hand, r = h.result;
  assert.equal(count("pop"), 1, "one nil bid");
  assert.equal(count("place"), 3, "three number bids");
  assert.equal(count("cardSlide"), 52);
  assert.equal(count("whoosh"), 13);
  if (h.tricks[0] === 0) assert.ok(celebrations.includes("big"), "nil made = big moment");
  else assert.ok(count("hit") >= 1, "nil set = hit");
  assert.ok(r[0].penalty > 0 || r[1].penalty > 0, "fixture should reach a bag penalty");
  assert.ok(count("explosion") >= 1, "bag penalty sound");
  const madeUs = r[0].parts.some((p) => /^Bid \d+ made/.test(p.label));
  const setAny = r.some((x) => x.parts.some((p) => / set$/.test(p.label)));
  if (madeUs) assert.ok(count("coins") >= 1, "our bid made = coins");
  if (setAny) assert.ok(count("stamp") >= 1, "a set = stamp");
});

await t("spades game over: your team wins = win, else lose", async () => {
  const g = spadesHand(22, [3, 3, 3, 3]);
  const before = { g: JSON.parse(JSON.stringify(g)), me: 0, show: g.hand.lastTrick, busy: true };
  for (const [winner, me, want] of [[0, 0, "win"], [1, 0, "lose"], [1, 1, "win"], [0, 3, "lose"]]) {
    reset();
    const over = JSON.parse(JSON.stringify(g)); over.over = true; over.winner = winner;
    GameFX.observe("spades", Object.assign({}, before, { me }), table);
    GameFX.observe("spades", { g: over, me }, table);
    await wait(1300);
    assert.deepEqual(celebrations.filter((k) => k !== "big"), [want], `winner ${winner}, me ${me}`);
  }
});

await t("animations run when on (cards, sweeps, turn pulse, celebrations)", async () => {
  await heartsHand(7);
  await wait(1300);
  assert.ok(animated > 0, "some animation ran");
});

await t("Sound off: no sound at all; Animations off: no animation, no confetti, CSS switched off", async () => {
  FX.set("sound", false); FX.set("animations", false);
  const statsBefore = FX.stats.plays;
  await heartsHand(7);
  spadesHand(21, [0, 1, 1, 1], [9, 9]);
  await wait(1300);
  assert.equal(played.length, 0, "no sound played");
  assert.equal(FX.stats.plays, statsBefore, "fx.js made no sound");
  assert.equal(animated, 0, "no element animated");
  assert.equal(created.filter((e) => e.tag === "canvas").length, 0, "no confetti canvas");
  assert.ok(htmlClasses.has("fx-noanim"), "the table's own CSS animations are off too");
  assert.equal(GameFX.speed(), 0);
  FX.set("sound", true); FX.set("animations", true);
  assert.ok(!htmlClasses.has("fx-noanim"));
  FX.set("animSpeed", "fast");
  assert.ok(htmlClasses.has("fx-fast")); assert.equal(GameFX.speed(), 0.55);
  FX.set("animSpeed", "normal");
});

await t("Game sounds off mutes cards but keeps the turn chime; illegal tap = soft error + shake", async () => {
  FX.set("moves", false);
  await heartsHand(7);
  assert.equal(count("cardSlide"), 0);
  assert.ok(count("turn") >= 1);
  FX.set("moves", true);
  reset();
  GameFX.illegal(fakeEl());
  assert.deepEqual(played, ["error"]);
  assert.ok(animated >= 1, "the card shakes");
});

await t("restoring a saved game mid-hand makes no sound", async () => {
  await wait(1500); reset();   // let delayed sounds from the earlier tests finish first
  let g = H.apply(null, { type: "new", opts: { passing: "none" } });
  g = H.apply(g, { type: "deal", deck: C.shuffle(C.deck(), C.makeRng(3)) });
  GameFX.observe("hearts", null, table);
  GameFX.observe("hearts", { g, me: 0 }, table);
  GameFX.observe("hearts", { g, me: 0 }, table);
  await wait(50);
  assert.deepEqual(played, []);
});

console.log(`fx.test.mjs: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
