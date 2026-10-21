const { test, eq, ok, throws } = require("./t.js");
const C = require("../js/cards.js");
const S = require("../js/spades.js");
const AI = require("../js/spades-ai.js");
const P = (s) => C.card("CDSH".indexOf(s.slice(-1)), C.RANK_NAMES.indexOf(s.slice(0, -1)));
const Ps = (str) => str.split(" ").map(P);
const sc = (bids, blind, tricks, bags, opts) => S.scoreTeam(bids, blind, tricks, bags || 0, opts);

test("score: bid 4+3=7, took 8 -> 70 + 1 bag = 71", () => {
  const r = sc([4, 3], [false, false], [5, 3]);
  eq(r.points, 71); eq(r.bagsAdded, 1); eq(r.bagsAfter, 1);
});
test("score: set -> minus 10 per trick bid", () => {
  eq(sc([4, 3], [false, false], [3, 3]).points, -70);
});
test("score: exact contract, no bags", () => {
  const r = sc([5, 2], [false, false], [4, 3]);
  eq(r.points, 70); eq(r.bagsAdded, 0);
});
test("score: nil made +100 plus partner's contract", () => {
  eq(sc([0, 4], [false, false], [0, 4]).points, 140);
});
test("score: nil failed with 2 tricks: -100, partner 4/4 = 40, nil tricks are 2 bags", () => {
  const r = sc([0, 4], [false, false], [2, 4]);
  eq(r.points, -100 + 40 + 2); eq(r.bagsAdded, 2);
});
test("score: nil bidder's tricks don't rescue the partner's bid (standard)", () => {
  eq(sc([0, 5], [false, false], [2, 3]).points, -100 - 50 + 2);
});
test("score variant: nil tricks count toward partner's bid", () => {
  eq(sc([0, 5], [false, false], [2, 3], 0, { nilCounts: true }).points, -100 + 50);
});
test("score: blind nil is worth 200 either way", () => {
  eq(sc([0, 4], [true, false], [0, 4]).points, 240);
  eq(sc([0, 4], [true, false], [1, 4]).points, -200 + 40 + 1);
});
test("bags: reaching 10 costs 100 and carries the rest", () => {
  const r = sc([3, 3], [false, false], [5, 3], 9);  // 2 bags, 9 -> 11 -> penalty, 1 left
  eq(r.points, 60 + 2 - 100); eq(r.bagsAfter, 1); eq(r.penalty, 100);
});
test("bags variant: 5-bag limit with 50 penalty; and bags off", () => {
  eq(sc([3, 3], [false, false], [5, 3], 4, { bagLimit: 5, bagPenalty: 50 }).bagsAfter, 1);
  eq(sc([3, 3], [false, false], [5, 3], 9, { bagLimit: 0 }).points, 62);
});
test("both partners nil: tricks taken are bags", () => {
  const r = sc([0, 0], [false, false], [0, 1]);
  eq(r.points, 100 - 100 + 1); eq(r.bagsAdded, 1);
});

test("trick winner: any spade beats the led suit; highest spade wins", () => {
  eq(S.trickWinner([{ seat: 0, card: P("AH") }, { seat: 1, card: P("2S") }, { seat: 2, card: P("KH") }, { seat: 3, card: P("3S") }]), 3);
  eq(S.trickWinner([{ seat: 0, card: P("5D") }, { seat: 1, card: P("AC") }, { seat: 2, card: P("9D") }, { seat: 3, card: P("2D") }]), 2);
});

test("bidding starts left of the dealer, who also leads; dealer moves left each hand", () => {
  const g = S.newGame();
  S.deal(g, C.makeRng(1));
  eq(g.hand.bidTurn, (g.dealer + 1) % 4);
  const d0 = g.dealer;
  for (let i = 0; i < 4; i++) S.submitBid(g, g.hand.bidTurn, 3, false);
  eq(g.hand.phase, "play");
  eq(g.hand.turn, (d0 + 1) % 4);
  throws(() => S.submitBid(g, 0, 3, false));
});

test("spades can't be led until broken unless only spades are held; variant allows it", () => {
  const h = { hands: [Ps("2S 3S 4D"), [], [], []], trick: [], trickNo: 2, spadesBroken: false, spadesLead: "broken" };
  eq(S.legal(h, 0), [P("4D")]);
  h.hands[0] = Ps("2S 3S"); eq(S.legal(h, 0).length, 2);
  h.hands[0] = Ps("2S 3S 4D"); h.spadesLead = "any"; eq(S.legal(h, 0).length, 3);
  h.spadesLead = "broken"; h.spadesBroken = true; eq(S.legal(h, 0).length, 3);
});

test("must follow suit; void may trump", () => {
  const h = { hands: [Ps("2S 3D 4D"), [], [], []], trick: [{ seat: 3, card: P("AD") }], trickNo: 2 };
  eq(S.legal(h, 0), Ps("3D 4D"));
  h.hands[0] = Ps("2S 3H"); eq(S.legal(h, 0).length, 2);
});

