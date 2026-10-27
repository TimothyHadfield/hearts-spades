/* store.js — one versioned localStorage key, every read/write wrapped so the site still
 * works when storage is blocked (private mode, previews). Saves on every change. */
(function (root) {
  "use strict";
  const KEY = "heartsSpades:v1";
  const VERSION = "2026-10-27e";

  const DEFAULTS = {
    tab: "hearts",
    hearts: {
      level: "medium",
      target: 100, moon: "add", jack: false, queenBreaks: false, bleed: false, passing: "cycle4", players: 4, points: "standard",
      tracker: true, moonWarn: true, study: true, speed: "normal",
    },
    spades: {
      level: "medium",
      target: 500, nil: true, blindNil: false, blindNilBehind: 100, bagLimit: 10, bagPenalty: 100,
      nilCounts: false, spadesLead: "broken", loseAt: 0, firstLead: "left", bidding: "standard",
      advisor: true, study: true, tracker: true,
    },
    games: { hearts: null, spades: null },     // saved games in progress
    study: { hearts: [], spades: [] },          // per-hand study records (points lost etc.)
    record: { hearts: { played: 0, won: 0, hands: 0, pts: 0, lost: 0 }, spades: { played: 0, won: 0, hands: 0, pts: 0, lost: 0 } },
    score: {
      mode: "hearts",
      hearts: { names: ["Ann", "Ben", "Cal", "Dee"], hands: [] },
      spades: { teams: ["Us", "Them"], names: ["Ann", "Ben", "Cal", "Dee"], hands: [] },
    },
  };

  function merge(base, over) {
    if (over === undefined) return base;
    if (!over || typeof over !== "object" || !base || typeof base !== "object" || Array.isArray(base)) return over;
    const out = Array.isArray(base) ? [] : {};
    for (const k of Object.keys(base)) out[k] = k in over ? merge(base[k], over[k]) : base[k];
    for (const k of Object.keys(over)) if (!(k in base)) out[k] = over[k];
    return out;
  }

  let data = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const raw = root.localStorage && root.localStorage.getItem(KEY);
    if (raw) data = merge(data, JSON.parse(raw));
  } catch (e) { /* storage blocked or bad JSON: start fresh */ }

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }, 60);
  }
  function saveNow() { clearTimeout(timer); try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  root.Store = { get data() { return data; }, save, saveNow, VERSION, DEFAULTS };
})(typeof self !== "undefined" ? self : globalThis);
