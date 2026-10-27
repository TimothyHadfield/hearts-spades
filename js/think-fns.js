/* think-fns.js — the slow functions the pages ask for, by name. Loaded both in the worker and
 * on the page (the page uses them directly if workers aren't available). */
(function (root) {
  "use strict";
  const HA = () => root.HeartsAI, SA = () => root.SpadesAI;
  root.ThinkFns = {
    heartsEvaluate: (h, seat, samples, opts) => HA().evaluate(h, seat, samples, Math.random, opts),
    heartsMove: (h, seat, level, opts) => HA().chooseMove(h, seat, level, Math.random, opts),
    heartsKeyProbs: (h, me, N) => {
      const C = root.Cards, H = root.Hearts;
      const mine = new Set(h.hands[me]);
      const keys = [H.QS, C.card(C.SPADES, 12), C.card(C.SPADES, 11), C.card(C.HEARTS, 12)].filter((c) => !h.played[c] && !mine.has(c));
      const n = h.hands.length;
      const cnt = keys.map(() => new Array(n - 1).fill(0));
      for (let i = 0; i < N; i++) {
        const w = HA().sampleWorld(h, me, Math.random);
        keys.forEach((c, j) => { for (let k = 1; k < n; k++) if (w[(me + k) % n].includes(c)) cnt[j][k - 1]++; });
      }
      return keys.map((c, j) => ({ card: c, p: cnt[j].map((x) => x / N) }));
    },
    heartsMoon:(h, viewer, target, samples) => HA().moonChance(h, viewer, target, samples, Math.random),
    spadesEvaluate: (g, seat, samples) => SA().evaluate(g, seat, samples, Math.random),
    spadesMove: (g, seat, level) => SA().chooseMove(g, seat, level, Math.random),
    spadesBid: (g, seat, level) => SA().chooseBid(g, seat, level, Math.random),
    spadesAdvise: (g, seat, sims) => SA().adviseBid(g, seat, sims, Math.random),
    spadesMake: (h, seat, n) => SA().makeChance(h, seat, n, Math.random),
  };
})(typeof self !== "undefined" ? self : globalThis);