test("nil can be switched off; blind nil only when allowed and behind by 100", () => {
  const g = S.newGame({ nil: false });
  S.deal(g, C.makeRng(2));
  throws(() => S.submitBid(g, g.hand.bidTurn, 0, false));
  const b = S.newGame({ blindNil: true });
  S.deal(b, C.makeRng(2));
  throws(() => S.submitBid(b, b.hand.bidTurn, 0, true)); // not behind
  b.scores = [0, 150];
  ok(S.blindNilAllowed(b, 0)); ok(!S.blindNilAllowed(b, 1));
});

test("blind nil: bidder gives partner 2, partner gives 2 back, hands stay at 13", () => {
  const g = S.newGame({ blindNil: true });
  g.scores = [0, 200];
  S.deal(g, C.makeRng(5));
  eq(g.hand.bidTurn, 0);
  S.submitBid(g, 0, 0, true);
  S.submitBid(g, 1, 3, false); S.submitBid(g, 2, 4, false); S.submitBid(g, 3, 3, false);
  eq(g.hand.phase, "exchange");
  eq(S.toAct(g).seats, [0]);
  throws(() => S.submitExchange(g, 2, g.hand.hands[2].slice(0, 2)));
  const give = g.hand.hands[0].slice(-2);
  S.submitExchange(g, 0, give);
  ok(give.every((c) => g.hand.hands[2].includes(c)));
  eq(g.hand.hands[2].length, 15);
  eq(S.toAct(g).seats, [2]);
  S.submitExchange(g, 2, g.hand.hands[2].slice(0, 2));
  eq(g.hand.phase, "play");
  ok(g.hand.hands.every((x) => x.length === 13));
  // view: Left can't see what was swapped
  const v = S.view(g, 1);
  ok(!v.hand.exchange.given && !v.hand.exchange.back);
});

test("game end: both teams past 500 -> higher wins; tie keeps playing", () => {
  const mk = (a, b) => { const g = S.newGame(); g.scores = [a, b]; g.hand = { bids: [3, 3, 3, 3], blind: [0, 0, 0, 0], tricks: [3, 3, 3, 4] }; S.finishHand(g); return g; };
  const g = mk(470, 480);   // +60 and +61
  eq(g.scores, [530, 541]); ok(g.over); eq(g.winner, 1);
  const t = S.newGame(); t.scores = [471, 470]; t.hand = { bids: [3, 3, 3, 3], blind: [0, 0, 0, 0], tricks: [3, 4, 3, 3] }; S.finishHand(t);
  eq(t.scores, [531, 531]); ok(!t.over);
});

test("lose-at variant: -200 ends it", () => {
  const g = S.newGame({ loseAt: 200 }); g.scores = [-150, 0];
  g.hand = { bids: [5, 3, 5, 3], blind: [0, 0, 0, 0], tricks: [2, 4, 2, 5] }; S.finishHand(g);
  ok(g.over); eq(g.winner, 1);
});

test("random full games: 13 tricks a hand, cards all used, scores = sum of hand results", () => {
  const rnd = C.makeRng(11);
  for (let n = 0; n < 40; n++) {
    const g = S.newGame({ blindNil: true, blindNilBehind: 0 });
    let total = [0, 0];
    while (!g.over && g.handNo < 60) {
      S.deal(g, rnd);
      while (g.hand.phase === "bid") { const s = g.hand.bidTurn; S.submitBid(g, s, AI.chooseBid(g, s, "medium", rnd), false); }
      const h = g.hand;
      while (h.phase === "play") { const s = h.turn; const m = S.legal(h, s); S.play(g, s, m[Math.floor(rnd() * m.length)]); }
      eq(h.tricks.reduce((a, b) => a + b, 0), 13);
      eq(h.played.reduce((a, b) => a + b, 0), 52);
      total = [total[0] + h.result[0].points, total[1] + h.result[1].points];
      eq(g.scores, total);
    }
  }
});

test("apply()/view(): pure, and other hands hidden", () => {
  let s = S.apply(null, { type: "new" });
  s = S.apply(s, { type: "deal", deck: C.shuffle(C.deck(), C.makeRng(4)) });
  const before = JSON.stringify(s);
  const s2 = S.apply(s, { type: "bid", seat: s.hand.bidTurn, bid: 3 });
  eq(JSON.stringify(s), before);
  eq(s2.hand.bids[0], 3);
  const v = S.view(s2, 2);
  ok(v.hand.hands[0].every((c) => c === null));
  eq(v.hand.hands[2], s2.hand.hands[2]);
});

test("gameEnd(): target, tie at target plays on, lose-at, both under (edge pass)", () => {
  const o = { target: 500, loseAt: 200 };
  eq(S.gameEnd([510, 300], o), 0);
  eq(S.gameEnd([300, 520], o), 1);
  eq(S.gameEnd([510, 510], o), -1);
  eq(S.gameEnd([-210, 40], o), 1);
  eq(S.gameEnd([40, -200], o), 0);
  eq(S.gameEnd([-150, 40], o), -1);
  eq(S.gameEnd([-250, 40], { target: 500, loseAt: 0 }), -1);
});
