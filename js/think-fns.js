/* think-fns.js — the slow functions the pages ask for, by name. Loaded both in the worker and
 * on the page (the page uses them directly if workers aren't available). */
(function (root) {
  "use strict";
  const HA = () => root.HeartsAI, SA = () => root.SpadesAI;
  root.ThinkFns = {
    heartsEvaluate: (h, seat, samples, opts) => HA().evaluate(h, seat, samples, Math.random, opts),
    heartsMove: (h, seat, level, opts) => HA().chooseMove(h, seat, level, Math.random, opts),
    heartsMoon: (h, viewer, target, samples) => HA().moonChance(h, viewer, target, samples, Math.random),
    spadesEvaluate: (g, seat, samples) => SA().evaluate(g, seat, samples, Math.random),
    spadesMove: (g, seat, level) => SA().chooseMove(g, seat, level, Math.random),
    spadesBid: (g, seat, level) => SA().chooseBid(g, seat, level, Math.random),
    spadesAdvise: (g, seat, sims) => SA().adviseBid(g, seat, sims, Math.random),
    spadesMake: (h, seat, n) => SA().makeChance(h, seat, n, Math.random),
  };
})(typeof self !== "undefined" ? self : globalThis);
