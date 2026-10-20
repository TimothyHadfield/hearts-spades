// Checks the odds layer against brute force: sampling, look-ahead expectations, bid advisor, moon odds.
const { test, eq, ok } = require("./t.js");
const C = require("../js/cards.js");
const H = require("../js/hearts.js");
const HA = require("../js/hearts-ai.js");
const S = require("../js/spades.js");
const SA = require("../js/spades-ai.js");
const P = (s) => C.card("CDSH".indexOf(s.slice(-1)), C.RANK_NAMES.indexOf(s.slice(0, -1)));
const Ps = (str) => str.split(" ").map(P);

test("dealUnseen: right counts, fixed cards kept, voids respected", () => {
  const rnd = C.makeRng(1);
  const unseen = C.deck().filter((c) => c >= 13 && c !== 30 && c !== 31);
  for (let k = 0; k < 300; k++) {
    const hands = C.dealUnseen(unseen, [0, 13, 13, 13], [[], [30, 31], [], []], [null, null, [true, false, false, false], [false, true, false, false]], rnd);
    eq(hands.map((h) => h.length), [0, 13, 13, 13]);
    ok(hands[1].includes(30) && hands[1].includes(31));
    ok(hands[3].every((c) => C.suit(c) !== C.DIAMONDS));
    eq(new Set(hands.flat()).size, 39);
  }
});

test("dealUnseen without voids is uniform: each card lands on each seat ~1/3", () => {
  const rnd = C.makeRng(2);
  const unseen = Ps("2C 3C 4C 5C 6C 7C 8C 9C 10C");
  const cnt = [0, 0, 0, 0];
  const N = 30000;
  for (let k = 0; k < N; k++) {
    const h = C.dealUnseen(unseen, [0, 3, 3, 3], null, null, rnd);
    for (let s = 1; s < 4; s++) if (h[s].includes(P("2C"))) cnt[s]++;
  }
  for (let s = 1; s < 4; s++) ok(Math.abs(cnt[s] / N - 1 / 3) < 0.012, "seat " + s + " " + cnt[s] / N);
});

// Every way to deal 9 cards 3/3/3 to seats 1-3 (1680 deals).
function allDeals(cards) {
  const out = [];
  const rec = (i, hs) => {
    if (i === cards.length) { out.push(hs.map((h) => h.slice())); return; }
    for (let s = 0; s < 3; s++) if (hs[s].length < 3) { hs[s].push(cards[i]); rec(i + 1, hs); hs[s].pop(); }
  };
  rec(0, [[], [], []]);
  return out;
}

test("hearts look-ahead: sampled expected points match the exact average over all 1680 deals", () => {
  const mine = Ps("KH 5S 9D");
  const others = Ps("2H 7H QS AH 3S 8D 4C JC 10H");
  const played = new Array(52).fill(1);
  for (const c of mine.concat(others)) played[c] = 0;
  const base = {
    hands: [mine, [], [], []], trick: [], leader: 0, turn: 0, trickNo: 10, taken: [3, 0, 2, 0],
    tricksWon: [3, 3, 2, 2], heartsBroken: true, played, plays: null, jackBy: -1,
    voids: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], phase: "play", passOffset: 0, passes: [null, null, null, null], received: [null, null, null, null],
  };
  const deals = allDeals(others);
  eq(deals.length, 1680);
  const exact = {};
  for (const card of mine) {
    let sum = 0;
    for (const d of deals) {
      const st = HA.simState(base, [mine.slice(), d[0].slice(), d[1].slice(), d[2].slice()]);
      H.playRaw(st, 0, card);
      HA.rollout(st);
      sum += HA.value(st, 0, { moon: "add" });
    }
    exact[card] = sum / deals.length;
  }
  base.hands[1] = [null, null, null]; base.hands[2] = [null, null, null]; base.hands[3] = [null, null, null];
  const ev = HA.evaluate(base, 0, 6000, C.makeRng(3), { moon: "add" });
  for (const e of ev) ok(Math.abs(e.ev - exact[e.card]) < 0.25, C.name(e.card) + " sampled " + e.ev.toFixed(2) + " exact " + exact[e.card].toFixed(2));
  // and the best card agrees
  const bestExact = mine.reduce((a, b) => (exact[b] < exact[a] ? b : a));
  ok(Math.abs(exact[ev[0].card] - exact[bestExact]) < 0.15);
});

