/* app.js — tabs (with Back support through the URL hash) and the Settings page. */
(function (root) {
  "use strict";
  const { Table: T, Store } = root;
  const TABS = ["hearts", "spades", "score", "lab", "settings"];
  const MODULES = { hearts: root.HeartsUI, spades: root.SpadesUI, score: root.ScoreUI, lab: root.Lab, settings: null };
  let current = null;

  // ------------------------------------------------------------ settings
  // [key, label, type, options, help]
  const SCHEMA = [
    ["hearts", "Hearts rules", [
      ["target", "Game to", "seg", [[50, "50"], [100, "100"]]],
      ["points", "Point cards", "seg", [["standard", "Standard"], ["maria", "Black Maria"], ["spot", "Spot"]], "points"],
      ["passing", "Passing", "seg", [["cycle4", "L·R·A·Keep"], ["cycle3", "L·R·A"], ["left", "Left"], ["none", "None"]]],
      ["moon", "Moon", "seg", [["add", "+26 others"], ["subtract", "−26 me"], ["choice", "Choice"]], "moonChoice"],
      ["jack", "Jack of diamonds −10", "switch", null, "jack"],
      ["queenBreaks", "Queen breaks hearts", "switch"],
      ["bleed", "Points on first trick", "switch"],
    ]],
    ["spades", "Spades rules", [
      ["target", "Game to", "seg", [[200, "200"], [300, "300"], [500, "500"]]],
      ["bidding", "Bidding", "seg", [["standard", "Standard"], ["whiz", "Whiz"], ["mirror", "Mirror"], ["suicide", "Suicide"]], "bidding"],
      ["nil", "Nil bids", "switch"],
      ["blindNil", "Blind nil", "switch", null, "blindNil"],
      ["blindNilBehind", "Blind nil only when behind", "seg", [[100, "100+"], [0, "Any time"]]],
      ["bagLimit", "Bag penalty", "seg", [[10, "10 = −100"], [0, "None"]], "bags"],
      ["nilCounts", "Nil tricks help partner", "switch", null, "nilCounts"],
      ["spadesLead", "Lead spades", "seg", [["broken", "Once broken"], ["any", "Any time"]]],
      ["firstLead", "First lead", "seg", [["left", "Left of dealer"], ["2c", "2♣"]]],
      ["loseAt", "Lose at", "seg", [[0, "Off"], [200, "−200"], [500, "−500"]]],
    ]],
    ["helpers", "Study help", [
      ["hearts.tracker", "Hearts: cards left", "switch", null, "tracker"],
      ["hearts.moonWarn", "Hearts: moon warning", "switch", null, "moon"],
      ["hearts.study", "Hearts: points lost", "switch", null, "lost"],
      ["spades.advisor", "Spades: bid advisor", "switch", null, "advisor"],
      ["spades.tracker", "Spades: cards left", "switch", null, "tracker"],
      ["spades.study", "Spades: points lost", "switch", null, "lost"],
      ["hearts.speed", "Computer speed", "seg", [["normal", "Normal"], ["fast", "Fast"]]],
    ]],
  ];

  function getVal(group, key) {
    const d = Store.data;
    if (key.includes(".")) { const [g, k] = key.split("."); return d[g][k]; }
    return d[group][key];
  }
  function setVal(group, key, v) {
    const d = Store.data;
    if (key.includes(".")) { const [g, k] = key.split("."); d[g][k] = v; }
    else d[group][key] = v;
    Store.save();
  }

  function settingsHTML() {
    let out = `<div class="page"><div class="page-in set-page"><h2>Settings</h2><div class="cols">`;
    for (const [group, title, rows] of SCHEMA) {
      out += `<div class="sec"><h3>${title}</h3>`;
      for (const [key, label, type, opts, help] of rows) {
        const v = getVal(group, key);
        out += `<div class="set-row"><span class="lab">${label}${help ? T.help(help) : ""}</span>`;
        if (type === "switch") out += `<label class="switch"><input type="checkbox" data-g="${group}" data-k="${key}" ${v ? "checked" : ""} aria-label="${label}"><span></span></label>`;
        else out += `<div class="seg" data-g="${group}" data-k="${key}">${opts.map(([ov, ol]) => `<button data-v="${ov}" aria-pressed="${String(v) === String(ov)}">${ol}</button>`).join("")}</div>`;
        out += `</div>`;
      }
      if (group !== "helpers") out += `<p class="muted" style="font-size:12px;margin:6px 0 0">Rule changes start with your next new game.</p>`;
      out += `</div>`;
    }
    if (root.COACH && root.HSCoach) out += `<div class="sec"><h3>Learn</h3><div class="learn-row"><button class="btn" data-learn="rules-hearts">Hearts rules</button><button class="btn" data-learn="rules-spades">Spades rules</button><button class="btn" data-learn="tutorial">Replay tutorial</button></div></div>`;
    if (root.Profile && root.HSProfile) out += `<div class="sec"><h3>My stats</h3><div class="learn-row"><button class="btn" data-learn="stats-hearts">Hearts</button><button class="btn" data-learn="stats-spades">Spades</button></div></div>`;
    out += `<div class="sec"><h3>Sound &amp; effects</h3><div class="fx-box"></div></div>`;
    out += `<div class="sec"><h3>Online</h3><p class="muted" style="font-size:13px;margin:0">On the Hearts or Spades table, tap Play online to make a room and send friends its code. Empty seats are played by computers.</p></div>`;
    out += `</div><p class="ver">Version ${Store.VERSION} · <a href="../">More board &amp; card games</a></p></div></div>`;
    return out;
  }

  function mountSettings(view) {
    view.addEventListener("click", (e) => {
      const l = e.target.closest("[data-learn]");
      if (l) {
        const k = l.dataset.learn;
        if (k === "rules-hearts") root.Lab.rulesSheet("hearts");
        if (k === "rules-spades") root.Lab.rulesSheet("spades");
        if (k === "tutorial") startTutorial();
        if (k === "stats-hearts") root.HeartsUI.openStats();
        if (k === "stats-spades") root.SpadesUI.openStats();
        return;
      }
      const b = e.target.closest(".seg[data-k] button");
      if (!b) return;
      const seg = b.parentElement;
      const raw = b.dataset.v;
      const v = /^-?\d+$/.test(raw) ? +raw : raw;
      setVal(seg.dataset.g, seg.dataset.k, v);
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    view.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("input[type=checkbox][data-k]")) setVal(t.dataset.g, t.dataset.k, t.checked);
    });
  }

  // ---------------------------------------------------------------- tabs
  function go(tab, replace) {
    if (!TABS.includes(tab)) tab = "hearts";
    if (location.hash.slice(1) !== tab) {
      try { (replace ? history.replaceState : history.pushState).call(history, null, "", "#" + tab); } catch (e) { /* ignore */ }
    }
    show(tab);
  }
  function show(tab) {
    current = tab;
    if (tab !== "hearts" && root.COACH) root.COACH.closeOffer();
    Store.data.tab = tab; Store.save();
    document.querySelectorAll(".tab").forEach((b) => { b.classList.toggle("active", b.dataset.tab === tab); b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"); });
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + tab));
    const view = document.getElementById("view-" + tab);
    if (tab === "settings") {
      view.innerHTML = settingsHTML();
      const box = view.querySelector(".fx-box");
      if (box && root.FX) root.FX.renderSettings(box);
    }
    else MODULES[tab].show();
  }

  function init() {
    root.Art.init();
    T.initSheet();
    for (const t of TABS) {
      const v = document.getElementById("view-" + t);
      if (t === "settings") mountSettings(v); else MODULES[t].mount(v);
    }
    document.getElementById("tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (b && b.dataset.tab !== current) go(b.dataset.tab);
    });
    window.addEventListener("hashchange", () => {
      const t = location.hash.slice(1);
      if (TABS.includes(t) && t !== current) show(t);
    });
    const start = location.hash.slice(1);
    go(TABS.includes(start) ? start : Store.data.tab || "hearts", true);
    initCoach();
    window.addEventListener("pagehide", () => Store.saveNow());
  }

  // ------------------------------------------- rules, My stats and the guided game
  // The rules sheet and the My stats panel each take one Back press (a history entry), like the game's own sheets.
  let modal = null;
  function modalOpened(kind) {
    modal = kind;
    try { history.pushState({ modal: kind }, ""); } catch (e) { /* ignore */ }
  }
  function modalClosed() {
    if (!modal) return;
    modal = null;
    try { history.back(); } catch (e) { /* ignore */ }
  }
  window.addEventListener("popstate", () => {
    if (!modal) return;
    const k = modal;
    modal = null;
    if (k === "rules" && root.COACH && root.COACH.rulesOpen()) root.COACH.closeRules();
    if (k === "profile" && root.Profile && root.Profile.isOpen()) root.Profile.closePanel();
  });
  if (root.Profile) root.Profile.onChange((what) => { if (what === "close" && modal === "profile") modalClosed(); });

  let tour = null;
  function startTutorial() {
    if (!tour) return;
    if (root.COACH) root.COACH.closeOffer();
    tour.reset();
    root.HeartsUI.startTutorial();
    tour.start(0);
  }
  function initCoach() {
    if (!root.COACH || !root.HSCoach) return;
    const sheet = document.getElementById("sheet-back");
    tour = root.COACH.tour({
      id: root.HSCoach.ID,
      steps: root.HSCoach.steps({ state: () => root.HeartsUI.state }),
      pauseIf: () => current !== "hearts" || !sheet.hidden || !root.HeartsUI.state || !root.HeartsUI.state.tutorial || root.HeartsUI.state.online || (root.Profile && root.Profile.isOpen()),
    });
    new MutationObserver(() => root.COACH.update()).observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(() => root.COACH.update()).observe(document.getElementById("view-hearts"), { childList: true });
    const s = root.HeartsUI.state;
    if (s && s.tutorial && tour.saved()) tour.resume();
  }

  // A new deploy reloads the page by itself only when nothing would be lost.
  function safeToReload() {
    if (root.HeartsUI.room || root.SpadesUI.room) return false;
    const sheet = document.getElementById("sheet-back");
    if (sheet && !sheet.hidden) return false;
    if ((root.COACH && root.COACH.rulesOpen()) || (root.Profile && root.Profile.isOpen())) return false;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    if (current === "hearts" || current === "spades") {
      const s = (current === "hearts" ? root.HeartsUI : root.SpadesUI).state;
      if (s && (s.busy || s.cpuPending || s.thinking || s.tutorial || !(s.game.over || s.game.hand.phase === "done"))) return false;
    }
    return true;
  }
  if (root.PWA) root.PWA.safeToReload = safeToReload;

  root.App = { go, get tab() { return current; }, modalOpened, modalClosed, startTutorial };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof self !== "undefined" ? self : globalThis);
