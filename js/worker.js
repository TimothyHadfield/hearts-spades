/* worker.js — runs the look-ahead maths (hints, points lost, computer moves, odds) off the
 * main thread so taps and animations never freeze. Messages: {id, fn, args} -> {id, result} or {id, error}. */
/* global importScripts */
importScripts("cards.js?v=2026-10-27f", "hearts.js?v=2026-10-27f", "hearts-ai.js?v=2026-10-27f", "spades.js?v=2026-10-27f", "spades-ai.js?v=2026-10-27f", "think-fns.js?v=2026-10-27f");
self.onmessage = (e) => {
  const { id, fn, args } = e.data;
  try { self.postMessage({ id, result: self.ThinkFns[fn].apply(null, args) }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