test("moon odds: a player holding 25 points who must win the last heart shoots with certainty", () => {
  const played = new Array(52).fill(1);
  for (const c of Ps("AH 2C 3C 4C")) played[c] = 0;
  const h = {
    hands: [Ps("2C"), Ps("AH"), [null], [null]], trick: [], leader: 1, turn: 1, trickNo: 12, taken: [0, 25, 0, 0],
    tricksWon: [0, 12, 0, 0], heartsBroken: true, played, plays: null, jackBy: -1,
    voids: [[0, 0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, 1]], phase: "play", passOffset: 0, passes: [null, null, null, null], received: [null, null, null, null],
  };
  eq(HA.moonChance(h, 0, 1, 50, C.makeRng(1)), 1);
  eq(HA.moonThreat(h, 0, 10), 1);
  h.taken = [1, 24, 0, 0];
  eq(HA.moonChance(h, 0, 1, 50, C.makeRng(1)), 0);
  eq(HA.moonThreat(h, 0, 10), -1);
});

test("bid advisor: all 13 spades -> 13 tricks for sure, nil 0%", () => {
  const g = S.newGame(); g.dealer = 3;
  S.deal(g, null, Ps("2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS").concat(C.deck().filter((c) => C.suit(c) !== C.SPADES)));
  const a = SA.adviseBid(g, 0, 60, C.makeRng(1));
  eq(a.dist[13], 1); eq(a.expected, 13); eq(a.nilChance, 0);
  // The best bid leaves room for partner's bid: team total can't beat 13 tricks.
  ok(a.best.bid >= 9 && a.best.bid <= 13, "best " + a.best.bid);
});

test("bid advisor: a hand of low clubs/diamonds/hearts expects under 1 trick and likes nil", () => {
  const mine = Ps("2C 3C 4C 5C 2D 3D 4D 5D 2H 3H 4H 5H 6H");
  const rest = C.deck().filter((c) => !mine.includes(c));
  const g = S.newGame(); g.dealer = 3;
  S.deal(g, null, mine.concat(rest));
  const a = SA.adviseBid(g, 0, 200, C.makeRng(2));
  ok(a.expected < 1, "expected " + a.expected);
  ok(a.nilChance > 0.6, "nil " + a.nilChance);
  eq(a.best.bid, 0);
  const sum = a.dist.reduce((x, y) => x + y, 0);
  ok(Math.abs(sum - 1) < 1e-9);
});

test("spades look-ahead: last trick is scored exactly (deterministic endgame)", () => {
  const g = S.newGame(); g.dealer = 3;
  const played = new Array(52).fill(1);
  for (const c of Ps("AS 2D 3D 4D")) played[c] = 0;
  g.hand = {
    hands: [Ps("AS"), [null], [null], [null]], bids: [3, 3, 3, 3], blind: [false, false, false, false], trick: [], leader: 0, turn: 0,
    trickNo: 12, tricks: [2, 3, 3, 4], spadesBroken: true, spadesLead: "broken", played, plays: null,
    voids: [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]], phase: "play",
  };
  const ev = SA.evaluate(g, 0, 20, C.makeRng(1));
  // We take the last trick: us 3+3 bid, tricks 3+3 -> 60; them bid 6 took 7 -> 61. Shadow cost 0.3 x 100/10 = 3 per bag.
  eq(ev.length, 1);
  ok(Math.abs(ev[0].ev - (60 - (61 - 3))) < 1e-9, "ev " + ev[0].ev);
});
