/* net-games.js — Hearts and Spades wrapped in the shape the shared online layer
 * (Board and Card Games/_online/online.js) expects: setup / toAct / apply / publicView /
 * privateView / bot / isOver. The rules stay in hearts.js and spades.js; this file only adapts.
 * State = { g: the engine's game, humans: [seat, ...], level }.
 * Between hands any person at the table can press "Next hand" (action {type:"next"}). */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const C = isNode ? require("./cards.js") : root.Cards;
  const H = isNode ? require("./hearts.js") : root.Hearts;
  const HA = isNode ? require("./hearts-ai.js") : root.HeartsAI;
  const Sp = isNode ? require("./spades.js") : root.Spades;
  const SA = isNode ? require("./spades-ai.js") : root.SpadesAI;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const deckFrom = (rng) => C.shuffle(C.deck(), rng);
  const LEVELS = ["easy", "medium", "hard"];

  function base(engine) {
    return {
      minSeats: 4, maxSeats: 4,
      isOver: (s) => !!s.g.over,
      toAct(s) {
        const g = s.g;
        if (g.over) return [];
        if (!g.hand || g.hand.phase === "done") return s.humans.slice();
        const a = engine.toAct(g);
        return a ? a.seats.slice() : [];
      },
      // Who sits where, for the hand-over table.
      names: (s) => s.names,
    };
  }

  // ------------------------------------------------------------------ Hearts
  const hearts = Object.assign(base(H), {
    id: "hearts",
    setup(n, options, rng, seats) {
      const o = options || {};
      const g = H.apply(null, { type: "new", opts: { target: o.target, moon: o.moon, jack: o.jack, queenBreaks: o.queenBreaks, bleed: o.bleed, passing: o.passing } });
      const s = { g: H.apply(g, { type: "deal", deck: deckFrom(rng) }), humans: seats.map((x, i) => (x.kind === "human" ? i : -1)).filter((i) => i >= 0), names: seats.map((x) => x.name), level: LEVELS.includes(o.level) ? o.level : "medium" };
      return s;
    },
    apply(s, seat, a, rng) {
      if (!a || typeof a !== "object") throw new Error("bad move");
      if (a.type === "next") {
        if (!s.g.hand || s.g.hand.phase !== "done") throw new Error("hand still going");
        s.g = H.apply(s.g, { type: "deal", deck: deckFrom(rng) });
      } else if (a.type === "pass") s.g = H.apply(s.g, { type: "pass", seat, cards: a.cards });
      else if (a.type === "play") s.g = H.apply(s.g, { type: "play", seat, card: a.card });
      else throw new Error("unknown move");
      return s;
    },
    /** Everyone sees the table: scores, tricks, counts, who has passed — never a hand. */
    publicView(s) {
      const g = H.view(s.g, -1);
      const h = g.hand;
      if (h) {
        h.counts = s.g.hand.hands.map((x) => x.length);
        h.hands = [[], [], [], []];
        // Once a hand is over every card has been seen; show who started with what.
        if (h.phase === "done") h.start = clone(s.g.hand.start);
      }
      return { g, names: s.names, humans: s.humans, level: s.level };
    },
    /** Only this seat's secrets: its hand, what it passed and what it got. */
    privateView(s, seat) {
      const h = s.g.hand;
      if (!h) return { seat };
      return { seat, hand: h.hands[seat].slice(), passed: h.passes[seat] ? h.passes[seat].slice() : null, received: h.received[seat] ? h.received[seat].slice() : null, start: h.start ? h.start[seat] : null };
    },
    bot(ctx, seat, rng) {
      const g = merge("hearts", ctx.pub, ctx.mine);
      const h = g.hand;
      if (h.phase === "done") return { type: "next" };
      if (h.phase === "pass") return { type: "pass", cards: HA.choosePass(h.hands[seat], ctx.pub.level, rng) };
      return { type: "play", card: HA.chooseMove(h, seat, ctx.pub.level, rng, g.opts) };
    },
  });

  // ------------------------------------------------------------------ Spades
  const spades = Object.assign(base(Sp), {
    id: "spades",
    setup(n, options, rng, seats) {
      const o = options || {};
      const keys = ["target", "nil", "blindNil", "blindNilBehind", "bagLimit", "bagPenalty", "nilCounts", "spadesLead", "loseAt", "firstLead"];
      const opts = {};
      for (const k of keys) if (o[k] !== undefined) opts[k] = o[k];
      const g = Sp.apply(null, { type: "new", opts });
      return { g: Sp.apply(g, { type: "deal", deck: deckFrom(rng) }), humans: seats.map((x, i) => (x.kind === "human" ? i : -1)).filter((i) => i >= 0), names: seats.map((x) => x.name), level: LEVELS.includes(o.level) ? o.level : "medium" };
    },
    apply(s, seat, a, rng) {
      if (!a || typeof a !== "object") throw new Error("bad move");
      if (a.type === "next") {
        if (!s.g.hand || s.g.hand.phase !== "done") throw new Error("hand still going");
        s.g = Sp.apply(s.g, { type: "deal", deck: deckFrom(rng) });
      } else if (a.type === "bid") s.g = Sp.apply(s.g, { type: "bid", seat, bid: a.bid, blind: !!a.blind });
      else if (a.type === "exchange") s.g = Sp.apply(s.g, { type: "exchange", seat, cards: a.cards });
      else if (a.type === "play") s.g = Sp.apply(s.g, { type: "play", seat, card: a.card });
      else throw new Error("unknown move");
      return s;
    },
    publicView(s) {
      const g = Sp.view(s.g, -1);
      if (g.hand) { g.hand.counts = s.g.hand.hands.map((x) => x.length); g.hand.hands = [[], [], [], []]; }
      return { g, names: s.names, humans: s.humans, level: s.level };
    },
    privateView(s, seat) {
      const h = s.g.hand;
      if (!h) return { seat };
      const out = { seat, hand: h.hands[seat].slice() };
      const x = h.exchange;
      if (x && (seat === x.nilSeat || seat === (x.nilSeat + 2) % 4)) out.exchange = { given: x.given || null, back: x.back || null };
      return out;
    },
    bot(ctx, seat, rng) {
      const g = merge("spades", ctx.pub, ctx.mine);
      const h = g.hand;
      const lv = ctx.pub.level;
      if (h.phase === "done") return { type: "next" };
      if (h.phase === "bid") return { type: "bid", bid: SA.chooseBid(g, seat, lv, rng), blind: false };
      if (h.phase === "exchange") return { type: "exchange", cards: SA.chooseExchange(h.hands[seat], seat === h.exchange.nilSeat) };
      return { type: "play", card: SA.chooseMove(g, seat, lv, rng) };
    },
  });

  /** Rebuild the engine's game as one seat sees it: the public table plus that seat's own cards.
   *  Other hands are arrays of nulls of the right length, exactly like Hearts.view / Spades.view. */
  function merge(kind, pub, mine) {
    const g = clone(pub.g);
    const h = g.hand;
    if (!h) return g;
    const seat = mine && typeof mine.seat === "number" ? mine.seat : -1;
    const counts = h.counts || [13, 13, 13, 13];
    h.hands = [0, 1, 2, 3].map((s) => (s === seat && mine.hand ? mine.hand.slice() : new Array(counts[s]).fill(null)));
    delete h.counts;
    if (kind === "hearts" && seat >= 0) {
      if (!h.passes) h.passes = [null, null, null, null];
      if (mine.passed) h.passes[seat] = mine.passed.slice();
      if (!h.received) h.received = [null, null, null, null];
      if (mine.received) h.received[seat] = mine.received.slice();
      if (h.phase !== "done") { h.start = h.start || [null, null, null, null]; h.start[seat] = mine.start; }
    }
    if (kind === "spades" && seat >= 0 && h.exchange && mine.exchange) Object.assign(h.exchange, mine.exchange);
    return g;
  }

  const api = { hearts, spades, merge };
  if (isNode) module.exports = api;
  else root.NetGames = api;
})(typeof self !== "undefined" ? self : globalThis);
