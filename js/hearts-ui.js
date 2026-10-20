/* hearts-ui.js — the Hearts table: you (seat 0) against three computers.
 * Holds the game state, drives the computer seats on timers (with a generation token so
 * nothing from an old game leaks into a new one), and draws the table, tracker, hints,
 * points lost and the moon warning. All game rules come from hearts.js via apply(). */
(function (root) {
  "use strict";
  const { Cards: C, Hearts: H, HeartsAI: AI, Table: T, Art, Store } = root;
  const BASE_NAMES = ["You", "Left", "Across", "Right"];
  let NAMES = BASE_NAMES;   // by position relative to you: you, left, across, right
  let ME = 0;               // your seat (0 on this device; online it's whatever seat you got)
  let R = null;             // online room: { snap } while you're in one
  const HINT_SAMPLES = 120;
  let el = null;
  let S = null;    // runtime state for the game in progress (null = start screen)
  let gen = 0;     // bumps on every new game / quit, cancels old timers

  const cfg = () => Store.data.hearts;
  const delay = () => (cfg().speed === "fast" ? 260 : 620);

  function persist() {
    if (S && S.online) return;   // online games live in the room, not in this browser
    Store.data.games.hearts = S ? { game: S.game, level: S.level, handStudy: S.handStudy, fresh: [...S.fresh], recorded: S.recorded } : null;
    Store.save();
  }

  function restore() {
    const saved = Store.data.games.hearts;
    if (!saved || !saved.game || !saved.game.hand) return;
    S = blank(saved.game, saved.level);
    S.handStudy = saved.handStudy || [];
    S.fresh = new Set(saved.fresh || []);
    S.recorded = saved.recorded ?? -1;
  }

  function blank(game, level) {
    return {
      game, level, sel: new Set(), fresh: new Set(), freshTrick: new Set(), showTrick: null, collecting: false,
      hint: null, lastLoss: null, handStudy: [], moon: null, dealAnim: false, busy: false, recorded: -1, keyProbs: null, thinking: false, cpuPending: null,
    };
  }

  // -------------------------------------------------------------- game flow
  function newGame() {
    gen++;
    const c = cfg();
    let g = H.apply(null, { type: "new", opts: { target: c.target, moon: c.moon, jack: c.jack, queenBreaks: c.queenBreaks, bleed: c.bleed, passing: c.passing } });
    S = blank(g, c.level);
    dealNext();
  }

  function dealNext() {
    const g = H.apply(S.game, { type: "deal", deck: C.shuffle(C.deck()) });
    S.game = g;
    S.sel.clear(); S.fresh.clear(); S.freshTrick.clear(); S.hint = null; S.lastLoss = null; S.handStudy = []; S.moon = null; S.keyProbs = null;
    S.dealAnim = true;
    // Computers choose their passes straight away; you pick yours.
    if (g.hand.phase === "pass") {
      for (let s = 1; s < 4; s++) S.game = H.apply(S.game, { type: "pass", seat: s, cards: AI.choosePass(S.game.hand.hands[s], S.level) });
    }
    persist();
    step();
  }

  function step() {
    if (!S || S.busy) return render();
    const g = S.game, h = g.hand;
    render();
    if (S.online) return;        // online, the host's browser plays the computers
    if (!h || h.phase !== "play" || g.over) return;
    if (h.turn === ME) return;
    const my = gen, g0 = S.game;
    if (S.cpuPending === g0) return;
    S.cpuPending = g0;
    // Think in the background while the pause runs, so a slow Hard move never freezes the page.
    const wait = new Promise((r) => setTimeout(r, delay()));
    Promise.all([root.Think.run("heartsMove", h, h.turn, S.level, g.opts), wait]).then(([card]) => {
      if (my !== gen || !S || S.game !== g0) return;
      S.cpuPending = null;
      if (S.busy) return;
      doPlay(h.turn, card);
    }, (err) => { if (S) S.cpuPending = null; T.toast("Computer error: " + err.message); });
  }

  function doPlay(seat, card) {
    const before = S.game;
    S.game = H.apply(before, { type: "play", seat, card });
    S.freshTrick.add(card);
    S.sel.clear();
    if (seat === ME) { S.fresh.clear(); recordLoss(before.hand, card); S.hint = null; }
    const h = S.game.hand;
    persist();
    if (h.trick.length === 0) {
      // Trick complete: show all four, then sweep them to the winner.
      const my = gen;
      S.showTrick = h.lastTrick;
      S.busy = true;
      render();
      setTimeout(() => {
        if (my !== gen) return;
        S.collecting = true; render();
        setTimeout(() => {
          if (my !== gen) return;
          S.showTrick = null; S.collecting = false; S.freshTrick.clear(); S.busy = false; S.keyProbs = null;
          if (h.phase === "done") onHandDone();
          updateMoon();
          step();
        }, 380);
      }, cfg().speed === "fast" ? 550 : 950);
    } else step();
  }

  function onHandDone() {
    const g = S.game;
    if (S.recorded === g.handNo) return;
    S.recorded = g.handNo;
    const rec = Store.data.record.hearts;
    const lost = S.handStudy.reduce((a, x) => a + x.lost, 0);
    rec.hands++; rec.pts += g.hand.result.pts[ME]; rec.lost += lost;
    Store.data.study.hearts.push({ t: Date.now(), pts: g.hand.result.pts[ME], lost: +lost.toFixed(2), plays: S.handStudy.length, level: S.level });
    if (Store.data.study.hearts.length > 400) Store.data.study.hearts.shift();
    if (g.over) { rec.played++; if (g.winners.includes(ME)) rec.won++; }
    persist();
  }

  /** Points lost for your card, measured from the position before you played it. */
  function recordLoss(hBefore, card) {
    if (!cfg().study) return;
    const moves = H.legal(hBefore, ME);
    if (moves.length < 2) { S.handStudy.push({ trick: hBefore.trickNo + 1, card, best: card, lost: 0 }); return; }
    const hintEvs = S.hint && S.hint.forTrick === key(hBefore) ? S.hint.list : null;
    const my = gen;
    const run = (list) => {
      if (my !== gen || !S) return;
      const best = list[0], mine = list.find((x) => x.card === card);
      const lost = Math.max(0, mine.ev - best.ev);
      const rec = { trick: hBefore.trickNo + 1, card, best: best.card, lost: +lost.toFixed(2) };
      S.handStudy.push(rec);
      S.lastLoss = rec;
      persist();
      if (!S.busy) render(); else renderPrompt();
    };
    if (hintEvs) run(hintEvs);
    else root.Think.run("heartsEvaluate", hBefore, ME, 90, S.game.opts).then(run, () => {});
  }

  const key = (h) => h.trickNo * 10 + h.trick.length + ":" + h.hands[ME].length;

  function updateMoon() {
    if (!S) return;
    S.moon = null;
    if (!cfg().moonWarn) return;
    const g0 = S.game, h = g0.hand;
    if (!h || h.phase !== "play") return;
    const threat = AI.moonThreat(h, ME, 5);
    if (threat < 0) return;
    const my = gen, tn = h.trickNo;
    root.Think.run("heartsMoon", h, ME, threat, 160).then((chance) => {
      if (my !== gen || !S || !S.game.hand || S.game.hand.trickNo !== tn) return;
      S.moon = chance >= 0.03 ? { seat: threat, chance } : null;
      if (!S.busy) render();
    }, () => {});
  }

  function hint() {
    const h = S && S.game.hand;
    if (!h) return;
    if (h.phase === "pass" && !h.passes[ME]) {
      S.hint = { pass: new Set(AI.choosePass(h.hands[ME], "hard")) };
      return render();
    }
    if (h.phase !== "play" || h.turn !== ME || S.busy || S.thinking) return;
    if (S.hint && S.hint.forTrick === key(h)) { S.hint = null; return render(); }
    const my = gen, k = key(h);
    S.thinking = true; render();
    root.Think.run("heartsEvaluate", h, ME, HINT_SAMPLES, S.game.opts).then((list) => {
      if (my !== gen || !S) return;
      S.thinking = false;
      if (S.game.hand && key(S.game.hand) === k && S.game.hand.turn === ME) S.hint = { forTrick: k, list };
      render();
    }, () => { if (S) { S.thinking = false; render(); } });
  }

  // ---------------------------------------------------------------- render
  const isCpu = (s) => (R && R.snap && R.snap.seats ? R.snap.seats[s].kind !== "human" : s !== ME);

  function seatSub(h, s) {
    if (!h) return "";
    let out = `<span class="pts">${h.taken[s] ? "♥ " + h.taken[s] : "♥ 0"}</span>`;
    if (S.game.opts.jack && h.jackBy === s) out += " · J♦";
    return out;
  }

  function render() {
    if (!el) return;
    if (!S) return renderStart();
    const g = S.game, h = g.hand;
    const passing = h.phase === "pass";
    const passName = H.PASS_NAMES[h.passOffset];
    const trickShown = S.showTrick ? S.showTrick.cards : h.trick;
    const win = S.showTrick ? S.showTrick.winner : -1;
    const myTurn = h.phase === "play" && h.turn === ME && !S.busy;

    let seats = "";
    for (let s = 0; s < 4; s++) {
      const pos = T.POS[T.rel(s, ME)];
      seats += T.seatHTML({
        pos, seat: s, name: NAMES[T.rel(s, ME)], score: g.scores[s], sub: seatSub(h, s), cpu: isCpu(s), initial: NAMES[T.rel(s, ME)][0],
        turn: h.phase === "play" && h.turn === s && !S.busy, count: s !== ME ? h.hands[s].length : null,
      });
    }

    let center = "";
    if (h.phase === "done" && !S.showTrick) center = summaryHTML();
    else if (passing && !h.passes[ME]) center = `<div class="felt-msg">Pass 3 cards <b>${passName}</b></div>`;
    else if (h.trickNo === 0 && !trickShown.length && h.received[ME] && S.fresh.size) center = `<div class="felt-msg">Blue outline = cards you got</div>`;

    const moon = S.moon && h.phase === "play" ? `<div class="moon">Moon risk · ${NAMES[T.rel(S.moon.seat, ME)]} ${Math.round(S.moon.chance * 100)}%${T.help("moon")}</div>` : "";

    const metaTxt = h.phase === "pass" ? `Hand ${g.handNo + 1} · pass ${passName}` :
      h.phase === "play" ? `Hand ${g.handNo + 1} · trick ${Math.min(13, h.trickNo + 1)} of 13` : `Hand ${g.handNo} done`;

    const td = T.trackerData(h, ME);
    el.innerHTML =
      `<div class="game"><div class="game-main">` +
      `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">${metaTxt} · ${S.level}</span></div>` +
      `<button class="btn sm hint-btn${S.hint ? " on" : ""}${S.thinking ? " thinking" : ""}" data-act="hint" ${(myTurn || (passing && !h.passes[ME])) && !S.thinking ? "" : "disabled"}>Hint</button>` +
      `<button class="icon-btn" data-act="menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>` +
      `<div class="felt">${seats}${T.trickHTML(trickShown, ME, S.freshTrick, win, S.collecting ? win : null)}${center}${moon}</div>` +
      (cfg().tracker ? T.stripHTML(td, NAMES, ME) : "") +
      `<div class="prompt" id="h-prompt">${promptHTML()}</div>` +
      `<div class="hand-wrap">${handHTMLFor(h, myTurn, passing)}</div>` +
      `</div><aside class="game-side">${sideHTML(td)}</aside></div>`;
    S.dealAnim = false;
    T.fitHand(el.querySelector(".hand-wrap"));
  }

  function handHTMLFor(h, myTurn, passing) {
    const cards = h.hands[ME];
    const opts = { sel: S.sel, fresh: S.fresh, deal: S.dealAnim };
    if (passing && !h.passes[ME]) {
      opts.legal = new Set(cards);
      if (S.hint && S.hint.pass) opts.best = S.hint.pass;
    } else if (myTurn) {
      opts.legal = new Set(H.legal(h, ME));
      if (S.hint && S.hint.list && S.hint.forTrick === key(h)) {
        const list = S.hint.list, best = list[0].ev, worst = list[list.length - 1].ev;
        opts.evs = new Map(list.map((x) => [x.card, { txt: x.ev.toFixed(1), color: T.scaleColor(x.ev, best, worst) }]));
        opts.best = new Set([list[0].card]);
      }
    }
    return T.handHTML(cards, opts);
  }

  function promptHTML() {
    const g = S.game, h = g.hand;
    let msg = "", btn = "";
    if (h.phase === "pass") {
      if (!h.passes[ME]) {
        msg = `<b>Pick 3 to pass ${H.PASS_NAMES[h.passOffset]}</b><span class="small">${S.sel.size}/3 chosen${S.hint && S.hint.pass ? " · green = suggested" + "" : ""}</span>`;
        btn = `<button class="btn warm" data-act="pass" ${S.sel.size === 3 ? "" : "disabled"}>Pass</button>`;
      }
    } else if (h.phase === "play") {
      if (h.turn === ME && !S.busy) {
        const lead = h.trick.length === 0;
        msg = `<b>${lead ? (h.trickNo === 0 ? "Lead the 2♣" : "Your lead") : "Your turn"}</b>`;
        if (S.sel.size) msg += `<span class="small">Tap again to play</span>`;
        else msg += lossLine();
      } else {
        msg = `<span>${S.busy ? (S.showTrick ? NAMES[T.rel(S.showTrick.winner, ME)] + " take" + (S.showTrick.winner === ME ? "" : "s") + " it" + (S.showTrick.points ? ` · ${S.showTrick.points} pt${S.showTrick.points > 1 ? "s" : ""}` : "") : "") : NAMES[T.rel(h.turn, ME)] + " is playing…"}</span>` + lossLine();
      }
      if (S.hint && S.hint.list && h.turn === ME) btn = T.help("ev");
    } else {
      msg = `<b>${g.over ? "Game over" : "Hand over"}</b>` + lossLine();
    }
    return `<div class="msg">${msg}</div>${btn}`;
  }

  function lossLine() {
    if (!cfg().study || !S.lastLoss) return "";
    const L = S.lastLoss;
    const color = L.lost < 0.3 ? "var(--good)" : L.lost < 1.5 ? "var(--accent-warm)" : "var(--bad)";
    return `<span class="small">Last: ${C.name(L.card)} · <span style="color:${color};font-weight:700">lost ${L.lost.toFixed(1)}</span>${L.best !== L.card ? " (best " + C.name(L.best) + ")" : ""} ${T.help("lost")}</span>`;
  }

  function renderPrompt() {
    const p = el && el.querySelector("#h-prompt");
    if (p) p.innerHTML = promptHTML();
  }

  function summaryHTML() {
    const g = S.game, h = g.hand, r = h.result;
    const lost = S.handStudy.reduce((a, x) => a + x.lost, 0);
    let rows = "";
    const order = [0, 1, 2, 3].map((k) => (ME + k) % 4);
    const low = Math.min(...g.scores);
    for (const s of order) {
      rows += `<tr class="${s === ME ? "me" : ""}"><td>${NAMES[T.rel(s, ME)]}</td><td>${h.taken[s]}</td><td>${r.pts[s] > 0 ? "+" : ""}${r.pts[s]}</td><td class="${g.scores[s] === low ? "good" : ""}">${g.scores[s]}</td></tr>`;
    }
    let title = g.over ? (g.winners.includes(ME) ? (g.winners.length > 1 ? "You tie for the win" : "You win!") : NAMES[T.rel(g.winners[0], ME)] + " wins") : "Hand " + g.handNo;
    let note = r.moonBy >= 0 ? `<div class="warm" style="margin-bottom:6px;font-weight:700">${NAMES[T.rel(r.moonBy, ME)]} shot the moon!</div>` : "";
    return `<div class="panel-c"><h3>${T.esc(title)}</h3>${note}<table class="mini"><tr><th></th><th>Took</th><th>Scored</th><th>Total</th></tr>${rows}</table>` +
      (cfg().study && S.handStudy.length ? `<div class="muted" style="margin-top:8px">Your points lost this hand: <b style="color:${lost < 1 ? "var(--good)" : lost < 4 ? "var(--accent-warm)" : "var(--bad)"}">${lost.toFixed(1)}</b> ${T.help("lost")}</div>` : "") +
      `<div class="row" style="margin-top:12px"><button class="btn" data-act="reveal">All hands</button><span style="flex:1"></span>` +
      (g.over ? `<button class="btn primary" data-act="new">New game</button>` : `<button class="btn primary" data-act="next">Next hand</button>`) + `</div></div>`;
  }

  function sideHTML(td) {
    const g = S.game, h = g.hand;
    let hist = `<table class="mini"><tr><th>#</th>${[0, 1, 2, 3].map((s) => `<th>${T.esc(NAMES[T.rel(s, ME)].slice(0, 6))}</th>`).join("")}</tr>`;
    g.history.slice(-8).forEach((x, i) => {
      const n = g.history.length - Math.min(8, g.history.length) + i + 1;
      hist += `<tr><td>${n}</td>${x.pts.map((p) => `<td>${p}</td>`).join("")}</tr>`;
    });
    hist += `<tr class="me"><td>Total</td>${g.scores.map((p) => `<td>${p}</td>`).join("")}</tr></table>`;
    let study = "";
    if (cfg().study) {
      study = S.handStudy.length ? S.handStudy.map((x) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Trick ${x.trick} · ${C.name(x.card)}${x.best !== x.card ? ` <span style="color:var(--muted)">(best ${C.name(x.best)})</span>` : ""}</span><b style="color:${x.lost < 0.3 ? "var(--good)" : x.lost < 1.5 ? "var(--accent-warm)" : "var(--bad)"}">${x.lost.toFixed(1)}</b></div>`).join("")
        : `<div class="muted" style="font-size:13px">Your plays this hand show here with the points each one lost.</div>`;
    }
    return `<div class="side-sec"><h4>Scores · game to ${g.opts.target}</h4>${hist}</div>` +
      (cfg().tracker ? `<div class="side-sec"><h4>Cards left ${T.help("tracker")}</h4>${T.trackerDetailHTML(td, NAMES, ME, keyProbs())}</div>` : "") +
      (cfg().study ? `<div class="side-sec fill"><h4>Points lost ${T.help("lost")}</h4>${study}</div>` : "");
  }

  const sideVisible = () => root.matchMedia && root.matchMedia("(min-width: 900px)").matches;

  /** Where are the queen, king and ace of spades likely to be? Sampled from what you know. */
  function keyProbs(force) {
    const h = S.game.hand;
    if (!h || h.phase !== "play") return null;
    if (!force && !sideVisible()) return null;
    if (S.keyProbs && S.keyProbs.k === key(h)) return S.keyProbs.v;
    const mine = new Set(h.hands[ME]);
    const keys = [H.QS, C.card(C.SPADES, 12), C.card(C.SPADES, 11), C.card(C.HEARTS, 12)].filter((c) => !h.played[c] && !mine.has(c));
    const cnt = keys.map(() => [0, 0, 0]);
    const N = 300;
    for (let i = 0; i < N; i++) {
      const w = AI.sampleWorld(h, ME, Math.random);
      keys.forEach((c, j) => { for (let k = 1; k < 4; k++) if (w[(ME + k) % 4].includes(c)) cnt[j][k - 1]++; });
    }
    const v = keys.map((c, j) => ({ card: c, p: cnt[j].map((x) => x / N) }));
    S.keyProbs = { k: key(h), v };
    return v;
  }

  function renderStart() {
    if (R && R.snap && R.snap.status === "lobby") {
      el.innerHTML = `<div class="game"><div class="game-main">` +
        `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">Online room · ${T.esc(R.snap.options && R.snap.options.level || "medium")} computers</span></div></div>` +
        `<div class="felt">${root.OnlineUI.lobbyHTML(R.snap, (i) => i === ME ? "You" : BASE_NAMES[T.rel(i, ME)])}</div></div></div>`;
      return;
    }
    const c = cfg();
    const lv = ["easy", "medium", "hard"];
    const rules = [`Game to ${c.target}`, c.passing === "none" ? "no passing" : c.passing === "left" ? "pass left only" : c.passing === "cycle3" ? "pass L/R/across" : "pass L/R/across/keep",
      c.moon === "subtract" ? "moon −26" : c.moon === "choice" ? "moon: shooter's choice" : "moon +26 to others"];
    if (c.jack) rules.push("J♦ −10");
    if (c.queenBreaks) rules.push("Q♠ breaks hearts");
    if (c.bleed) rules.push("points on trick 1");
    el.innerHTML = `<div class="game"><div class="game-main">` +
      `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">You vs 3 computers · lowest score wins</span></div></div>` +
      `<div class="felt"><div class="panel-c start">` +
      `<h3>New game</h3>` +
      `<div class="seats"><div>Left<b>Computer</b></div><div>Across<b>Computer</b></div><div>Right<b>Computer</b></div></div>` +
      `<div style="display:flex;align-items:center;font-size:13px;color:var(--muted)">Computer level ${T.help("level", "hearts")}</div>` +
      `<div class="seg levels" data-act="level">${lv.map((l) => `<button data-level="${l}" aria-pressed="${c.level === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("")}</div>` +
      `<div class="muted" style="margin-bottom:12px">${rules.join(" · ")} · <a href="#settings" data-act="go-settings">change</a></div>` +
      `<button class="btn primary wide" data-act="deal">Deal</button>` +
      `<button class="btn wide" data-act="online" style="margin-top:8px">Play online</button>` +
      `</div></div></div></div>`;
  }

  // ----------------------------------------------------------------- input
  function onClick(e) {
    const a = e.target.closest("[data-act]");
    const cardEl = e.target.closest(".hc");
    if (e.target.closest("[data-on],[data-on-seat]") && R) { root.OnlineUI.lobbyClick("hearts", e); return; }
    if (a && el.contains(a)) {
      const act = a.dataset.act;
      if (act === "deal") return newGame();
      if (act === "online") return openOnline();
      if (act === "level") {
        const b = e.target.closest("[data-level]");
        if (b) { cfg().level = b.dataset.level; Store.save(); render(); }
        return;
      }
      if (act === "go-settings") { e.preventDefault(); return root.App.go("settings"); }
      if (act === "hint") return hint();
      if (act === "menu") return menu();
      if (act === "pass") return submitPass();
      if (act === "next") return S.online ? send({ type: "next" }) : dealNext();
      if (act === "new") { if (S.online) return root.OnlineUI.leave("hearts"); S = null; persist(); return render(); }
      if (act === "reveal") return reveal();
      if (act === "tracker") return trackerSheet();
    }
    if (cardEl && S) return tapCard(+cardEl.dataset.card);
  }

  function tapCard(card) {
    const h = S.game.hand;
    if (h.phase === "pass" && !h.passes[ME]) {
      if (S.sel.has(card)) S.sel.delete(card);
      else if (S.sel.size < 3) S.sel.add(card);
      return render();
    }
    if (h.phase !== "play" || h.turn !== ME || S.busy) return;
    if (!H.legal(h, ME).includes(card)) { T.toast(h.trick.length ? "Follow suit if you can" : (h.trickNo === 0 ? "The 2♣ leads first" : "Hearts aren't broken yet")); return; }
    if (S.sel.has(card)) {
      if (!S.online) return doPlay(ME, card);
      if (S.sending) return;
      recordLoss(h, card); S.hint = null; S.fresh.clear();
      return send({ type: "play", card });
    }
    S.sel = new Set([card]);
    render();
  }

  function submitPass() {
    const h = S.game.hand;
    if (S.sel.size !== 3) return;
    if (S.online) return send({ type: "pass", cards: [...S.sel] });
    S.game = H.apply(S.game, { type: "pass", seat: ME, cards: [...S.sel] });
    S.fresh = new Set(S.game.hand.received[ME] || []);
    S.sel.clear(); S.hint = null;
    persist();
    step();
  }

  function menu() {
    if (S.online) {
      T.openSheet(`<h3>Online room ${T.esc(R.snap.code || "")}</h3><p>Lowest score wins once someone reaches ${S.game.opts.target}. If you leave, a computer takes your seat.</p>` +
        `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-m="leave">Leave room</button><button class="btn" data-m="rules">Rules</button></div>`,
        (sh) => sh.addEventListener("click", (e) => {
          const b = e.target.closest("[data-m]");
          if (!b) return;
          if (b.dataset.m === "leave") { T.closeSheet(); root.OnlineUI.leave("hearts"); }
          if (b.dataset.m === "rules") { T.closeSheet(); setTimeout(() => root.Lab.rulesSheet("hearts"), 30); }
        }));
      return;
    }
    T.openSheet(`<h3>Hearts</h3><p>Lowest score wins once someone reaches ${S.game.opts.target}.</p>` +
      `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-m="new">New game</button><button class="btn" data-m="rules">Rules</button><button class="btn" data-m="strength">How strong?</button></div>`,
      (sh) => sh.addEventListener("click", (e) => {
        const b = e.target.closest("[data-m]");
        if (!b) return;
        if (b.dataset.m === "new") { T.closeSheet(); gen++; S = null; persist(); render(); }
        if (b.dataset.m === "rules") { T.closeSheet(); setTimeout(() => root.Lab.rulesSheet("hearts"), 30); }
        if (b.dataset.m === "strength") { T.closeSheet(); setTimeout(() => root.Lab.strengthSheet("hearts"), 30); }
      }));
  }

  function trackerSheet() {
    const h = S.game.hand;
    T.openSheet(`<h3>Cards left ${T.help("tracker")}</h3>` + T.trackerDetailHTML(T.trackerData(h, ME), NAMES, ME, keyProbs(true)));
  }

  function reveal() {
    const h = S.game.hand;
    let out = `<h3>Everyone's starting hand</h3>`;
    for (let s = 0; s < 4; s++) {
      out += `<div style="margin:8px 0 4px;font-size:13px;color:var(--muted)">${NAMES[T.rel(s, ME)]} · took ${h.taken[s]}</div><div style="display:flex;flex-wrap:wrap;gap:2px">` +
        h.start[s].map((c) => `<div style="width:30px">${Art.cardHTML(c)}</div>`).join("") + `</div>`;
      if (h.passes[s]) out += `<div style="font-size:12px;color:var(--muted);margin-top:2px">Passed ${h.passes[s].map(C.name).join(" ")}</div>`;
    }
    T.openSheet(out);
  }

  // ----------------------------------------------------------------- online
  function openOnline() {
    const c = cfg();
    root.OnlineUI.openSheet("hearts", { level: c.level, target: c.target, moon: c.moon, jack: c.jack, queenBreaks: c.queenBreaks, bleed: c.bleed, passing: c.passing }, onSnap);
  }

  function send(action) {
    if (S.sending) return;
    S.sending = true;
    root.OnlineUI.act("hearts", action).then((r) => {
      if (!S) return;
      S.sending = false;
      if (r && r.ok) { S.sel.clear(); }
      render();
    });
  }

  /** Every change in the online room lands here: lobby, moves, hand over, room closed. */
  function onSnap(snap) {
    if (!snap || ["left", "closed", "none"].includes(snap.status) || (snap.mySeat != null && snap.mySeat < 0 && snap.status !== "joining")) {
      const wasOnline = !!R;
      R = null; ME = 0; NAMES = BASE_NAMES;
      if (wasOnline && (!S || S.online)) { gen++; S = null; restore(); }
      if (wasOnline && snap && snap.status === "closed") T.toast("The room closed");
      if (root.App && root.App.tab === "hearts") render();
      return;
    }
    if (snap.status === "joining") return;
    R = { snap };
    ME = snap.mySeat;
    NAMES = [0, 1, 2, 3].map((k) => (k === 0 ? "You" : snap.seats[(ME + k) % 4].kind === "human" ? snap.seats[(ME + k) % 4].name : BASE_NAMES[k]));
    if (snap.status === "lobby" || !snap.pub || !snap.mine) {
      if (S) { if (!S.online) persist(); gen++; S = null; }
      return render();
    }
    const g = root.NetGames.merge("hearts", snap.pub, snap.mine);
    if (!S || !S.online) {
      gen++;
      S = blank(g, snap.pub.level);
      S.online = true; S.dealAnim = true;
      if (g.hand && g.hand.phase === "play" && g.hand.received[ME]) S.fresh = new Set();
      updateMoon();
      return render();
    }
    applyRemote(g);
  }

  /** Draw the new online state the same way a local move is drawn (cards fly in, tricks sweep). */
  function applyRemote(g) {
    const old = S.game, oh = old.hand, h = g.hand;
    S.game = g;
    S.level = g.level || S.level;
    if (!oh || !h) return render();
    const newHand = (oh.phase === "done" && h.phase !== "done") || h.trickNo < oh.trickNo || old.handNo !== g.handNo && h.phase !== "done";
    if (newHand) {
      S.sel.clear(); S.fresh.clear(); S.freshTrick.clear(); S.hint = null; S.lastLoss = null; S.handStudy = []; S.moon = null; S.keyProbs = null;
      S.showTrick = null; S.collecting = false; S.busy = false; S.dealAnim = true;
      return render();
    }
    if (oh.phase === "pass" && h.phase === "play") { S.fresh = new Set(h.received[ME] || []); S.sel.clear(); S.hint = null; }
    if (h.trickNo > oh.trickNo || (h.phase === "done" && oh.phase === "play")) {
      // A trick finished: show all four cards, then sweep them to the winner.
      const done = h.lastTrick;
      for (const t of done.cards) if (!oh.trick.some((x) => x.card === t.card)) S.freshTrick.add(t.card);
      const my = gen;
      S.showTrick = done; S.busy = true; render();
      setTimeout(() => {
        if (my !== gen || !S) return;
        S.collecting = true; render();
        setTimeout(() => {
          if (my !== gen || !S) return;
          S.showTrick = null; S.collecting = false; S.freshTrick.clear(); S.busy = false; S.keyProbs = null;
          if (S.game.hand.phase === "done") onHandDone();
          updateMoon();
          render();
        }, 380);
      }, cfg().speed === "fast" ? 550 : 950);
      return;
    }
    for (const t of h.trick) if (!oh.trick.some((x) => x.card === t.card)) S.freshTrick.add(t.card);
    if (!S.busy) render();
  }

  // ------------------------------------------------------------------ mount
  function mount(view) {
    el = view;
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.closest(".hc")) { e.preventDefault(); if (S) tapCard(+e.target.closest(".hc").dataset.card); }
    });
    window.addEventListener("resize", () => T.fitHand(el.querySelector(".hand-wrap")));
    restore();
    if (S) { updateMoon(); }
    if (root.OnlineUI && root.OnlineUI.savedRoom("hearts")) root.OnlineUI.resume("hearts", onSnap);
  }
  function show() { if (S) step(); else render(); }

  root.HeartsUI = { mount, show, render, get state() { return S; }, get room() { return R; }, newGame };
})(typeof self !== "undefined" ? self : globalThis);
