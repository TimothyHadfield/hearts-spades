/* hearts.js — the Hearts rules engine. Pure data in, pure data out; no DOM.
 * Seats: 0 = bottom (you), 1 = left, 2 = across, 3 = right. Play goes 0 -> 1 -> 2 -> 3 (to the left).
 * Standard rules (see docs/rules-check.md for sources):
 *  - Pass 3 cards: left, right, across, keep, repeating.
 *  - The 2 of clubs leads the first trick.
 *  - No hearts or queen of spades on the first trick unless you hold nothing else.
 *  - Hearts can't be led until a heart has been played, unless you hold only hearts.
 *  - Each heart is 1 point, the queen of spades 13. Taking all 26 "shoots the moon":
 *    everyone else takes 26 instead.
 *  - The game ends when someone reaches 100; lowest score wins (a tie for lowest plays on).
 * Variants (opts): target 50/100, moon add/subtract/choice, jack of diamonds -10,
 * queen breaks hearts, points allowed on the first trick, passing cycle.
 *
 * Online-ready interface: apply(state, action) -> new state, view(state, seat) -> what that seat may see. */
(function (root) {
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./cards.js") : root.Cards;
  const { suit, rank, HEARTS, SPADES, DIAMONDS } = C;
  const QS = C.card(SPADES, 10);   // 36
  const JD = C.card(DIAMONDS, 9);  // 22
  const TWO_CLUBS = 0;
  const PASS_CYCLES = {
    cycle4: [1, 3, 2, 0],   // left, right, across, keep
    cycle3: [1, 3, 2],      // left, right, across
    left: [1],
    none: [0],
  };
  const PASS_NAMES = { 1: "left", 3: "right", 2: "across", 0: "keep" };
  const DEFAULTS = { target: 100, moon: "add", jack: false, queenBreaks: false, bleed: false, passing: "cycle4" };

  /** Penalty points (count toward the moon). The jack of diamonds is scored separately. */
  const points = (c) => (c === QS ? 13 : suit(c) === HEARTS ? 1 : 0);
  const isPoint = (c) => points(c) > 0;

  function newGame(opts) {
    return {
      kind: "hearts",
      opts: Object.assign({}, DEFAULTS, opts || {}),
      scores: [0, 0, 0, 0],
      handNo: 0,
      hand: null,
      history: [],
      over: false,
      winners: null,
    };
  }

  function passOffsetFor(game) {
    const cyc = PASS_CYCLES[game.opts.passing] || PASS_CYCLES.cycle4;
    return cyc[game.handNo % cyc.length];
  }

  function emptyHand(hands, passOffset, opts) {
    return {
      hands,
      start: hands.map((h) => h.slice()),
      passOffset,
      passes: [null, null, null, null],
      received: [null, null, null, null],
      phase: passOffset ? "pass" : "play",
      trick: [],          // [{seat, card}]
      leader: -1,
      turn: -1,
      trickNo: 0,
      taken: [0, 0, 0, 0],      // penalty points taken this hand
      jackBy: -1,               // who took the jack of diamonds (variant)
      tricksWon: [0, 0, 0, 0],
      heartsBroken: false,
      queenBreaks: !!(opts && opts.queenBreaks),
      bleed: !!(opts && opts.bleed),
      played: new Array(52).fill(0),
      plays: [],          // [{seat, card, trickNo}]
      voids: [[false, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false]],
      lastTrick: null,
      result: null,
    };
  }

  /** Deal a new hand. `cards` (optional) is a 52-card order (used online and in tests). */
  function deal(game, rnd, cards) {
    const d = cards ? cards.slice() : C.shuffle(C.deck(), rnd);
    const hands = [0, 1, 2, 3].map((i) => C.sortCards(d.slice(i * 13, i * 13 + 13)));
    game.hand = emptyHand(hands, passOffsetFor(game), game.opts);
    if (game.hand.phase === "play") startPlay(game.hand);
    return game.hand;
  }

  function startPlay(h) {
    h.phase = "play";
    for (let s = 0; s < 4; s++) if (h.hands[s].includes(TWO_CLUBS)) { h.leader = s; h.turn = s; }
  }

  function submitPass(game, seat, cards) {
    const h = game.hand;
    if (!h || h.phase !== "pass") throw new Error("not passing now");
    if (h.passes[seat]) throw new Error("already passed");
    if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3) throw new Error("pass exactly 3 cards");
    for (const c of cards) if (!h.hands[seat].includes(c)) throw new Error("card not in hand");
    h.passes[seat] = cards.slice();
    if (h.passes.every((p) => p)) {
      for (let s = 0; s < 4; s++) h.hands[s] = h.hands[s].filter((c) => !h.passes[s].includes(c));
      for (let s = 0; s < 4; s++) {
        const to = (s + h.passOffset) % 4;
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
      if (h.trickNo === 0) return hand.includes(TWO_CLUBS) ? [TWO_CLUBS] : hand.slice();
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
    h.turn = (seat + 1) % 4;
    if (h.trick.length < 4) return { trickDone: false };
    const winner = trickWinner(h.trick);
    let pts = 0;
    for (const t of h.trick) { pts += points(t.card); if (t.card === JD) h.jackBy = winner; }
    h.taken[winner] += pts;
    h.tricksWon[winner]++;
    h.lastTrick = { cards: h.trick, winner, points: pts };
    h.trick = [];
    h.trickNo++;
    h.leader = winner;
    h.turn = winner;
    return { trickDone: true, winner, points: pts, handDone: h.trickNo === 13 };
  }

  /**
   * Points each seat scores for a finished hand.
   * moonRule: "add" (others +26), "subtract" (shooter -26), "choice" (shooter picks; we pick
   * "subtract" only when adding 26 would end the game with the shooter not winning).
   * jackBy: seat that took the jack of diamonds when that variant is on, else -1.
   */
  function handPoints(taken, moonRule, jackBy, scoresBefore, target) {
    const n = taken.length;   // 4 at the table; the scorekeeper also handles 3-6 players
    const pts = taken.slice();
    const moonBy = taken.indexOf(26);
    let moonHow = null;
    if (moonBy >= 0) {
      let how = moonRule === "subtract" ? "subtract" : "add";
      if (moonRule === "choice" && scoresBefore) {
        const after = scoresBefore.map((sc, i) => sc + (i === moonBy ? 0 : 26));
        const ends = Math.max(...after) >= (target || 100);
        const low = Math.min(...after);
        if (ends && after[moonBy] !== low) how = "subtract";
      }
      for (let s = 0; s < n; s++) pts[s] = how === "subtract" ? (s === moonBy ? -26 : 0) : (s === moonBy ? 0 : 26);
      moonHow = how;
    }
    if (jackBy >= 0) pts[jackBy] -= 10;
    return { pts, moonBy, moonHow };
  }

  function finishHand(game) {
    const h = game.hand;
    const r = handPoints(h.taken, game.opts.moon, game.opts.jack ? h.jackBy : -1, game.scores, game.opts.target);
    for (let s = 0; s < 4; s++) game.scores[s] += r.pts[s];
    h.result = r;
    h.phase = "done";
    game.history.push({ pts: r.pts, moonBy: r.moonBy, jackBy: game.opts.jack ? h.jackBy : -1 });
    game.handNo++;
    if (Math.max(...game.scores) >= game.opts.target) {
      // Lowest score wins; a tie for lowest plays more hands until one player is ahead (Pagat).
      const low = Math.min(...game.scores);
      const winners = [0, 1, 2, 3].filter((s) => game.scores[s] === low);
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
    for (let s = 0; s < 4; s++) {
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
      const seats = [0, 1, 2, 3].filter((s) => !h.passes[s]);
      return { seats, kind: "pass" };
    }
    if (h.phase === "play") return { seats: [h.turn], kind: "play" };
    return null;
  }

  const api = {
    QS, JD, TWO_CLUBS, PASS_CYCLES, PASS_NAMES, DEFAULTS, points, isPoint,
    newGame, deal, submitPass, legal, play, playRaw, trickWinner, handPoints, finishHand, startPlay,
    apply, view, toAct, passOffsetFor,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hearts = api;
})(typeof self !== "undefined" ? self : globalThis);
