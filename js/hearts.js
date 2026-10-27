/* hearts.js — the Hearts rules engine. Pure data in, pure data out; no DOM.
 * Seats: 0 = bottom (you), then clockwise to the left. With 4 players: 1 = left, 2 = across, 3 = right.
 * Play goes 0 -> 1 -> 2 -> ... (to the left).
 * Standard rules (see docs/rules-check.md for sources):
 *  - Pass 3 cards: left, right, across, keep, repeating.
 *  - The 2 of clubs leads the first trick.
 *  - No hearts or queen of spades on the first trick unless you hold nothing else.
 *  - Hearts can't be led until a heart has been played, unless you hold only hearts.
 *  - Each heart is 1 point, the queen of spades 13. Taking all 26 "shoots the moon":
 *    everyone else takes 26 instead.
 *  - The game ends when someone reaches 100; lowest score wins (a tie for lowest plays on).
 * Variants (opts): target 50/100, moon add/subtract/choice, jack of diamonds -10,
 * queen breaks hearts, points allowed on the first trick, passing cycle,
 * players 3/4/5 (Pagat: 3 drop the 2♦ and get 17 each; 5 drop the 2♦ and 2♣, get 10 each and the 3♣ leads;
 * with 3 or 5 there is no "across" pass), point cards: standard / Black Maria (A♠ 7, K♠ 10) / Spot (hearts at face value, Q♠ 25).
 *
 * Online-ready interface: apply(state, action) -> new state, view(state, seat) -> what that seat may see. */
