const { test, eq, ok, throws } = require("./t.js");
const C = require("../js/cards.js");
const H = require("../js/hearts.js");
const AI = require("../js/hearts-ai.js");

// "QS" -> queen of spades, "10H", "2C", "AD"
const P = (s) => C.card("CDSH".indexOf(s.slice(-1)), C.RANK_NAMES.indexOf(s.slice(0, -1)));
const Ps = (str) => str.split(" ").map(P);
/** Deck that deals exactly these four hands (13 each, seat order 0..3). */
function deckOf(hands) {
  const used = new Set(hands.flat());
  eq(used.size, 52, "deck must use 52 distinct cards");
  return hands.flat();
}
// A fixed test deal: seat 0 has all clubs, seat 1 diamonds, seat 2 spades, seat 3 hearts.
const SUITED = [0, 1, 2, 3].map((s) => [...Array(13).keys()].map((r) => C.card(s, r)));

test("deck: 52 distinct cards, 13 per suit, Q♠ = 36, 2♣ = 0, J♦ = 22", () => {
  const d = C.deck();
  eq(new Set(d).size, 52);
  for (let s = 0; s < 4; s++) eq(d.filter((c) => C.suit(c) === s).length, 13);
  eq(H.QS, P("QS")); eq(H.TWO_CLUBS, P("2C")); eq(H.JD, P("JD"));
});

test("points: 13 hearts at 1 + queen at 13 = 26 in the deck", () => {
  eq(C.deck().reduce((a, c) => a + H.points(c), 0), 26);
});

test("pass cycle: left, right, across, keep, then left again", () => {
  const g = H.newGame();
  const seen = [];
  for (let i = 0; i < 5; i++) { H.deal(g, C.makeRng(i)); seen.push(g.hand.passOffset); g.handNo++; }
  eq(seen, [1, 3, 2, 0, 1]);
  eq(H.PASS_NAMES[1], "left"); eq(H.PASS_NAMES[3], "right");
});

test("pass variants: cycle3 skips keep; none never passes", () => {
  const g = H.newGame({ passing: "cycle3" });
  const seen = [];
  for (let i = 0; i < 4; i++) { H.deal(g, C.makeRng(i)); seen.push(g.hand.passOffset); g.handNo++; }
  eq(seen, [1, 3, 2, 1]);
  const n = H.newGame({ passing: "none" });
  H.deal(n, C.makeRng(1));
  eq(n.hand.phase, "play");
});

test("passing left moves your 3 cards to the player on your left", () => {
  const g = H.newGame();
  H.deal(g, null, deckOf(SUITED));
  const give = [P("AC"), P("KC"), P("QC")];
  H.submitPass(g, 0, give);
  H.submitPass(g, 1, Ps("AD KD QD"));
  H.submitPass(g, 2, Ps("AS KS QS"));
  eq(g.hand.phase, "pass");
  H.submitPass(g, 3, Ps("AH KH QH"));
  eq(g.hand.phase, "play");
  ok(give.every((c) => g.hand.hands[1].includes(c)));
  ok(Ps("AH KH QH").every((c) => g.hand.hands[0].includes(c)));
  ok(g.hand.hands.every((h) => h.length === 13));
});

test("pass validation: exactly 3 distinct cards from your hand, once", () => {
  const g = H.newGame();
  H.deal(g, null, deckOf(SUITED));
  throws(() => H.submitPass(g, 0, [P("AC"), P("KC")]));
  throws(() => H.submitPass(g, 0, [P("AC"), P("AC"), P("KC")]));
  throws(() => H.submitPass(g, 0, [P("AC"), P("KC"), P("AD")]));
  H.submitPass(g, 0, Ps("AC KC QC"));
  throws(() => H.submitPass(g, 0, Ps("JC 10C 9C")));
});

test("the 2 of clubs leads the first trick and is the only legal lead", () => {
  const g = H.newGame({ passing: "none" });
  H.deal(g, C.makeRng(7));
  const s = g.hand.leader;
  ok(g.hand.hands[s].includes(0));
  eq(H.legal(g.hand, s), [0]);
  throws(() => H.play(g, s, g.hand.hands[s].find((c) => c !== 0)));
});

