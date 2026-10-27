// Hearts player counts + point schemes, and Spades bidding variants (2026-10-27 improvement pass).
// Sources: Pagat Hearts (3 players drop the 2♦; 5 players drop the 2♦ and 2♣, the 3♣ leads),
// Pagat Black Maria (A♠ 7, K♠ 10, Q♠ 13), Pagat Spot Hearts (hearts at face value, A 14; Q♠ 25),
// Pagat Spades variants (Suicide, Whiz, Mirror).
const { test, eq, ok, throws } = require("./t.js");
const C = require("../js/cards.js");
const H = require("../js/hearts.js");
const AI = require("../js/hearts-ai.js");
const S = require("../js/spades.js");
const SA = require("../js/spades-ai.js");

const P = (s) => C.card("CDSH".indexOf(s.slice(-1)), C.RANK_NAMES.indexOf(s.slice(0, -1)));

function playOut(g, rnd, levels) {
  const n = g.opts.players;
  if (g.hand.phase === "pass") for (let s = 0; s < n; s++) H.submitPass(g, s, AI.choosePass(g.hand.hands[s], levels ? levels[s] : "medium", rnd));
  while (g.hand.phase === "play") {
    const s = g.hand.turn;
    const card = levels ? AI.chooseMove(g.hand, s, levels[s], rnd, g.opts) : (() => { const m = H.legal(g.hand, s); return m[Math.floor(rnd() * m.length)]; })();
    ok(H.legal(g.hand, s).includes(card), "computer played a legal card");
    H.play(g, s, card);
  }
}

test("3 players: 2♦ removed, 17 cards each, 17 tricks", () => {
  const g = H.newGame({ players: 3, passing: "none" });
  H.deal(g, C.makeRng(5));
  eq(g.hand.hands.length, 3);
  ok(g.hand.hands.every((h) => h.length === 17));
  ok(!g.hand.hands.flat().includes(P("2D")));
  eq(g.scores, [0, 0, 0]);
  playOut(g, C.makeRng(6));
  eq(g.hand.tricksWon.reduce((a, b) => a + b, 0), 17);
  eq(g.hand.taken.reduce((a, b) => a + b, 0), 26);
});

test("5 players: 2♦ and 2♣ removed, 10 cards each, the 3♣ leads", () => {
  const g = H.newGame({ players: 5, passing: "none" });
  H.deal(g, C.makeRng(8));
  eq(g.hand.hands.length, 5);
  ok(g.hand.hands.every((h) => h.length === 10));
  const all = g.hand.hands.flat();
  ok(!all.includes(P("2D")) && !all.includes(P("2C")));
  ok(g.hand.hands[g.hand.leader].includes(P("3C")));
  eq(H.legal(g.hand, g.hand.leader), [P("3C")]);
  playOut(g, C.makeRng(9));
  eq(g.hand.tricksWon.reduce((a, b) => a + b, 0), 10);
});

test("3 and 5 players pass left, right, keep (no across)", () => {
  for (const n of [3, 5]) {
    const g = H.newGame({ players: n });
    const seen = [];
    for (let i = 0; i < 4; i++) { H.deal(g, C.makeRng(i)); seen.push(g.hand.passOffset); g.handNo++; }
    eq(seen, [1, n - 1, 0, 1], n + " players");
    eq(H.passName(n - 1, n), "right");
  }
});

test("3-player pass goes to the left and everyone keeps 17", () => {
  const g = H.newGame({ players: 3 });
  H.deal(g, C.makeRng(2));
  const give = g.hand.hands[0].slice(0, 3);
  for (let s = 0; s < 3; s++) H.submitPass(g, s, g.hand.hands[s].slice(0, 3));
  eq(g.hand.phase, "play");
  ok(give.every((c) => g.hand.hands[1].includes(c)));
  ok(g.hand.hands.every((h) => h.length === 17));
});

test("random full games, 3 and 5 players, every level: points add up, moon gives others the full total", () => {
  const rnd = C.makeRng(77);
  for (const n of [3, 5]) {
    for (let k = 0; k < 40; k++) {
      const g = H.newGame({ players: n, target: 1e9 });
      g.handNo = k;
      H.deal(g, rnd);
      playOut(g, rnd, k < 4 ? Array(n).fill("hard") : Array.from({ length: n }, (_, i) => ["easy", "medium"][i % 2]));
      eq(g.hand.taken.reduce((a, b) => a + b, 0), 26);
      const tot = g.hand.result.pts.reduce((a, b) => a + b, 0);
      ok(tot === 26 || tot === 26 * (n - 1), "hand total " + tot);
      eq(g.scores.length, n);
    }
  }
});

test("Black Maria: A♠ 7, K♠ 10, Q♠ 13, hearts 1 = 43 a hand", () => {
  eq(C.deck().reduce((a, c) => a + H.points(c, "maria"), 0), 43);
  eq(H.points(P("AS"), "maria"), 7); eq(H.points(P("KS"), "maria"), 10); eq(H.points(P("QS"), "maria"), 13);
  eq(H.points(P("AS")), 0, "standard scheme unchanged");
  const g = H.newGame({ points: "maria", passing: "none", target: 1e9 });
  H.deal(g, C.makeRng(4));
  playOut(g, C.makeRng(5));
  eq(g.hand.taken.reduce((a, b) => a + b, 0), 43);
});

