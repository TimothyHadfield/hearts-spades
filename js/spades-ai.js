/* spades-ai.js — Spades computer players, the bid advisor, hints and "points lost".
 *  Easy   : bids by a rough count with noise, half its plays random. Never bids nil.
 *  Medium : bids by counting likely winners; plays by rules of thumb (win when the team
 *           still needs tricks, duck to avoid bags, cover a partner's nil, duck under a nil).
 *  Hard   : bids by simulation (deals the unseen cards many times, plays them out, picks the
 *           bid with the best expected score, nil included) and plays by look-ahead
 *           (tries each card against many deals of the hidden cards, keeps the best).
 * Everything here uses only what the seat could know. */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const C = isNode ? require("./cards.js") : root.Cards;
  const S = isNode ? require("./spades.js") : root.Spades;
  const { suit, rank, SPADES } = C;
  const team = S.team;

  const LEVELS = { easy: { random: 0.5 }, medium: {}, hard: { samples: 30, bidSims: 120 } };

  const maxBy = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));
  const minBy = (arr, f) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));
  // Card strength in a trick: spades above everything, then rank.
  const power = (c) => rank(c) + (suit(c) === SPADES ? 13 : 0);
  const hi = (arr) => maxBy(arr, power);
  const lo = (arr) => minBy(arr, power);

  // ------------------------------------------------------------------ bidding
  // House rules put up to three spades above the ace (Big Joker 15, Little Joker 14, high 2♠ 13).
  // For counting, rank spades by place from the top, so the top spade in play always counts as an "ace".
  function spadeRanker(opts) {
    const o = opts || {};
    const highs = [];
    if (o.jokers) highs.push(15, 14);
    if (o.deucesHigh) highs.push(13);
    return (r) => (r >= 13 ? 12 - highs.indexOf(r) : r - highs.length);
  }

  /** Rough count of tricks a hand should take (used by Medium and as Hard's starting point). */
  function countTricks(hand, opts) {
    const sr = spadeRanker(opts);
    const bySuit = [[], [], [], []];
    for (const c of hand) bySuit[suit(c)].push(suit(c) === SPADES ? sr(rank(c)) : rank(c));
    for (const s of bySuit) s.sort((a, b) => b - a);
    let t = 0;
    for (let s = 0; s < 4; s++) {
      if (s === SPADES) continue;
      const r = bySuit[s], n = r.length;
      if (r.includes(12)) t += n <= 6 ? 0.95 : 0.7;
      if (r.includes(11)) t += n >= 2 && n <= 5 ? 0.75 : n === 1 ? 0.1 : 0.4;
      if (r.includes(10) && n >= 3 && n <= 4 && (r.includes(12) || r.includes(11))) t += 0.3;
    }
    const sp = bySuit[SPADES], ns = sp.length;
    let spTricks = 0;
    if (sp.includes(12)) spTricks += 1;
    if (sp.includes(11)) spTricks += ns >= 2 ? 0.9 : 0.4;
    if (sp.includes(10)) spTricks += ns >= 3 ? 0.65 : 0.2;
    if (sp.includes(9)) spTricks += ns >= 4 ? 0.35 : 0;
    if (ns > 3) spTricks += (ns - 3) * 0.75;
    t += spTricks;
    // Ruffing short suits with spare spades.
    let spare = Math.max(0, ns - 2);
    for (let s = 0; s < 4 && spare > 0; s++) {
      if (s === SPADES) continue;
      const n = bySuit[s].length;
      const v = n === 0 ? 0.8 : n === 1 ? 0.5 : n === 2 ? 0.15 : 0;
      if (v) { t += v; spare--; }
    }
    return t;
  }

  /** Is this hand a sensible nil? */
  function nilLooksGood(hand, opts) {
    const sr = spadeRanker(opts);
    const sp = hand.filter((c) => suit(c) === SPADES);
    if (sp.some((c) => sr(rank(c)) >= 9) || sp.length > 3) return false;
    for (let s = 0; s < 4; s++) {
      const r = hand.filter((c) => suit(c) === s).map((c) => (s === SPADES ? sr(rank(c)) : rank(c)));
      if (r.includes(12) || (r.includes(11) && r.length < 4)) return false;
      if (r.length && Math.min(...r) >= 7 && r.length <= 2) return false;
    }
    return countTricks(hand, opts) < 1.6;
  }

  function mediumBid(game, seat) {
    const h = game.hand, hand = h.hands[seat];
    if (game.opts.nil && nilLooksGood(hand, game.opts) && h.bids[(seat + 2) % 4] !== 0) return 0;
    let b = Math.round(countTricks(hand, game.opts));
    if (h.bids[(seat + 2) % 4] === 0) b += 1;         // partner is nil: we carry the team
    b = Math.max(game.opts.nil ? 1 : 1, Math.min(13, b));
    return b;
  }

  function easyBid(game, seat, rnd) {
    let b = Math.round(countTricks(game.hand.hands[seat], game.opts) + (rnd() * 2 - 1));
    return Math.max(1, Math.min(13, b));
  }

  // ------------------------------------------------------------- the trick state
  function current(h) {
    const led = suit(h.trick[0].card);
    let w = h.trick[0];
    for (const t of h.trick) {
      const ws = suit(w.card), ts = suit(t.card);
      if (ts === ws ? rank(t.card) > rank(w.card) : ts === SPADES) w = t;
    }
    return { led, win: w };
  }
  const beats = (c, w) => (suit(c) === suit(w) ? rank(c) > rank(w) : suit(c) === SPADES);

  // The cards in this hand's deck (house rules swap some cards for jokers / a high 2♠).
  const deckOf = (h) => h.deck || C.deck();

  /** Highest card still unplayed in a suit, excluding `exceptHand` cards? */
  function isBoss(h, c, hand) {
    const s = suit(c), r = rank(c);
    for (const x of deckOf(h)) {
      if (suit(x) === s && rank(x) > r && !h.played[x] && !hand.includes(x)) return false;
    }
    return true;
  }

  function teamNeed(h, t) {
    let contract = 0, made = 0;
    for (const s of [t, t + 2]) if (h.bids[s] > 0) { contract += h.bids[s]; made += h.tricks[s]; }
    return contract - made;
  }

  // ------------------------------------------------------------ medium player
  function mediumMove(h, seat) {
    const moves = S.legal(h, seat);
    if (moves.length === 1) return moves[0];
    const hand = h.hands[seat];
    const t = team(seat), partner = (seat + 2) % 4;
    if (h.bids[seat] === 0) return nilMove(h, seat, moves);
    const partnerNil = h.bids[partner] === 0 && h.tricks[partner] === 0;
    const need = teamNeed(h, t);
    const want = need > 0 || partnerNil;
    const oppNil = [1, 3].map((o) => (seat + o) % 4).filter((o) => h.bids[o] === 0 && h.tricks[o] === 0);

    if (h.trick.length === 0) {
      if (partnerNil) {
        const side = moves.filter((c) => suit(c) !== SPADES);
        return hi(side.length ? side : moves);
      }
      if (want) {
        const boss = moves.filter((c) => isBoss(h, c, hand));
        const bossSide = boss.filter((c) => suit(c) !== SPADES);
        if (bossSide.length) return hi(bossSide);
        if (boss.length) return hi(boss);
        // Lead low from the shortest side suit, to ruff it later.
        const side = moves.filter((c) => suit(c) !== SPADES);
        if (side.length) {
          const len = [0, 0, 0, 0];
          for (const c of hand) len[suit(c)]++;
          return minBy(side, (c) => len[suit(c)] * 20 + rank(c));
        }
        return lo(moves);
      }
      const side = moves.filter((c) => suit(c) !== SPADES);
      return lo(side.length ? side : moves);
    }

    const { led, win } = current(h);
    const last = h.trick.length === 3;
    const winners = moves.filter((c) => beats(c, win.card));
    const losers = moves.filter((c) => !beats(c, win.card));
    const following = suit(moves[0]) === led;

    if (oppNil.includes(win.seat) && losers.length) return hi(losers);   // let the nil bidder win it
    if (win.seat === partner) {
      if (partnerNil) return winners.length ? lo(winners) : (losers.length ? hi(losers) : lo(moves));
      if (losers.length) return following ? lo(losers) : lo(losers.filter((c) => suit(c) !== SPADES).length ? losers.filter((c) => suit(c) !== SPADES) : losers);
      return lo(moves);
    }
    // An opponent (or nobody we care about) is winning.
    if (want && winners.length) {
      if (last) return lo(winners);
      const bossW = winners.filter((c) => suit(c) === led && isBoss(h, c, hand));
      if (bossW.length) return lo(bossW);
      return following ? hi(winners) : lo(winners);
    }
    if (losers.length) {
      if (!want) return hi(losers);              // dodge bags, shed high cards
      const side = losers.filter((c) => suit(c) !== SPADES);
      return lo(side.length ? side : losers);
    }
    return last ? hi(moves) : lo(moves);
  }

  function nilMove(h, seat, moves) {
    if (h.trick.length === 0) {
      const side = moves.filter((c) => suit(c) !== SPADES);
      return lo(side.length ? side : moves);
    }
    const { win } = current(h);
    const losers = moves.filter((c) => !beats(c, win.card));
    if (losers.length) return hi(losers);
    return h.trick.length === 3 ? hi(moves) : lo(moves);
  }

  function easyMove(h, seat, rnd) {
    const moves = S.legal(h, seat);
    if (rnd() < LEVELS.easy.random) return moves[Math.floor(rnd() * moves.length)];
    return mediumMove(h, seat);
  }

  // --------------------------------------------------------------- look-ahead
  function sampleWorld(h, seat, rnd) {
    const mine = new Set(h.hands[seat]);
    const fixed = [[], [], [], []], known = new Set();
    const x = h.exchange;
    if (x && x.given && x.back) {
      // Both partners saw the swap: each knows where the other's 2 cards went.
      const partner = (x.nilSeat + 2) % 4;
      // given: nil bidder -> partner; back: partner -> nil bidder.
      if (seat === x.nilSeat) for (const c of x.given) if (!h.played[c]) { fixed[partner].push(c); known.add(c); }
      if (seat === partner) for (const c of x.back) if (!h.played[c]) { fixed[x.nilSeat].push(c); known.add(c); }
    }
    const unseen = [];
    for (const c of deckOf(h)) if (!h.played[c] && !mine.has(c) && !known.has(c)) unseen.push(c);
    const need = [0, 1, 2, 3].map((s) => (s === seat ? 0 : h.hands[s].length));
    const hands = C.dealUnseen(unseen, need, fixed, h.voids, rnd);
    hands[seat] = h.hands[seat].slice();
    return hands;
  }

  function simState(h, hands) {
    return {
      hands, bids: h.bids.slice(), blind: h.blind.slice(), trick: h.trick.slice(), leader: h.leader, turn: h.turn,
      trickNo: h.trickNo, tricks: h.tricks.slice(), spadesBroken: h.spadesBroken, spadesLead: h.spadesLead, deck: h.deck,
      firstLead2c: h.firstLead2c, played: h.played.slice(), plays: null, voids: h.voids.map((v) => v.slice()), phase: "play",
    };
  }

  function rollout(st) {
    while (st.trickNo < 13) S.playRaw(st, st.turn, mediumMove(st, st.turn));
  }

  /** Our hand score minus theirs, with a small shadow cost per bag. */
  function value(st, seat, game) {
    const t = team(seat), o = 1 - t;
    const sc = [t, o].map((x) => S.scoreTeam([st.bids[x], st.bids[x + 2]], [st.blind[x], st.blind[x + 2]],
      [st.tricks[x], st.tricks[x + 2]], game.bags[x], game.opts));
    const shadow = game.opts.bagLimit > 0 ? 0.3 * game.opts.bagPenalty / game.opts.bagLimit : 0;
    return (sc[0].points - shadow * sc[0].bagsAdded) - (sc[1].points - shadow * sc[1].bagsAdded);
  }

  /** Expected (our - their) hand points for each legal card, best first (higher is better). */
  function evaluate(game, seat, samples, rnd) {
    const h = game.hand;
    rnd = rnd || Math.random;
    const moves = S.legal(h, seat);
    const sums = new Array(moves.length).fill(0);
    for (let k = 0; k < samples; k++) {
      const world = sampleWorld(h, seat, rnd);
      for (let i = 0; i < moves.length; i++) {
        const st = simState(h, world.map((x) => x.slice()));
        S.playRaw(st, seat, moves[i]);
        rollout(st);
        sums[i] += value(st, seat, game);
      }
    }
    return moves.map((card, i) => ({ card, ev: sums[i] / samples })).sort((a, b) => b.ev - a.ev);
  }

  /**
   * Bid advisor: deals the unseen cards `sims` times and plays each hand out.
   * Returns {dist[0..13] chance of taking k tricks, expected, nilChance, best:{bid, ev}, evs:{bid: ev}}.
   */
  function adviseBid(game, seat, sims, rnd) {
    rnd = rnd || Math.random;
    const h = game.hand;
    const mine = h.hands[seat];
    const unseen = [];
    const mset = new Set(mine);
    for (const c of deckOf(h)) if (!mset.has(c)) unseen.push(c);
    const base = Math.max(1, Math.round(countTricks(mine, game.opts)));
    const dist = new Array(14).fill(0);
    const partner = (seat + 2) % 4;
    const runs = [];      // finished play-outs with our rough bid
    let nilOk = 0, nilEvSum = 0, nilSims = 0;
    const tryNil = game.opts.nil && h.bids[partner] !== 0;
    for (let k = 0; k < sims; k++) {
      const hands = C.dealUnseen(unseen, [0, 1, 2, 3].map((s) => (s === seat ? 0 : 13)), null, null, rnd);
      hands[seat] = mine.slice();
      const fake = { hands, bids: h.bids.slice() };
      for (let s = 0; s < 4; s++) if (fake.bids[s] === null && s !== seat) fake.bids[s] = mediumBid({ hand: fake, opts: game.opts }, s);
      const bidsN = fake.bids.slice(); bidsN[seat] = base;
      const st = playOut(hands, bidsN, h, game);
      dist[st.tricks[seat]]++;
      runs.push({ bids: st.bids, blind: st.blind, tricks: st.tricks });
      if (tryNil && (k % 2 === 0)) {
        const bidsZ = fake.bids.slice(); bidsZ[seat] = 0;
        const sz = playOut(hands, bidsZ, h, game);
        if (sz.tricks[seat] === 0) nilOk++;
        nilEvSum += value(sz, seat, game);
        nilSims++;
      }
    }
    let expected = 0;
    for (let i = 0; i < 14; i++) { dist[i] /= sims; expected += i * dist[i]; }
    // Expected hand score for each sensible bid, from the same play-outs.
    const evs = {};
    const lo = Math.max(1, Math.min(base, Math.round(expected)) - 2), hiB = Math.min(13, Math.max(base, Math.round(expected)) + 2);
    for (let b = lo; b <= hiB; b++) {
      let sum = 0;
      for (const r of runs) { const bb = r.bids.slice(); bb[seat] = b; sum += value({ bids: bb, blind: r.blind, tricks: r.tricks }, seat, game); }
      evs[b] = sum / sims;
    }
    if (nilSims) evs[0] = nilEvSum / nilSims;
    let best = null;
    for (const b in evs) if (!best || evs[b] > best.ev) best = { bid: +b, ev: evs[b] };
    return { dist, expected, nilChance: nilSims ? nilOk / nilSims : null, best, evs, rough: base };
  }

  function playOut(hands, bids, h, game) {
    const st = {
      hands: hands.map((x) => x.slice()), bids, blind: h.blind.slice(), trick: [], trickNo: 0,
      tricks: [0, 0, 0, 0], spadesBroken: false, spadesLead: game.opts.spadesLead, firstLead2c: game.opts.firstLead === "2c",
      deck: h.deck, played: new Array(55).fill(0), plays: null, voids: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], phase: "play",
    };
    let lead = (h.dealer + 1) % 4;
    if (st.firstLead2c) for (let s = 0; s < 4; s++) if (st.hands[s].includes(0)) lead = s;
    st.leader = st.turn = lead;
    rollout(st);
    return st;
  }

  function hardBid(game, seat, rnd) {
    const a = adviseBid(game, seat, LEVELS.hard.bidSims, rnd);
    return a.best.bid;
  }

  function chooseBid(game, seat, level, rnd) {
    rnd = rnd || Math.random;
    const b = level === "easy" ? easyBid(game, seat, rnd) : level === "hard" ? hardBid(game, seat, rnd) : mediumBid(game, seat);
    // Bidding variants (Whiz, Mirror, Suicide) limit the bids: take the allowed one nearest the
    // bid we'd like (a tie goes to the lower bid).
    const ok = S.allowedBids ? S.allowedBids(game, seat) : null;
    if (!ok || !ok.length || ok.includes(b)) return b;
    return ok.reduce((a, x) => (Math.abs(x - b) < Math.abs(a - b) ? x : a));
  }

  function chooseMove(game, seat, level, rnd) {
    rnd = rnd || Math.random;
    const h = game.hand;
    if (level === "easy") return easyMove(h, seat, rnd);
    if (level === "hard") {
      const moves = S.legal(h, seat);
      if (moves.length === 1) return moves[0];
      return evaluate(game, seat, LEVELS.hard.samples, rnd)[0].card;
    }
    return mediumMove(h, seat);
  }

  /** Blind nil swap: the nil bidder hands over its two highest cards; the partner returns its two lowest. */
  function chooseExchange(hand, isNilBidder) {
    const sorted = hand.slice().sort((a, b) => power(a) - power(b));
    return isNilBidder ? sorted.slice(-2) : sorted.slice(0, 2);
  }

  /** Chance the viewer's team makes its bid (and each live nil survives), played out from here. */
  function makeChance(h, viewer, N, rnd) {
    rnd = rnd || Math.random;
    const mate = (viewer + 2) % 4;
    let made = 0;
    const nilOk = [0, 0, 0, 0];
    const contract = (h.bids[viewer] || 0) + (h.bids[mate] || 0);
    for (let i = 0; i < N; i++) {
      const w = sampleWorld(h, viewer, rnd);
      const st = Object.assign({}, h, { hands: w, trick: h.trick.slice(), tricks: h.tricks.slice(), played: h.played.slice(), plays: null, voids: h.voids.map((v) => v.slice()) });
      while (st.trickNo < 13) S.playRaw(st, st.turn, mediumMove(st, st.turn));
      const won = (h.bids[viewer] ? st.tricks[viewer] : 0) + (h.bids[mate] ? st.tricks[mate] : 0);
      if (won >= contract) made++;
      for (let s = 0; s < 4; s++) if (h.bids[s] === 0 && st.tricks[s] === 0) nilOk[s]++;
    }
    return { bid: contract > 0 ? made / N : null, nil: nilOk.map((x) => x / N) };
  }

  const api = {
    LEVELS, countTricks, nilLooksGood, mediumBid, easyBid, hardBid, chooseBid, chooseMove, chooseExchange,
    mediumMove, evaluate, adviseBid, sampleWorld, value, makeChance,
  };
  if (isNode) module.exports = api;
  else root.SpadesAI = api;
})(typeof self !== "undefined" ? self : globalThis);