test("first trick: no hearts or queen when you can't follow, unless that's all you have", () => {
  // seat 1 has no clubs: diamonds + hearts + Q♠
  const hands = [
    Ps("2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC AC"),
    Ps("2D 3D 4D 5D 6D 2H 3H 4H 5H 6H 7H QS 8H"),
    Ps("7D 8D 9D 10D JD QD KD AD 2S 3S 4S 5S 6S"),
    Ps("9H 10H JH QH KH AH 7S 8S 9S 10S JS KS AS"),
  ];
  const g = H.newGame({ passing: "none" });
  H.deal(g, null, deckOf(hands));
  H.play(g, 0, P("2C"));
  eq(H.legal(g.hand, 1).sort((a, b) => a - b), Ps("2D 3D 4D 5D 6D"));
  // Bleeding variant allows anything.
  const b = H.newGame({ passing: "none", bleed: true });
  H.deal(b, null, deckOf(hands));
  H.play(b, 0, P("2C"));
  eq(H.legal(b.hand, 1).length, 13);
  // Seat 3: only hearts and spades -> spades are not points, so spades only (no Q♠ there).
  H.play(g, 1, P("2D")); H.play(g, 2, P("7D"));
  eq(H.legal(g.hand, 3).every((c) => C.suit(c) === C.SPADES), true);
});

test("first trick: a hand of only point cards may play a heart but not the queen", () => {
  const hands = [
    Ps("2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC AC"),
    Ps("2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH QS"),
    Ps("2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD AD"),
    Ps("AH 2S 3S 4S 5S 6S 7S 8S 9S 10S JS KS AS"),
  ];
  const g = H.newGame({ passing: "none" });
  H.deal(g, null, deckOf(hands));
  H.play(g, 0, P("2C"));
  const l = H.legal(g.hand, 1);
  ok(!l.includes(H.QS));
  eq(l.length, 12);
});

test("hearts can't be led until broken, unless you hold only hearts", () => {
  const g = H.newGame({ passing: "none" });
  H.deal(g, null, deckOf(SUITED));
  // play out the club trick: seats 1,2,3 can't follow; seat 3 has only hearts -> may play a heart.
  H.play(g, 0, P("2C"));
  H.play(g, 1, P("2D"));
  H.play(g, 2, P("2S"));
  ok(H.legal(g.hand, 3).every((c) => C.suit(c) === C.HEARTS)); // only hearts in hand: allowed
  H.play(g, 3, P("2H"));
  ok(g.hand.heartsBroken);
  eq(g.hand.taken[0], 1); // seat 0 won with the only club
});

test("hearts not broken: leader with hearts and other suits can't lead hearts", () => {
  const h = { hands: [Ps("2H 3H 4D"), [], [], []], trick: [], trickNo: 3, heartsBroken: false };
  eq(H.legal(h, 0), [P("4D")]);
  h.hands[0] = Ps("2H 3H");
  eq(H.legal(h, 0).length, 2);
});

test("queen of spades breaks hearts only with the variant on", () => {
  for (const qb of [false, true]) {
    const h = { hands: [[H.QS], [], [], []], trick: [{ seat: 3, card: P("2D") }], trickNo: 2, heartsBroken: false,
      queenBreaks: qb, played: new Array(52).fill(0), plays: [], voids: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], turn: 0, taken: [0, 0, 0, 0], tricksWon: [0, 0, 0, 0] };
    H.playRaw(h, 0, H.QS);
    eq(h.heartsBroken, qb);
    ok(h.voids[0][C.DIAMONDS]);
  }
});

test("trick winner: highest card of the suit led; off-suit never wins", () => {
  eq(H.trickWinner([{ seat: 2, card: P("5C") }, { seat: 3, card: P("AH") }, { seat: 0, card: P("9C") }, { seat: 1, card: P("AS") }]), 0);
});

test("moon: shooter 0 and others +26; subtract rule gives shooter -26", () => {
  eq(H.handPoints([26, 0, 0, 0], "add", -1).pts, [0, 26, 26, 26]);
  eq(H.handPoints([0, 26, 0, 0], "subtract", -1).pts, [0, -26, 0, 0]);
  eq(H.handPoints([13, 5, 8, 0], "add", -1).pts, [13, 5, 8, 0]);
});