test("Spot Hearts: hearts at face value (A 14), Q♠ 25 = 129 a hand; moon needs all 129", () => {
  eq(C.deck().reduce((a, c) => a + H.points(c, "spot"), 0), 129);
  eq(H.points(P("AH"), "spot"), 14); eq(H.points(P("7H"), "spot"), 7); eq(H.points(P("QS"), "spot"), 25);
  eq(H.handPoints([129, 0, 0, 0], "add", -1, null, 100, 129).pts, [0, 129, 129, 129]);
  eq(H.handPoints([26, 0, 103, 0], "add", -1, null, 100, 129).pts, [26, 0, 103, 0], "26 isn't a moon in Spot");
  eq(H.totalPoints("spot"), 129); eq(H.totalPoints("maria"), 43); eq(H.totalPoints(), 26);
});

test("Black Maria on the first trick: K♠ and A♠ may be thrown (only hearts and Q♠ are barred)", () => {
  const hands = [
    "2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC AC",
    "2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD AS",
    "2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AD",
    "2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH",
  ].map((s) => s.split(" ").map(P));
  const g = H.newGame({ points: "maria", passing: "none" });
  H.deal(g, null, hands.flat());
  H.play(g, 0, P("2C"));
  ok(H.legal(g.hand, 1).length === 13);
});

test("online state is unchanged: a 4-player standard game has no new required options", () => {
  const g = H.newGame();
  eq(g.opts.players, 4); eq(g.opts.points, "standard");
  H.deal(g, C.makeRng(1));
  eq(g.hand.hands.length, 4);
  ok(g.hand.hands.every((h) => h.length === 13));
});

// ------------------------------------------------------------------ Spades bidding variants
function spadesHand(bidding, rnd) {
  const g = S.newGame({ bidding });
  S.deal(g, rnd);
  return g;
}
const spadeCount = (h) => h.filter((c) => C.suit(c) === C.SPADES).length;

test("Spades Whiz: bid your number of spades or nil, nothing else", () => {
  const g = spadesHand("whiz", C.makeRng(3));
  const s = g.hand.bidTurn, sp = spadeCount(g.hand.hands[s]);
  const ok1 = S.allowedBids(g, s);
  eq(ok1.sort((a, b) => a - b), [...new Set([0, sp])].sort((a, b) => a - b));
  const bad = sp === 5 ? 4 : 5;
  throws(() => S.submitBid(g, s, bad, false));
  S.submitBid(g, s, sp, false);
});

test("Spades Mirror: bid exactly your number of spades (nil only with no spades)", () => {
  const g = spadesHand("mirror", C.makeRng(4));
  const s = g.hand.bidTurn, sp = spadeCount(g.hand.hands[s]);
  eq(S.allowedBids(g, s), [sp]);
  throws(() => S.submitBid(g, s, sp + 1, false));
});

test("Spades Suicide: one partner bids nil, the other bids 4 or more", () => {
  const g = spadesHand("suicide", C.makeRng(5));
  const first = g.hand.bidTurn;
  // first of a team to bid may bid nil or 4+
  const a = S.allowedBids(g, first);
  ok(a.includes(0) && a.includes(4) && !a.includes(1) && !a.includes(3));
  S.submitBid(g, first, 5, false);
  S.submitBid(g, (first + 1) % 4, 0, false);
  eq(S.allowedBids(g, (first + 2) % 4), [0], "partner of a 5-bidder must bid nil");
  const b = S.allowedBids(g, (first + 3) % 4);
  ok(!b.includes(0) && b.every((x) => x >= 4), "partner of a nil bidder must bid 4+");
});

test("Spades blind nil follows the bidding variant (none in Mirror; in Suicide not after partner's nil)", () => {
  const opts = (bidding) => ({ bidding, blindNil: true, blindNilBehind: 0 });
  const m = S.newGame(opts("mirror")); S.deal(m, C.makeRng(6));
  eq(S.blindNilAllowed(m, m.hand.bidTurn), false, "Mirror: your bid is your spades, so no blind nil");
  throws(() => S.submitBid(m, m.hand.bidTurn, 0, true));
  const g = S.newGame(opts("suicide")); S.deal(g, C.makeRng(7));
  const first = g.hand.bidTurn;
  eq(S.blindNilAllowed(g, first), true, "Suicide: the first of a team may go blind nil");
  S.submitBid(g, first, 0, false);
  S.submitBid(g, (first + 1) % 4, 4, false);
  eq(S.blindNilAllowed(g, (first + 2) % 4), false, "Suicide: partner already bid nil");
  throws(() => S.submitBid(g, (first + 2) % 4, 0, true));
  const wz = S.newGame(opts("whiz")); S.deal(wz, C.makeRng(8));
  eq(S.blindNilAllowed(wz, wz.hand.bidTurn), true, "Whiz allows nil, so blind nil too");
});

test("Spades variants: computers always make an allowed bid and the hand plays out", () => {
  const rnd = C.makeRng(11);
  for (const bidding of ["whiz", "mirror", "suicide"]) {
    for (let k = 0; k < 12; k++) {
      const g = S.newGame({ bidding });
      g.dealer = k % 4;
      S.deal(g, rnd);
      while (g.hand.phase === "bid") {
        const s = g.hand.bidTurn, lv = ["easy", "medium", "hard"][k % 3];
        const b = SA.chooseBid(g, s, lv, rnd);
        ok(S.allowedBids(g, s).includes(b), bidding + " " + lv + " bid " + b);
        S.submitBid(g, s, b, false);
      }
      while (g.hand.phase === "play") { const s = g.hand.turn; S.play(g, s, SA.chooseMove(g, s, "medium", rnd)); }
      eq(g.hand.phase, "done");
    }
  }
});
