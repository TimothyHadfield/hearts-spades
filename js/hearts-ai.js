/* hearts-ai.js — the Hearts computer players, hints, "points lost" and the moon odds.
 *  Easy   : half its plays are random legal cards, passes 3 random cards.
 *  Medium : rules of thumb (duck under the winner, dump the queen, flush the queen,
 *           void short suits, block a moon, go for the moon when it's nearly there).
 *  Hard   : looks ahead. For each card it could play it deals the unseen cards at random
 *           many times (respecting known voids and the cards it passed), plays the rest of
 *           the hand out with Medium for everyone, and keeps the card with the fewest
 *           expected points.
 * The same look-ahead powers the hint, the "points lost" study and the moon warning,
 * and it only ever uses what the viewer could know (own hand, cards played, voids shown,
 * cards they passed). */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const C = isNode ? require("./cards.js") : root.Cards;
  const H = isNode ? require("./hearts.js") : root.Hearts;
  const { suit, rank, HEARTS, SPADES } = C;
  const QS = H.QS;
  const points = H.points;

  const LEVELS = {
    easy: { random: 0.5 },
    medium: {},
    hard: { samples: 40 },
  };

  const maxBy = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
  const minBy = (arr, f) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));
  const hi = (arr) => maxBy(arr, rank);
  const lo = (arr) => minBy(arr, rank);

  // ------------------------------------------------------------------ passing
  function choosePass(hand, level, rnd) {
    rnd = rnd || Math.random;
    if (level === "easy") return C.shuffle(hand.slice(), rnd).slice(0, 3);
    const bySuit = [0, 0, 0, 0];
    for (const c of hand) bySuit[suit(c)]++;
    const lowSpades = hand.filter((c) => suit(c) === SPADES && rank(c) < 10).length;
    const danger = (c) => {
      const s = suit(c), r = rank(c);
      if (c === QS) return lowSpades >= 4 ? 2 : 40;
      if (s === SPADES && r > 10) return lowSpades >= 4 ? 3 : 35;
      if (s === SPADES) return r * 0.2;
      let d = r;
      if (s === HEARTS) d += 3;
      if (bySuit[s] <= 2 && s !== HEARTS) d += 5;   // helps make a void
      return d;
    };
    return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  }

  // ----------------------------------------------------------- moon awareness
  function moonMode(h, seat) {
    let tot = 0;
    for (let s = 0; s < 4; s++) tot += h.taken[s];
    const res = { shoot: false, block: -1 };
    if (tot < 13) return res;
    const holder = h.taken.findIndex((t) => t === tot);
    if (holder < 0) return res;
    if (holder === seat) {
      const mine = new Set(h.hands[seat]);
      let outHearts = 0;
      for (let r = 0; r < 13; r++) {
        const c = C.card(HEARTS, r);
        if (!h.played[c] && !mine.has(c)) outHearts++;
      }
      if (outHearts <= 2 && h.trickNo >= 6) res.shoot = true;
    } else res.block = holder;
    return res;
  }

  // ------------------------------------------------------------ medium player
  function mediumMove(h, seat) {
    const moves = H.legal(h, seat);
    if (moves.length === 1) return moves[0];
    const hand = h.hands[seat];
    const qOut = !h.played[QS];
    const iHoldQ = hand.includes(QS);
    const mode = moonMode(h, seat);

    if (h.trick.length === 0) return leadMove(h, seat, moves, mode, qOut, iHoldQ);

    const led = suit(h.trick[0].card);
    let win = h.trick[0];
    for (const t of h.trick) if (suit(t.card) === led && rank(t.card) > rank(win.card)) win = t;
    let pts = 0;
    for (const t of h.trick) pts += points(t.card);
    const last = h.trick.length === 3;

    if (suit(moves[0]) === led) {
      const under = moves.filter((c) => rank(c) < rank(win.card));
      const over = moves.filter((c) => rank(c) > rank(win.card));
      if (mode.shoot) return over.length ? hi(over) : lo(moves);
      if (mode.block >= 0 && win.seat === mode.block && pts > 0 && over.length) {
        const o = over.filter((c) => c !== QS);
        if (o.length) return last ? lo(o) : hi(o);
      }
      if (led === SPADES) {
        if (iHoldQ) {
          if (rank(win.card) > 10) return QS;       // king or ace is winning: drop the queen on it
          const rest = moves.filter((c) => c !== QS);
          if (!rest.length) return QS;
          const u = rest.filter((c) => rank(c) < rank(win.card));
          if (u.length) return hi(u);
          return last ? hi(rest) : lo(rest);
        }
        if (qOut && !last) return under.length ? hi(under) : lo(moves);
      }
      if (last && pts === 0) return hi(moves);       // safe to win: shed the highest
      if (under.length) return hi(under);
      if (last) return hi(moves);
      return led === HEARTS ? lo(moves) : hi(moves);
    }

    // Can't follow: discard.
    if (mode.shoot) {
      const non = moves.filter((c) => !H.isPoint(c));
      return non.length ? lo(non) : lo(moves);
    }
    if (mode.block >= 0 && win.seat === mode.block) {
      const non = moves.filter((c) => !H.isPoint(c));
      if (non.length) return hi(non);
    }
    if (moves.includes(QS)) return QS;
    const len = [0, 0, 0, 0];
    for (const c of hand) len[suit(c)]++;
    const danger = (c) => {
      let d = rank(c);
      if (suit(c) === SPADES && rank(c) > 10 && qOut && !iHoldQ) d += 30;
      if (suit(c) === HEARTS) d += 6;
      d -= len[suit(c)] * 0.7;
      return d;
    };
    return maxBy(moves, danger);
  }

  function leadMove(h, seat, moves, mode, qOut, iHoldQ) {
    if (mode.shoot) return hi(moves);
    const hand = h.hands[seat];
    const holdHighSpade = hand.some((c) => suit(c) === SPADES && rank(c) > 10);
    // Flush the queen out with low spades when we can't be caught by it.
    if (qOut && !iHoldQ && !holdHighSpade) {
      const sp = moves.filter((c) => suit(c) === SPADES);
      if (sp.length) return hi(sp);
    }
    let best = null, bestScore = Infinity;
    for (let s = 0; s < 4; s++) {
      const inSuit = moves.filter((c) => suit(c) === s);
      if (!inSuit.length) continue;
      const low = lo(inSuit);
      let score = rank(low);
      for (let o = 0; o < 4; o++) if (o !== seat && h.voids[o][s]) score += 6;
      if (s === HEARTS) score += 2;
      if (s === SPADES && (iHoldQ || (holdHighSpade && qOut))) score += 50;
      if (score < bestScore) { bestScore = score; best = low; }
    }
    return best;
  }

  function easyMove(h, seat, rnd) {
    const moves = H.legal(h, seat);
    if (rnd() < LEVELS.easy.random) return moves[Math.floor(rnd() * moves.length)];
    return mediumMove(h, seat);
  }

  // ---------------------------------------------------------------- look-ahead
  /** Deal the cards `seat` can't see, consistent with what it knows. */
  function sampleWorld(h, seat, rnd) {
    const mine = new Set(h.hands[seat]);
    const fixed = [[], [], [], []];
    const known = new Set();
    if (h.passOffset && h.passes[seat] && h.received[(seat + h.passOffset) % 4]) {
      const to = (seat + h.passOffset) % 4;
      for (const c of h.passes[seat]) if (!h.played[c]) { fixed[to].push(c); known.add(c); }
    }
    const unseen = [];
    for (let c = 0; c < 52; c++) if (!h.played[c] && !mine.has(c) && !known.has(c)) unseen.push(c);
    const need = [0, 1, 2, 3].map((s) => (s === seat ? 0 : h.hands[s].length));
    const hands = C.dealUnseen(unseen, need, fixed, h.voids, rnd);
    hands[seat] = h.hands[seat].slice();
    return hands;
  }

  function simState(h, hands) {
    return {
      hands, trick: h.trick.slice(), leader: h.leader, turn: h.turn, trickNo: h.trickNo,
      taken: h.taken.slice(), tricksWon: h.tricksWon.slice(), heartsBroken: h.heartsBroken,
      jackBy: h.jackBy, queenBreaks: h.queenBreaks, bleed: h.bleed,
      played: h.played.slice(), plays: null, voids: h.voids.map((v) => v.slice()),
      phase: "play", passOffset: h.passOffset, passes: [null, null, null, null], received: [null, null, null, null],
    };
  }

  function rollout(st) {
    while (st.trickNo < 13) H.playRaw(st, st.turn, mediumMove(st, st.turn));
  }

  /** Points for `seat` that also count a moon: equals own points in a normal hand. */
  function value(st, seat, opts) {
    opts = opts || {};
    const p = H.handPoints(st.taken, opts.moon, opts.jack ? st.jackBy : -1).pts;
    let others = 0;
    for (let s = 0; s < 4; s++) if (s !== seat) others += p[s];
    return 0.75 * (p[seat] - others / 3) + 6.5;
  }

  /**
   * Expected points for each legal card (lower is better), using `samples` random deals
   * of the hidden cards. Returns [{card, ev}] sorted best first.
   */
  function evaluate(h, seat, samples, rnd, opts) {
    const moves = H.legal(h, seat);
    rnd = rnd || Math.random;
    const sums = new Array(moves.length).fill(0);
    for (let k = 0; k < samples; k++) {
      const world = sampleWorld(h, seat, rnd);
      for (let i = 0; i < moves.length; i++) {
        const st = simState(h, world.map((x) => x.slice()));
        H.playRaw(st, seat, moves[i]);
        rollout(st);
        sums[i] += value(st, seat, opts);
      }
    }
    return moves.map((card, i) => ({ card, ev: sums[i] / samples })).sort((a, b) => a.ev - b.ev);
  }

  function hardMove(h, seat, rnd, opts, samples) {
    const moves = H.legal(h, seat);
    if (moves.length === 1) return moves[0];
    return evaluate(h, seat, samples || LEVELS.hard.samples, rnd, opts)[0].card;
  }

  function chooseMove(h, seat, level, rnd, opts) {
    rnd = rnd || Math.random;
    if (level === "easy") return easyMove(h, seat, rnd);
    if (level === "hard") return hardMove(h, seat, rnd, opts);
    return mediumMove(h, seat);
  }

  /** Chance that `target` takes all 26 this hand, seen from `viewer`'s knowledge. */
  function moonChance(h, viewer, target, samples, rnd) {
    let hits = 0;
    for (let k = 0; k < samples; k++) {
      const st = simState(h, sampleWorld(h, viewer, rnd));
      rollout(st);
      if (st.taken[target] === 26) hits++;
    }
    return hits / samples;
  }

  /** Is anyone (other than `viewer`) holding every point taken so far? Returns seat or -1. */
  function moonThreat(h, viewer, minPoints) {
    let tot = 0;
    for (let s = 0; s < 4; s++) tot += h.taken[s];
    if (tot < (minPoints || 1)) return -1;
    const s = h.taken.findIndex((t) => t === tot);
    return s >= 0 && s !== viewer ? s : -1;
  }

  const api = { LEVELS, choosePass, mediumMove, easyMove, hardMove, chooseMove, evaluate, sampleWorld, simState, rollout, value, moonChance, moonThreat, moonMode };
  if (isNode) module.exports = api;
  else root.HeartsAI = api;
})(typeof self !== "undefined" ? self : globalThis);