test("moon 'choice': subtract only when adding would end the game with the shooter not winning", () => {
  // Others at 80, 90, 60; shooter at 85. Adding 26 ends it with shooter (85) not lowest? after: 85,106,116,86 -> shooter lowest -> add.
  eq(H.handPoints([26, 0, 0, 0], "choice", -1, [85, 80, 90, 60], 100).moonHow, "add");
  // Shooter at 95, another at 20: after add = 95, 46, ... ends? 95+0 no, others 46,.. max 116 ends, shooter not lowest -> subtract.
  eq(H.handPoints([26, 0, 0, 0], "choice", -1, [95, 20, 90, 50], 100).moonHow, "subtract");
});

test("jack of diamonds variant: -10 to whoever takes it, moon still needs 26 penalty points", () => {
  eq(H.handPoints([20, 6, 0, 0], "add", 2).pts, [20, 6, -10, 0]);
  eq(H.handPoints([26, 0, 0, 0], "add", 0).pts, [-10, 26, 26, 26]);
});

test("game ends at the target; lowest score wins", () => {
  const g = H.newGame({ target: 100 });
  g.scores = [90, 40, 30, 60];
  g.hand = { taken: [13, 5, 4, 4], jackBy: -1 };
  H.finishHand(g);
  eq(g.scores, [103, 45, 34, 64]);
  ok(g.over); eq(g.winners, [2]);
  const t = H.newGame({ target: 100 });
  t.scores = [90, 40, 40, 60];
  t.hand = { taken: [13, 5, 5, 3], jackBy: -1 };
  H.finishHand(t);
  ok(!t.over, "a tie for lowest plays on");
});

test("random full games: 26 points every hand, 13 tricks, legal play only", () => {
  const rnd = C.makeRng(99);
  for (let n = 0; n < 300; n++) {
    const g = H.newGame({ target: 1e9 });
    g.handNo = n;
    H.deal(g, rnd);
    if (g.hand.phase === "pass") for (let s = 0; s < 4; s++) H.submitPass(g, s, AI.choosePass(g.hand.hands[s], ["easy", "medium", "hard"][s % 3], rnd));
    while (g.hand.phase === "play") {
      const s = g.hand.turn;
      const moves = H.legal(g.hand, s);
      H.play(g, s, moves[Math.floor(rnd() * moves.length)]);
    }
    eq(g.hand.taken.reduce((a, b) => a + b, 0), 26);
    eq(g.hand.tricksWon.reduce((a, b) => a + b, 0), 13);
    const r = g.hand.result.pts.reduce((a, b) => a + b, 0);
    ok(r === 26 || r === 78, "hand total " + r);
  }
});

test("apply() never changes the old state; view() hides other hands", () => {
  let s = H.apply(null, { type: "new", opts: { passing: "none" } });
  s = H.apply(s, { type: "deal", deck: C.shuffle(C.deck(), C.makeRng(3)) });
  const before = JSON.stringify(s);
  const lead = s.hand.turn;
  const s2 = H.apply(s, { type: "play", seat: lead, card: 0 });
  eq(JSON.stringify(s), before);
  eq(s2.hand.trick.length, 1);
  const v = H.view(s2, 0);
  eq(v.hand.hands[1].every((c) => c === null), true);
  eq(v.hand.hands[1].length, s2.hand.hands[1].length);
  eq(v.hand.hands[0], s2.hand.hands[0]);
  throws(() => H.apply(s2, { type: "play", seat: (lead + 2) % 4, card: s2.hand.hands[(lead + 2) % 4][0] }));
  throws(() => H.apply(s, { type: "deal", deck: [1, 2, 3] }));
});

test("view() hides other players' passes until everyone has passed", () => {
  let s = H.apply(null, { type: "new" });
  s = H.apply(s, { type: "deal", deck: C.deck() });
  s = H.apply(s, { type: "pass", seat: 1, cards: s.hand.hands[1].slice(0, 3) });
  const v = H.view(s, 0);
  eq(v.hand.passes[1], true);
  eq(v.hand.start[1], null);
});
