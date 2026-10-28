/* cards.js — shared card basics for Hearts and Spades.
 * A card is an integer 0-51: suit = floor(c / 13), rank = c % 13.
 * Suits in display order: 0 clubs, 1 diamonds, 2 spades, 3 hearts (black, red, black, red).
 * Ranks: 0 = "2" ... 8 = "10", 9 = J, 10 = Q, 11 = K, 12 = A.
 * Spades house rules add three extra spades above the ace (Pagat): 54 = the 2♠ when deuces are
 * high (rank 13), 52 = Little Joker (rank 14), 53 = Big Joker (rank 15). Hearts never sees them.
 * Works in the browser (window.Cards) and in Node (require). */
(function (root) {
  "use strict";
  const CLUBS = 0, DIAMONDS = 1, SPADES = 2, HEARTS = 3;
  const SUIT_SYMBOLS = ["♣", "♦", "♠", "♥"];
  const SUIT_NAMES = ["clubs", "diamonds", "spades", "hearts"];
  const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "LJ", "BJ"];
  const LITTLE_JOKER = 52, BIG_JOKER = 53, HIGH_DEUCE = 54;
  const XRANK = [14, 15, 13];

  const suit = (c) => (c < 52 ? (c / 13) | 0 : SPADES);
  const rank = (c) => (c < 52 ? c % 13 : XRANK[c - 52]);
  const card = (s, r) => s * 13 + r;
  const isRed = (c) => suit(c) === DIAMONDS || suit(c) === HEARTS;
  const JOKER_NAMES = { 52: "Little Joker", 53: "Big Joker" };
  const isJoker = (c) => c === LITTLE_JOKER || c === BIG_JOKER;
  const name = (c) => (isJoker(c) ? JOKER_NAMES[c] : RANK_NAMES[rank(c)] + SUIT_SYMBOLS[suit(c)]);
  const longName = (c) => (isJoker(c) ? JOKER_NAMES[c] : RANK_NAMES[rank(c)] + " of " + SUIT_NAMES[suit(c)]);

  function deck() { const d = []; for (let i = 0; i < 52; i++) d.push(i); return d; }

  /** Small seeded generator (mulberry32) so tests and simulations repeat exactly. */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // By suit, then rank: the extra high spades sort above the A♠ (same order as card numbers otherwise).
  const sortKey = (c) => suit(c) * 16 + rank(c);
  const sortCards = (h) => h.slice().sort((a, b) => sortKey(a) - sortKey(b));

  /**
   * Deal the unseen cards to the other seats at random, keeping what is known:
   *  - need[s]   how many cards seat s must get (0 for the viewer)
   *  - fixed[s]  cards known to be in seat s's hand (e.g. cards the viewer passed it)
   *  - void[s][suit] true when seat s is known to hold none of that suit
   *  - noCard[s] optional array of 52 flags: seat s cannot hold that card
   * Returns hands[s] arrays, or null if no consistent deal was found.
   */
  function dealUnseen(unseen, need, fixed, voids, rnd, noCard) {
    const n = need.length;
    for (let attempt = 0; attempt < 60; attempt++) {
      const hands = [];
      const left = need.slice();
      for (let s = 0; s < n; s++) {
        hands.push(fixed && fixed[s] ? fixed[s].slice() : []);
        left[s] -= hands[s].length;
      }
      const pool = shuffle(unseen.slice(), rnd);
      // Place the most constrained cards first: count seats each card may go to.
      const opts = pool.map((c) => {
        const ok = [];
        for (let s = 0; s < n; s++) {
          if (left[s] <= 0 && need[s] - (fixed && fixed[s] ? fixed[s].length : 0) <= 0) continue;
          if (voids && voids[s] && voids[s][suit(c)]) continue;
          if (noCard && noCard[s] && noCard[s][c]) continue;
          ok.push(s);
        }
        return { c, ok };
      });
      opts.sort((x, y) => x.ok.length - y.ok.length);
      let failed = false;
      for (const o of opts) {
        let total = 0;
        for (const s of o.ok) if (left[s] > 0) total += left[s];
        if (total === 0) { failed = true; break; }
        let pick = rnd() * total, chosen = -1;
        for (const s of o.ok) {
          if (left[s] <= 0) continue;
          pick -= left[s];
          if (pick < 0) { chosen = s; break; }
        }
        if (chosen < 0) for (const s of o.ok) if (left[s] > 0) { chosen = s; break; }
        hands[chosen].push(o.c);
        left[chosen]--;
      }
      if (!failed) return hands;
    }
    // Constraints could not be met by sampling: deal ignoring voids so play can continue.
    const hands = [];
    const pool = shuffle(unseen.slice(), rnd);
    let k = 0;
    for (let s = 0; s < n; s++) {
      hands.push(fixed && fixed[s] ? fixed[s].slice() : []);
      while (hands[s].length < need[s]) hands[s].push(pool[k++]);
    }
    return hands;
  }

  const api = {
    CLUBS, DIAMONDS, SPADES, HEARTS, SUIT_SYMBOLS, SUIT_NAMES, RANK_NAMES,
    LITTLE_JOKER, BIG_JOKER, HIGH_DEUCE, isJoker,
    suit, rank, card, isRed, name, longName, deck, makeRng, shuffle, sortCards, dealUnseen,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Cards = api;
})(typeof self !== "undefined" ? self : globalThis);
