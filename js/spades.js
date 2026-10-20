/* spades.js — the partnership Spades rules engine. Pure data; no DOM.
 * Seats: 0 = you (bottom), 1 = left, 2 = partner (across), 3 = right. Teams: 0 & 2 ("Us"), 1 & 3 ("Them").
 * Standard rules (sources in docs/rules-check.md):
 *  - Dealer rotates to the left. Bidding starts left of the dealer; each player bids 0-13 tricks,
 *    0 being "nil" (take no tricks). The player left of the dealer leads any card.
 *  - Follow suit if you can; spades always trump. Spades can't be led until one has been
 *    played (broken), unless you hold only spades.
 *  - A team that makes its combined bid scores 10 a trick bid plus 1 a trick over (a "bag");
 *    falling short loses 10 a trick bid. Every 10 bags costs 100 points.
 *  - Nil: +100 if the bidder takes no tricks, -100 if they take any. Their tricks don't count
 *    toward their partner's bid; they count as bags.
 *  - Blind nil (optional): bid before looking at your cards; +/-200. You then pass your
 *    partner 2 cards face down and your partner passes 2 back (Pagat).
 *  - First team to 500 wins; if both pass it on the same hand, the higher score wins.
 * Online-ready interface: apply(state, action) / view(state, seat). */
