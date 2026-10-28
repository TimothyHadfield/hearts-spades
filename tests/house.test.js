// Spades house rules (wave 3, 2026-10-28). Source: Pagat Spades variations
// (https://www.pagat.com/auctionwhist/spades.html):
//  - Jokers: the 2♣ and 2♥ come out, Big Joker and Little Joker go in as the two highest spades
//    ("big joker, small joker, 2, A, K..." in Barmore's rules; jokers count as spades).
//  - Deuces high: the 2♠ ranks above the A♠ (below the jokers when both are on).
//  - Minimum team bid: "each team must bid at least 4 tricks. If a player bids Nil, the partner
//    must bid at least 4."
const { test, eq, ok, throws } = require("./t.js");
const C = require("../js/cards.js");
const S = require("../js/spades.js");
const SA = require("../js/spades-ai.js");

const P = (s) => C.card("CDSH".indexOf(s.slice(-1)), C.RANK_NAMES.indexOf(s.slice(0, -1)));
const LJ = 52, BJ = 53, D2 = 54;   // Little Joker, Big Joker, the 2♠ when deuces are high

test("jokers: 52 cards, 2♣ and 2♥ out, both jokers in, 15 spades", () => {
  const d = S.deckFor({ jokers: true });
  eq(d.length, 52);
  eq(new Set(d).size, 52);
  ok(!d.includes(P("2C")) && !d.includes(P("2H")), "2♣ and 2♥ removed");
  ok(d.includes(LJ) && d.includes(BJ), "both jokers in");
  eq(d.filter((c) => C.suit(c) === C.SPADES).length, 15);
  eq(C.name(BJ), "Big Joker");
  eq(C.name(LJ), "Little Joker");
  eq(S.deckFor({}).length, 52);
  eq(S.deckFor({}), C.deck(), "standard deck unchanged");
});

test("jokers: Big Joker > Little Joker > A♠, and a joker trumps a side suit", () => {
  eq(S.trickWinner([{ seat: 0, card: P("AS") }, { seat: 1, card: LJ }, { seat: 2, card: P("KS") }, { seat: 3, card: BJ }]), 3);
  eq(S.trickWinner([{ seat: 0, card: P("AS") }, { seat: 1, card: LJ }, { seat: 2, card: P("KS") }, { seat: 3, card: P("3S") }]), 1);
  eq(S.trickWinner([{ seat: 0, card: P("AC") }, { seat: 1, card: P("KC") }, { seat: 2, card: LJ }, { seat: 3, card: P("QC") }]), 2);
});

test("jokers count as spades: must follow a spade lead, can't lead before spades break", () => {
  const g = S.newGame({ jokers: true });
  S.deal(g, null, S.deckFor({ jokers: true }));
  const h = g.hand;
  h.phase = "play";
  h.hands[0] = [P("3C"), LJ, P("5H")];
  h.trick = [];
  h.spadesBroken = false;
  eq(S.legal(h, 0).includes(LJ), false, "joker can't be led before spades break");
  h.trick = [{ seat: 3, card: P("4S") }];
  eq(S.legal(h, 0), [LJ], "joker must follow a spade lead");
  h.trick = [{ seat: 3, card: P("4D") }];
  eq(S.legal(h, 0).length, 3, "void in diamonds: anything, joker trumps");
});

test("deuces high: 2♠ beats A♠; with jokers the order is BJ, LJ, 2♠, A♠", () => {
  const d = S.deckFor({ deucesHigh: true });
  eq(d.length, 52);
  ok(d.includes(D2) && !d.includes(P("2S")));
  eq(S.trickWinner([{ seat: 0, card: P("AS") }, { seat: 1, card: D2 }]), 1);
  const dj = S.deckFor({ jokers: true, deucesHigh: true });
  eq(dj.length, 52);
  ok(dj.includes(D2) && dj.includes(LJ) && dj.includes(BJ) && !dj.includes(P("2S")) && !dj.includes(P("2C")) && !dj.includes(P("2H")));
  eq(S.trickWinner([{ seat: 0, card: D2 }, { seat: 1, card: P("AS") }, { seat: 2, card: LJ }, { seat: 3, card: P("KS") }]), 2);
  eq(S.trickWinner([{ seat: 0, card: D2 }, { seat: 1, card: P("AS") }, { seat: 2, card: P("QS") }, { seat: 3, card: P("KS") }]), 0);
  eq(C.name(D2), "2♠");
  eq(C.sortCards([BJ, P("AS"), D2, LJ, P("2H")]), [P("AS"), D2, LJ, BJ, P("2H")], "high spades sort with spades, hearts after");
});

test("deal checks the deck matches the rules (no standard deck in a joker game)", () => {
  const g = S.newGame({ jokers: true });
  throws(() => S.apply(g, { type: "deal", deck: C.deck() }));
  const g2 = S.apply(g, { type: "deal", deck: C.shuffle(S.deckFor(g.opts), C.makeRng(2)) });
  eq(g2.hand.hands.flat().length, 52);
});