(function (root) {
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./cards.js") : root.Cards;
  const { suit, rank, HEARTS, SPADES, DIAMONDS, CLUBS } = C;
  const QS = C.card(SPADES, 10);   // 36
  const KS = C.card(SPADES, 11);   // 37
  const AS = C.card(SPADES, 12);   // 38
  const JD = C.card(DIAMONDS, 9);  // 22
  const TWO_CLUBS = 0;
  const THREE_CLUBS = 1;
  const TWO_DIAMONDS = C.card(DIAMONDS, 0);   // 13
  // Pass directions by name; offsets depend on the number of players.
  const PASS_CYCLES = {
    cycle4: ["left", "right", "across", "keep"],
    cycle3: ["left", "right", "across"],
    left: ["left"],
    none: ["keep"],
  };
  const PASS_NAMES = { 1: "left", 3: "right", 2: "across", 0: "keep" };   // 4 players (kept for older callers)
  const DEFAULTS = { target: 100, moon: "add", jack: false, queenBreaks: false, bleed: false, passing: "cycle4", players: 4, points: "standard" };
  const REMOVED = { 3: [TWO_DIAMONDS], 4: [], 5: [TWO_DIAMONDS, TWO_CLUBS] };

  /** Penalty points (count toward the moon). The jack of diamonds is scored separately. */
  function points(c, scheme) {
    if (scheme === "spot") return c === QS ? 25 : suit(c) === HEARTS ? rank(c) + 2 : 0;
    if (scheme === "maria") return c === QS ? 13 : c === KS ? 10 : c === AS ? 7 : suit(c) === HEARTS ? 1 : 0;
    return c === QS ? 13 : suit(c) === HEARTS ? 1 : 0;
  }
  /** "Point card" for the first-trick and lead rules: hearts and the Q♠ in every scheme. */
  const isPoint = (c) => c === QS || suit(c) === HEARTS;
  const TOTALS = { standard: 26, maria: 43, spot: 129 };
  const totalPoints = (scheme) => TOTALS[scheme] || 26;

  function passOffsetOf(name, n) {
    if (name === "left") return 1;
    if (name === "right") return n - 1;
    if (name === "across") return n === 4 ? 2 : 0;
    return 0;
  }
  function passName(offset, n) {
    n = n || 4;
    if (!offset) return "keep";
    if (offset === 1) return "left";
    if (offset === n - 1) return "right";
    return "across";
  }

  function newGame(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (![3, 4, 5].includes(o.players)) o.players = 4;
    if (!TOTALS[o.points]) o.points = "standard";
    return {
      kind: "hearts",
      opts: o,
      scores: new Array(o.players).fill(0),
      handNo: 0,
      hand: null,
      history: [],
      over: false,
      winners: null,
    };
  }

  function passOffsetFor(game) {
    const n = game.opts.players || 4;
    let cyc = PASS_CYCLES[game.opts.passing] || PASS_CYCLES.cycle4;
    if (n !== 4) cyc = cyc.filter((x) => x !== "across");
    return passOffsetOf(cyc[game.handNo % cyc.length], n);
  }

  const fill = (n, v) => Array.from({ length: n }, () => (typeof v === "function" ? v() : v));

  function emptyHand(hands, passOffset, opts) {
    const n = hands.length;
    return {
      hands,
      start: hands.map((h) => h.slice()),
      passOffset,
      passes: fill(n, null),
      received: fill(n, null),
      phase: passOffset ? "pass" : "play",
      trick: [],          // [{seat, card}]
      leader: -1,
      turn: -1,
      trickNo: 0,
      tricksTotal: hands[0].length,
      scheme: (opts && opts.points) || "standard",
      taken: fill(n, 0),        // penalty points taken this hand
      jackBy: -1,               // who took the jack of diamonds (variant)
      tricksWon: fill(n, 0),
      heartsBroken: false,
      queenBreaks: !!(opts && opts.queenBreaks),
      bleed: !!(opts && opts.bleed),
      played: new Array(52).fill(0),
      plays: [],          // [{seat, card, trickNo}]
      voids: fill(n, () => [false, false, false, false]),
      lastTrick: null,
      result: null,
    };
  }

  /** Deal a new hand. `cards` (optional) is a 52-card order (used online and in tests);
   *  with 3 or 5 players the removed twos are taken out of it first. */
  function deal(game, rnd, cards) {
    const n = game.opts.players || 4;
    const out = new Set(REMOVED[n] || []);
    const d = (cards ? cards.slice() : C.shuffle(C.deck(), rnd)).filter((c) => !out.has(c));
    const per = d.length / n;
    const hands = fill(n, 0).map((_, i) => C.sortCards(d.slice(i * per, i * per + per)));
    game.hand = emptyHand(hands, passOffsetFor(game), game.opts);
    if (game.hand.phase === "play") startPlay(game.hand);
    return game.hand;
  }

  /** The lowest club in play leads: the 2♣, or the 3♣ when the 2♣ is out of the deck. */
  function firstLead(h) {
    for (const c of [TWO_CLUBS, THREE_CLUBS]) for (let s = 0; s < h.hands.length; s++) if (h.hands[s].includes(c)) return { seat: s, card: c };
    return { seat: 0, card: -1 };
  }

  function startPlay(h) {
    h.phase = "play";
    const f = firstLead(h);
    h.leader = f.seat; h.turn = f.seat; h.leadCard = f.card;
  }

  function submitPass(game, seat, cards) {
    const h = game.hand;
    const n = h ? h.hands.length : 4;
    if (!h || h.phase !== "pass") throw new Error("not passing now");
    if (h.passes[seat]) throw new Error("already passed");
    if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3) throw new Error("pass exactly 3 cards");
    for (const c of cards) if (!h.hands[seat].includes(c)) throw new Error("card not in hand");
    h.passes[seat] = cards.slice();
    if (h.passes.every((p) => p)) {
      for (let s = 0; s < n; s++) h.hands[s] = h.hands[s].filter((c) => !h.passes[s].includes(c));
      for (let s = 0; s < n; s++) {
        const to = (s + h.passOffset) % n;
        h.received[to] = h.passes[s].slice();
        h.hands[to] = C.sortCards(h.hands[to].concat(h.passes[s]));
      }
      startPlay(h);
    }
  }

  function legal(h, seat) {
    const hand = h.hands[seat];
    if (!hand.length) return [];
    if (h.trick.length === 0) {
      if (h.trickNo === 0) {
        const lc = h.leadCard != null && h.leadCard >= 0 ? h.leadCard : TWO_CLUBS;
        return hand.includes(lc) ? [lc] : hand.slice();
      }
      if (!h.heartsBroken) {
        const non = hand.filter((c) => suit(c) !== HEARTS);
        if (non.length) return non;
      }
      return hand.slice();
    }
    const led = suit(h.trick[0].card);
    const follow = hand.filter((c) => suit(c) === led);
    if (follow.length) return follow;
    if (h.trickNo === 0 && !h.bleed) {
      const safe = hand.filter((c) => !isPoint(c));
      if (safe.length) return safe;
      // Only point cards left: a heart may go before the queen.
      const hearts = hand.filter((c) => suit(c) === HEARTS);
      if (hearts.length) return hearts;
    }
    return hand.slice();
  }

  function trickWinner(trick) {
    const led = suit(trick[0].card);
    let best = trick[0];
    for (const t of trick) if (suit(t.card) === led && rank(t.card) > rank(best.card)) best = t;
    return best.seat;
  }

  /** Play a card. Returns {trickDone, winner, points, handDone}. Throws on an illegal play. */
  function play(game, seat, card) {
    const h = game.hand;
    if (!h || h.phase !== "play") throw new Error("not playing now");
    if (seat !== h.turn) throw new Error("not your turn");
    if (!legal(h, seat).includes(card)) throw new Error("illegal card " + C.name(card));
    const r = playRaw(h, seat, card);
    if (r.handDone) finishHand(game);
    return r;
  }

  /** The play itself, shared with the computer's look-ahead (no checks, no scoring). */
  function playRaw(h, seat, card) {
    const n = h.hands.length;
    const hand = h.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    if (h.trick.length) {
      const led = suit(h.trick[0].card);
      if (suit(card) !== led) h.voids[seat][led] = true;
    }
    if (suit(card) === HEARTS || (card === QS && h.queenBreaks)) h.heartsBroken = true;
    h.trick.push({ seat, card });
    h.played[card] = 1;
    if (h.plays) h.plays.push({ seat, card, trickNo: h.trickNo });
    h.turn = (seat + 1) % n;
    if (h.trick.length < n) return { trickDone: false };
    const winner = trickWinner(h.trick);
    let pts = 0;
    for (const t of h.trick) { pts += points(t.card, h.scheme); if (t.card === JD) h.jackBy = winner; }
    h.taken[winner] += pts;
    h.tricksWon[winner]++;
    h.lastTrick = { cards: h.trick, winner, points: pts };
    h.trick = [];
    h.trickNo++;
    h.leader = winner;
    h.turn = winner;
    return { trickDone: true, winner, points: pts, handDone: h.trickNo === (h.tricksTotal || 13) };
  }

  /**
   * Points each seat scores for a finished hand.
   * moonRule: "add" (others +total), "subtract" (shooter -total), "choice" (shooter picks; we pick
   * "subtract" only when adding would end the game with the shooter not winning).
   * jackBy: seat that took the jack of diamonds when that variant is on, else -1.
   * total: penalty points in the deck (26 standard, 43 Black Maria, 129 Spot).
   */
  function handPoints(taken, moonRule, jackBy, scoresBefore, target, total) {
    const n = taken.length;   // 3-5 at the table; the scorekeeper also handles 6 players
    const T = total || 26;
    const pts = taken.slice();
    const moonBy = taken.indexOf(T);
    let moonHow = null;
    if (moonBy >= 0) {
      let how = moonRule === "subtract" ? "subtract" : "add";
      if (moonRule === "choice" && scoresBefore) {
        const after = scoresBefore.map((sc, i) => sc + (i === moonBy ? 0 : T));
        const ends = Math.max(...after) >= (target || 100);
        const low = Math.min(...after);
        if (ends && after[moonBy] !== low) how = "subtract";
      }
      for (let s = 0; s < n; s++) pts[s] = how === "subtract" ? (s === moonBy ? -T : 0) : (s === moonBy ? 0 : T);
      moonHow = how;
    }
    if (jackBy >= 0) pts[jackBy] -= 10;
    return { pts, moonBy, moonHow };
  }

  function finishHand(game) {
    const h = game.hand;
    const n = game.scores.length;
    const r = handPoints(h.taken, game.opts.moon, game.opts.jack ? h.jackBy : -1, game.scores, game.opts.target, totalPoints(game.opts.points));
    for (let s = 0; s < n; s++) game.scores[s] += r.pts[s];
    h.result = r;
    h.phase = "done";
    game.history.push({ pts: r.pts, moonBy: r.moonBy, jackBy: game.opts.jack ? h.jackBy : -1 });
    game.handNo++;
    if (Math.max(...game.scores) >= game.opts.target) {
      // Lowest score wins; a tie for lowest plays more hands until one player is ahead (Pagat).
      const low = Math.min(...game.scores);
      const winners = game.scores.map((_, s) => s).filter((s) => game.scores[s] === low);
      if (winners.length === 1) { game.over = true; game.winners = winners; }
    }
  }

  // ------------------------------------------------- online-ready interface
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /**
   * apply(state, action) -> new state (the input is never changed).
   * Actions: {type:"new", opts} · {type:"deal", deck:[52 cards]} · {type:"pass", seat, cards:[3]}
   *          · {type:"play", seat, card}. Throws on anything illegal.
   */
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
      case "pass": submitPass(g, action.seat, action.cards); return g;
      case "play": play(g, action.seat, action.card); return g;
      default: throw new Error("unknown action " + action.type);
    }
  }

  /** What `seat` is allowed to see: other hands become face-down counts. */
  function view(state, seat) {
    const g = clone(state);
    const h = g.hand;
    if (!h) return g;
    for (let s = 0; s < h.hands.length; s++) {
      if (s === seat) continue;
      h.hands[s] = h.hands[s].map(() => null);
      h.start[s] = null;
      if (h.passes[s]) h.passes[s] = h.phase === "pass" ? true : null;
      if (h.received[s] && s !== seat) h.received[s] = null;
    }
    // You know the cards you passed (they're in passes[seat]); everything else stays hidden.
    return g;
  }

  /** Whose move is it? Returns {seat, kind:"pass"|"play"} or null. */
  function toAct(state) {
    const h = state.hand;
    if (!h || state.over) return null;
    if (h.phase === "pass") {
      const seats = h.passes.map((_, s) => s).filter((s) => !h.passes[s]);
      return { seats, kind: "pass" };
    }
    if (h.phase === "play") return { seats: [h.turn], kind: "play" };
    return null;
  }

  const api = {
    QS, KS, AS, JD, TWO_CLUBS, THREE_CLUBS, TWO_DIAMONDS, PASS_CYCLES, PASS_NAMES, DEFAULTS, REMOVED, points, isPoint, totalPoints, passName,
    newGame, deal, submitPass, legal, play, playRaw, trickWinner, handPoints, finishHand, startPlay,
    apply, view, toAct, passOffsetFor,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hearts = api;
})(typeof self !== "undefined" ? self : globalThis);