(function (root) {
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./cards.js") : root.Cards;
  const { suit, rank, SPADES } = C;
  const DEFAULTS = {
    target: 500, nil: true, blindNil: false, blindNilBehind: 100, bagLimit: 10, bagPenalty: 100,
    nilCounts: false, spadesLead: "broken", loseAt: 0, firstLead: "left",
  };
  const team = (s) => s % 2;

  function newGame(opts) {
    return {
      kind: "spades",
      opts: Object.assign({}, DEFAULTS, opts || {}),
      scores: [0, 0],
      bags: [0, 0],
      handNo: 0,
      dealer: 3,        // first hand: you are left of the dealer, so you bid and lead first
      hand: null,
      history: [],
      over: false,
      winner: -1,
    };
  }

  function deal(game, rnd, cards) {
    const d = cards ? cards.slice() : C.shuffle(C.deck(), rnd);
    const hands = [0, 1, 2, 3].map((i) => C.sortCards(d.slice(i * 13, i * 13 + 13)));
    const first = (game.dealer + 1) % 4;
    game.hand = {
      hands,
      dealer: game.dealer,
      bids: [null, null, null, null],
      blind: [false, false, false, false],
      phase: "bid",
      bidTurn: first,
      exchange: null,     // {nilSeat, step:"nil"|"partner"|"done", given, back}
      trick: [], leader: -1, turn: -1, trickNo: 0,
      tricks: [0, 0, 0, 0],
      spadesBroken: false,
      spadesLead: game.opts.spadesLead,
      played: new Array(52).fill(0),
      plays: [],
      voids: [[false, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]],
      lastTrick: null,
      result: null,
    };
    return game.hand;
  }

  /** May `seat` bid blind nil right now? */
  function blindNilAllowed(game, seat) {
    if (!game.opts.blindNil || !game.opts.nil) return false;
    const t = team(seat);
    return game.scores[1 - t] - game.scores[t] >= (game.opts.blindNilBehind || 0);
  }

  function submitBid(game, seat, bid, blind) {
    const h = game.hand;
    if (!h || h.phase !== "bid") throw new Error("not bidding now");
    if (seat !== h.bidTurn) throw new Error("not your bid");
    if (!Number.isInteger(bid) || bid < 0 || bid > 13) throw new Error("bid 0-13");
    if (bid === 0 && !game.opts.nil) throw new Error("nil is off");
    if (blind && (bid !== 0 || !blindNilAllowed(game, seat))) throw new Error("blind nil not allowed");
    h.bids[seat] = bid;
    h.blind[seat] = !!blind;
    h.bidTurn = (seat + 1) % 4;
    if (h.bids.every((b) => b !== null)) {
      const bn = [0, 1, 2, 3].find((s) => h.blind[s]);
      if (bn !== undefined && h.bids[(bn + 2) % 4] !== null && !h.blind[(bn + 2) % 4]) {
        h.phase = "exchange";
        h.exchange = { nilSeat: bn, step: "nil" };
      } else startPlay(game);
    }
  }

  /** Blind nil card swap: the blind nil bidder gives partner 2 cards, then partner gives 2 back. */
  function submitExchange(game, seat, cards) {
    const h = game.hand;
    if (!h || h.phase !== "exchange") throw new Error("no exchange now");
    const x = h.exchange;
    const from = x.step === "nil" ? x.nilSeat : (x.nilSeat + 2) % 4;
    if (seat !== from) throw new Error("not your exchange");
    if (!Array.isArray(cards) || cards.length !== 2 || cards[0] === cards[1]) throw new Error("give exactly 2 cards");
    for (const c of cards) if (!h.hands[seat].includes(c)) throw new Error("card not in hand");
    const to = (seat + 2) % 4;
    h.hands[seat] = h.hands[seat].filter((c) => !cards.includes(c));
    h.hands[to] = C.sortCards(h.hands[to].concat(cards));
    if (x.step === "nil") { x.given = cards.slice(); x.step = "partner"; }
    else { x.back = cards.slice(); x.step = "done"; startPlay(game); }
  }

  function startPlay(game) {
    const h = game.hand;
    h.phase = "play";
    let lead = (h.dealer + 1) % 4;
    if (game.opts.firstLead === "2c") for (let s = 0; s < 4; s++) if (h.hands[s].includes(0)) lead = s;
    h.leader = lead;
    h.turn = lead;
    h.firstLead2c = game.opts.firstLead === "2c";
  }

  function legal(h, seat) {
    const hand = h.hands[seat];
    if (!hand.length) return [];
    if (h.trick.length === 0) {
      if (h.trickNo === 0 && h.firstLead2c && hand.includes(0)) return [0];
      if (!h.spadesBroken && h.spadesLead !== "any") {
        const non = hand.filter((c) => suit(c) !== SPADES);
        if (non.length) return non;
      }
      return hand.slice();
    }
    const led = suit(h.trick[0].card);
    const follow = hand.filter((c) => suit(c) === led);
    return follow.length ? follow : hand.slice();
  }

  function trickWinner(trick) {
    let best = trick[0];
    for (const t of trick) {
      const bs = suit(best.card), ts = suit(t.card);
      if (ts === bs) { if (rank(t.card) > rank(best.card)) best = t; }
      else if (ts === SPADES) best = t;
    }
    return best.seat;
  }

  function playRaw(h, seat, card) {
    const hand = h.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    if (h.trick.length) {
      const led = suit(h.trick[0].card);
      if (suit(card) !== led) h.voids[seat][led] = true;
    }
    if (suit(card) === SPADES) h.spadesBroken = true;
    h.trick.push({ seat, card });
    h.played[card] = 1;
    if (h.plays) h.plays.push({ seat, card, trickNo: h.trickNo });
    h.turn = (seat + 1) % 4;
    if (h.trick.length < 4) return { trickDone: false };
    const winner = trickWinner(h.trick);
    h.tricks[winner]++;
    h.lastTrick = { cards: h.trick, winner };
    h.trick = [];
    h.trickNo++;
    h.leader = winner;
    h.turn = winner;
    return { trickDone: true, winner, handDone: h.trickNo === 13 };
  }

  function play(game, seat, card) {
    const h = game.hand;
    if (!h || h.phase !== "play") throw new Error("not playing now");
    if (seat !== h.turn) throw new Error("not your turn");
    if (!legal(h, seat).includes(card)) throw new Error("illegal card " + C.name(card));
    const r = playRaw(h, seat, card);
    if (r.handDone) finishHand(game);
    return r;
  }

  /**
   * Score one team's hand. The single scoring function — the game, the computer's
   * look-ahead and the real-table scorekeeper all call this.
   *  bids[2], blind[2], tricks[2] for the team's two players; bagsBefore = team bags so far.
   * Returns {points, bagsAdded, bagsAfter, penalty, parts:[{label, pts}]}.
   */
  function scoreTeam(bids, blind, tricks, bagsBefore, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const parts = [];
    let pts = 0, bags = 0, contract = 0, made = 0, nilTricks = 0;
    for (let i = 0; i < 2; i++) {
      if (bids[i] === 0) {
        const v = blind[i] ? 200 : 100;
        const ok = tricks[i] === 0;
        pts += ok ? v : -v;
        parts.push({ label: (blind[i] ? "Blind nil " : "Nil ") + (ok ? "made" : "failed"), pts: ok ? v : -v });
        if (opts.nilCounts) made += tricks[i]; else nilTricks += tricks[i];
      } else {
        contract += bids[i];
        made += tricks[i];
      }
    }
    if (contract > 0) {
      if (made >= contract) {
        pts += 10 * contract + (made - contract);
        bags += made - contract;
        parts.push({ label: "Bid " + contract + " made", pts: 10 * contract });
        if (made > contract) parts.push({ label: (made - contract) + " over", pts: made - contract });
      } else {
        pts -= 10 * contract;
        parts.push({ label: "Bid " + contract + " set", pts: -10 * contract });
      }
    } else nilTricks += made;   // both bid nil: every trick is a bag
    // A nil bidder's tricks don't help the partner's bid; each is a bag worth 1.
    if (nilTricks > 0) {
      pts += nilTricks; bags += nilTricks;
      parts.push({ label: nilTricks + " nil bag" + (nilTricks > 1 ? "s" : ""), pts: nilTricks });
    }
    let after = bagsBefore + bags, penalty = 0;
    if (opts.bagLimit > 0) {
      while (after >= opts.bagLimit) {
        after -= opts.bagLimit;
        penalty += opts.bagPenalty;
      }
      if (penalty) { pts -= penalty; parts.push({ label: "Bag penalty", pts: -penalty }); }
    }
    return { points: pts, bagsAdded: bags, bagsAfter: opts.bagLimit > 0 ? after : bagsBefore + bags, penalty, parts };
  }

  function finishHand(game) {
    const h = game.hand;
    const res = [0, 1].map((t) => scoreTeam(
      [h.bids[t], h.bids[t + 2]], [h.blind[t], h.blind[t + 2]], [h.tricks[t], h.tricks[t + 2]],
      game.bags[t], game.opts));
    for (let t = 0; t < 2; t++) { game.scores[t] += res[t].points; game.bags[t] = res[t].bagsAfter; }
    h.result = res;
    h.phase = "done";
    game.history.push({ bids: h.bids.slice(), blind: h.blind.slice(), tricks: h.tricks.slice(), pts: res.map((r) => r.points), scores: game.scores.slice() });
    game.handNo++;
    game.dealer = (game.dealer + 1) % 4;
    const [a, b] = game.scores, T = game.opts.target;
    const lose = game.opts.loseAt;
    if (a >= T || b >= T) {
      if (a !== b) { game.over = true; game.winner = a > b ? 0 : 1; }
    } else if (lose && (a <= -lose || b <= -lose)) {
      game.over = true; game.winner = a <= -lose ? 1 : 0;
      if (a <= -lose && b <= -lose) game.winner = a > b ? 0 : 1;
    }
  }

  // ------------------------------------------------- online-ready interface
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /** Actions: new · deal{deck} · bid{seat,bid,blind} · exchange{seat,cards:[2]} · play{seat,card}. */
  function apply(state, action) {
    if (action.type === "new") return newGame(action.opts);
    const g = clone(state);
    switch (action.type) {
      case "deal":
        if (g.over) throw new Error("game over");
        if (g.hand && g.hand.phase !== "done") throw new Error("hand in progress");
        if (!Array.isArray(action.deck) || action.deck.length !== 52 || new Set(action.deck).size !== 52) throw new Error("bad deck");
        deal(g, null, action.deck);
        return g;
      case "bid": submitBid(g, action.seat, action.bid, action.blind); return g;
      case "exchange": submitExchange(g, action.seat, action.cards); return g;
      case "play": play(g, action.seat, action.card); return g;
      default: throw new Error("unknown action " + action.type);
    }
  }

  function view(state, seat) {
    const g = clone(state);
    const h = g.hand;
    if (!h) return g;
    for (let s = 0; s < 4; s++) if (s !== seat) h.hands[s] = h.hands[s].map(() => null);
    if (h.exchange) {
      const x = h.exchange, partner = (x.nilSeat + 2) % 4;
      if (seat !== x.nilSeat && seat !== partner) { delete x.given; delete x.back; }
    }
    return g;
  }

  function toAct(state) {
    const h = state.hand;
    if (!h || state.over) return null;
    if (h.phase === "bid") return { seats: [h.bidTurn], kind: "bid" };
    if (h.phase === "exchange") {
      const x = h.exchange;
      return { seats: [x.step === "nil" ? x.nilSeat : (x.nilSeat + 2) % 4], kind: "exchange" };
    }
    if (h.phase === "play") return { seats: [h.turn], kind: "play" };
    return null;
  }

  const api = {
    DEFAULTS, team, newGame, deal, submitBid, submitExchange, blindNilAllowed, startPlay,
    legal, trickWinner, playRaw, play, scoreTeam, finishHand, apply, view, toAct,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Spades = api;
})(typeof self !== "undefined" ? self : globalThis);
