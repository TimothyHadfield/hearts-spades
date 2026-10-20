/* worker.js — runs the look-ahead maths (hints, points lost, computer moves, odds) off the
 * main thread so taps and animations never freeze. Messages: {id, fn, args} -> {id, result} or {id, error}. */
/* global importScripts */
importScripts("cards.js?v=2026-10-20c", "hearts.js?v=2026-10-20c", "hearts-ai.js?v=2026-10-20c", "spades.js?v=2026-10-20c", "spades-ai.js?v=2026-10-20c", "think-fns.js?v=2026-10-20c");
self.onmessage = (e) => {
  const { id, fn, args } = e.data;
  try { self.postMessage({ id, result: self.ThinkFns[fn].apply(null, args) }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