test("jokers + deuces: computers (every level) play legal cards; 13 tricks; high spades count as winners", () => {
  const rnd = C.makeRng(31);
  for (let k = 0; k < 6; k++) {
    const opts = { jokers: true, deucesHigh: k % 2 === 0 };
    const g = S.newGame(opts);
    g.dealer = k % 4;
    S.deal(g, null, C.shuffle(S.deckFor(opts), rnd));
    ok(g.hand.hands.every((x) => x.length === 13));
    while (g.hand.phase === "bid") { const s = g.hand.bidTurn; S.submitBid(g, s, SA.chooseBid(g, s, ["easy", "medium", "hard"][k % 3], rnd), false); }
    while (g.hand.phase === "play") {
      const s = g.hand.turn;
      const c = SA.chooseMove(g, s, ["easy", "medium", "hard"][(k + s) % 3], rnd);
      ok(S.legal(g.hand, s).includes(c));
      S.play(g, s, c);
    }
    eq(g.hand.tricks.reduce((a, b) => a + b, 0), 13);
  }
  // A hand holding both jokers counts them like the A♠ and K♠ in a normal deck.
  const side = [P("3C"), P("4C"), P("5D"), P("6D"), P("7D"), P("3H"), P("4H"), P("5H"), P("6H"), P("7H"), P("8H")];
  const jk = SA.countTricks(side.concat([LJ, BJ]), { jokers: true });
  const ak = SA.countTricks(side.concat([P("KS"), P("AS")]), {});
  ok(Math.abs(jk - ak) < 1e-9, "jokers " + jk + " vs A♠K♠ " + ak);
  ok(SA.countTricks(side.concat([P("KS"), P("AS")]), { jokers: true }) < ak, "A♠ and K♠ are worth less under two jokers");
});

test("medium sees the Big Joker as the boss spade (cashes it when the team needs tricks)", () => {
  const g = S.newGame({ jokers: true });
  S.deal(g, null, S.deckFor({ jokers: true }));
  const h = g.hand;
  h.phase = "play"; h.spadesBroken = true; h.trick = []; h.turn = 0; h.leader = 0;
  h.bids = [6, 3, 3, 3]; h.tricks = [0, 0, 0, 0];
  h.hands[0] = [P("AS"), BJ, P("3C")];
  eq(SA.mediumMove(h, 0), BJ);
  // With the Big Joker still out, the A♠ is not the boss: don't throw it away on a lead.
  h.hands[0] = [P("AS"), P("3C")];
  eq(SA.mediumMove(h, 0), P("3C"), "A♠ isn't boss while a joker is unseen");
});

test("minimum team bid 4: partner's bid sets the floor; no nil under a 3; first bidder is free", () => {
  const g = S.newGame({ minTeam: 4 });
  S.deal(g, C.makeRng(9));
  const first = g.hand.bidTurn;
  eq(S.allowedBids(g, first), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], "first of a team bids anything");
  S.submitBid(g, first, 2, false);
  S.submitBid(g, (first + 1) % 4, 0, false);
  const p = (first + 2) % 4;
  eq(S.allowedBids(g, p)[0], 2, "partner of a 2 must bid 2+");
  ok(!S.allowedBids(g, p).includes(0), "no nil: the team would bid 2");
  throws(() => S.submitBid(g, p, 1, false));
  S.submitBid(g, p, 2, false);
  const q = (first + 3) % 4;
  ok(S.allowedBids(g, q).every((b) => b >= 4), "partner of a nil bids 4+");
  const g2 = S.newGame({ minTeam: 4, blindNil: true, blindNilBehind: 0 });
  S.deal(g2, C.makeRng(10));
  const f2 = g2.hand.bidTurn;
  S.submitBid(g2, f2, 3, false);
  S.submitBid(g2, (f2 + 1) % 4, 3, false);
  eq(S.blindNilAllowed(g2, (f2 + 2) % 4), false, "no blind nil under a 3");
  const off = S.newGame({}); S.deal(off, C.makeRng(9));
  S.submitBid(off, off.hand.bidTurn, 1, false); S.submitBid(off, (off.hand.bidTurn), 1, false);
  ok(S.allowedBids(off, off.hand.bidTurn).includes(1), "rule off by default");
});

test("minimum team bid: computers always bid allowed amounts", () => {
  const rnd = C.makeRng(44);
  for (let k = 0; k < 9; k++) {
    const g = S.newGame({ minTeam: 4 });
    g.dealer = k % 4;
    S.deal(g, rnd);
    while (g.hand.phase === "bid") {
      const s = g.hand.bidTurn, lv = ["easy", "medium", "hard"][k % 3];
      const b = SA.chooseBid(g, s, lv, rnd);
      ok(S.allowedBids(g, s).includes(b), lv + " bid " + b);
      S.submitBid(g, s, b, false);
    }
    for (const t of [0, 1]) ok(g.hand.bids[t] + g.hand.bids[t + 2] >= 4);
  }
});
