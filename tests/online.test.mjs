// Online adapters (js/net-games.js) checked the way _online/README.md asks:
// bot-only games to the end, JSON round-trips, toAct never empty, and no secrets in the public view.
// Also plays both games through the shared createLocal room. Run: node tests/online.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createLocal } from "../js/online.js";
const require = createRequire(import.meta.url);
const NG = require("../js/net-games.js");
const C = require("../js/cards.js");
const H = require("../js/hearts.js");
const Sp = require("../js/spades.js");

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  PASS " + name); } catch (e) { fail++; console.log("  FAIL " + name + "\n    " + e.message); } };

const seatsAll = (kinds) => kinds.map((k, i) => ({ kind: k, name: k === "human" ? "P" + i : "Computer " + (i + 1) }));

function checkSecrets(game, kind, s) {
  const pub = game.publicView(s);
  const js = JSON.stringify(pub);
  const h = s.g.hand;
  if (!h) return;
  // The public hands are always empty; counts match.
  assert.deepEqual(pub.g.hand.hands, [[], [], [], []], "public view has no hands");
  assert.deepEqual(pub.g.hand.counts, h.hands.map((x) => x.length));
  if (kind === "hearts") {
    if (h.phase !== "done") assert.ok(!pub.g.hand.start || pub.g.hand.start.every((x) => x === null), "no starting hands mid-hand");
    for (const p of pub.g.hand.passes || []) assert.ok(p === null || p === true, "passed cards hidden");
    for (const r of pub.g.hand.received || []) assert.equal(r, null, "received cards hidden");
  } else if (h.exchange) {
    assert.ok(!("given" in pub.g.hand.exchange) && !("back" in pub.g.hand.exchange), "swapped cards hidden");
  }
  for (let seat = 0; seat < 4; seat++) {
    const mine = game.privateView(s, seat);
    // A seat's private doc holds only its own hand...
    if (h.phase !== "done") for (let o = 0; o < 4; o++) if (o !== seat) for (const c of h.hands[o]) assert.ok(!mine.hand.includes(c), "private view leaks another hand");
    // ...and pub + mine rebuilds exactly what the engine's own view() gives that seat.
    const merged = NG.merge(kind, pub, mine);
    const eng = (kind === "hearts" ? H : Sp).view(s.g, seat);
    assert.deepEqual(merged.hand.hands, eng.hand.hands, "merged hands = engine view");
    if (kind === "hearts" && h.phase !== "done") assert.deepEqual(merged.hand.passes, eng.hand.passes);
  }
  assert.ok(js.length < 20000, "public view stays small");
}

function playOut(kind, games, level) {
  const game = NG[kind];
  let hands = 0;
  for (let k = 0; k < games; k++) {
    const rng = C.makeRng(1000 + k);
    let s = game.setup(4, { level, target: kind === "hearts" ? 50 : 200 }, rng, seatsAll(["human", "computer", "computer", "computer"]));
    let steps = 0;
    while (!game.isOver(s)) {
      const toAct = game.toAct(s);
      assert.ok(toAct.length > 0, "toAct empty before the end");
      checkSecrets(game, kind, s);
      for (const seat of toAct) {
        if (game.isOver(s) || !game.toAct(s).includes(seat)) continue;
        const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
        const a = game.bot(ctx, seat, rng);
        if (a.type === "next") hands++;
        s = game.apply(JSON.parse(JSON.stringify(s)), seat, JSON.parse(JSON.stringify(a)), rng);
      }
      assert.deepEqual(JSON.parse(JSON.stringify(s)), s, "state survives JSON");
      assert.ok(++steps < 5000, "game ends");
    }
    hands++;
  }
  return hands;
}

t("Hearts: 30 bot-only games to 50 end, secrets stay hidden every move", () => { const n = playOut("hearts", 30, "medium"); assert.ok(n > 60, "hands played " + n); });
t("Spades: 20 bot-only games to 200 end, secrets stay hidden every move", () => { const n = playOut("spades", 20, "medium"); assert.ok(n > 40, "hands played " + n); });

t("Illegal moves throw (wrong card, wrong seat's card, bad bid)", () => {
  const rng = C.makeRng(5);
  let s = NG.hearts.setup(4, { passing: "none" }, rng, seatsAll(["human", "computer", "computer", "computer"]));
  const lead = s.g.hand.turn;
  const notMine = s.g.hand.hands[(lead + 1) % 4][0];
  assert.throws(() => NG.hearts.apply(s, lead, { type: "play", card: notMine }, rng));
  assert.throws(() => NG.hearts.apply(s, lead, { type: "next" }, rng));
  let sp = NG.spades.setup(4, {}, rng, seatsAll(["human", "computer", "computer", "computer"]));
  assert.throws(() => NG.spades.apply(sp, sp.g.hand.bidTurn, { type: "bid", bid: 14 }, rng));
});

t("Between hands only people are asked to deal the next hand", () => {
  const rng = C.makeRng(9);
  let s = NG.hearts.setup(4, {}, rng, seatsAll(["computer", "human", "computer", "human"]));
  assert.deepEqual(s.humans, [1, 3]);
  s.g.hand.phase = "done";
  assert.deepEqual(NG.hearts.toAct(s), [1, 3]);
});

// The shared local room (same code path as online, no network) plays both games to the end.
async function roomPlay(kind) {
  const room = createLocal({ game: NG[kind], seats: ["human", "computer", "computer", "computer"], options: { level: "easy", target: kind === "hearts" ? 50 : 200 }, botDelayMs: 0, rng: C.makeRng(78) });
  const game = NG[kind];
  let errors = 0;
  room.on("error", () => errors++);
  return new Promise((resolve) => {
    room.on("change", (snap) => {
      if (snap.status === "finished") { room.close(); resolve({ errors, snap }); return; }
      if (!snap.myTurn) return;
      setTimeout(() => room.act(game.bot({ pub: snap.pub, mine: snap.mine }, 0, Math.random)), 0);
    });
    room.start();
  });
}
for (const kind of ["hearts", "spades"]) {
  const r = await roomPlay(kind);
  t(`${kind}: createLocal room plays to "finished" with no errors`, () => { assert.equal(r.errors, 0); assert.ok(r.snap.pub.g.over); });
}

console.log(`online.test.mjs: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
