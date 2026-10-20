/* think.js — Think.run(fn, ...args) returns a Promise with the answer from the background worker.
 * One job at a time, in order. Without workers (or if the worker fails) it runs on the page instead. */
(function (root) {
  "use strict";
  let worker = null, seq = 0, broken = false;
  const waiting = new Map();

  function start() {
    if (worker || broken || typeof Worker === "undefined") return worker;
    try {
      worker = new Worker("js/worker.js?v=2026-10-19b");
      worker.onmessage = (e) => {
        const w = waiting.get(e.data.id);
        if (!w) return;
        waiting.delete(e.data.id);
        if ("error" in e.data) w.reject(new Error(e.data.error)); else w.resolve(e.data.result);
      };
      worker.onerror = () => {
        // Worker failed to load: finish everything waiting on the page itself.
        broken = true; worker = null;
        for (const [, w] of waiting) w.fallback();
        waiting.clear();
      };
    } catch (e) { broken = true; worker = null; }
    return worker;
  }

  function local(fn, args) {
    return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(root.ThinkFns[fn].apply(null, args)); } catch (e) { reject(e); }
    }, 0));
  }

  function run(fn, ...args) {
    const w = start();
    if (!w) return local(fn, args);
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, fallback: () => local(fn, args).then(resolve, reject) });
      w.postMessage({ id, fn, args });
    });
  }

  root.Think = { run };
})(typeof self !== "undefined" ? self : globalThis);
