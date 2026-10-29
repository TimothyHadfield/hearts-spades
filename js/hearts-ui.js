/* hearts-ui.js — the Hearts table: you (seat 0) against three computers.
 * Holds the game state, drives the computer seats on timers (with a generation token so
 * nothing from an old game leaks into a new one), and draws the table, tracker, hints,
 * points lost and the moon warning. All game rules come from hearts.js via apply(). */
(function (root) {
  "use strict";
  const { Cards: C, Hearts: H, HeartsAI: AI, Table: T, Art, Store } = root;
  const BASE_NAMES = ["You", "Left", "Across", "Right"];
  // 3 or 5 at the table (offline only; online rooms are always 4)
  const NAMES_BY_N = { 3: ["You", "Left", "Right"], 4: BASE_NAMES, 5: ["You", "Left", "Far left", "Far right", "Right"] };
  let NAMES = BASE_NAMES;   // by position relative to you: you, left, across, right
  let ME = 0;               // your seat (0 on this device; online it's whatever seat you got)
  let R = null;             // online room: { snap } while you're in one
  const HINT_SAMPLES = 120;
  let el = null;
  let S = null;    // runtime state for the game in progress (null = start screen)
  let gen = 0;     // bumps on every new game / quit, cancels old timers

  const cfg = () => Store.data.hearts;
  const delay = () => ({ fast: 260, slow: 1100 }[cfg().speed] || 620);

  function persist() {
    if (S && S.online) return;   // online games live in the room, not in this browser
    Store.data.games.hearts = S ? { game: S.game, level: S.level, handStudy: S.handStudy, fresh: [...S.fresh], recorded: S.recorded, tricks: S.tricks, handStart: S.handStart, undo: S.undo, helped: S.helped, daily: S.daily, done: S.done, tutorial: S.tutorial } : null;
    Store.save();
  }

  function restore() {
    const saved = Store.data.games.hearts;
    if (!saved || !saved.game || !saved.game.hand) return;
    S = blank(saved.game, saved.level);
    S.handStudy = saved.handStudy || [];
    S.fresh = new Set(saved.fresh || []);
    S.recorded = saved.recorded ?? -1;
    S.tricks = saved.tricks || []; S.handStart = saved.handStart || null; S.undo = saved.undo || null;
    S.helped = !!saved.helped; S.daily = saved.daily || null; S.done = !!saved.done; S.tutorial = !!saved.tutorial;
    // Closed mid-sweep of the last trick: the hand ended but was never counted.
    if (S.game.hand.phase === "done") onHandDone();
  }

  function blank(game, level) {
    if (!R) NAMES = NAMES_BY_N[game.scores.length] || BASE_NAMES;
    return {
      game, level, sel: new Set(), fresh: new Set(), freshTrick: new Set(), showTrick: null, collecting: false,
      hint: null, lastLoss: null, handStudy: [], moon: null, dealAnim: false, busy: false, recorded: -1, keyProbs: null, thinking: false, cpuPending: null,
      tricks: [], handStart: null, undo: null, helped: false, daily: null, done: false, tutorial: false,
    };
  }

  // -------------------------------------------------------------- game flow
  function newGame() {
    if (root.COACH) root.COACH.closeOffer();
    quit();
    gen++;
    const c = cfg();
    let g = H.apply(null, { type: "new", opts: { target: c.target, moon: c.moon, jack: c.jack, queenBreaks: c.queenBreaks, bleed: c.bleed, passing: c.passing, players: c.players, points: c.points } });
    S = blank(g, c.level);
    dealNext();
  }

  function dealNext(again) {
    const seed = S.daily ? S.daily.seed : S.tutorial && root.HSCoach ? root.HSCoach.SEED : 0;
    const deck = again ? again.deck : seed ? C.shuffle(C.deck(), C.makeRng((seed + S.game.handNo * 7919) >>> 0)) : C.shuffle(C.deck());
    if (again) { S.game = again.game; S.helped = true; }
    S.handStart = { game: S.game, deck };
    const g = H.apply(S.game, { type: "deal", deck });
    S.game = g;
    S.tricks = []; S.undo = null;
    S.sel.clear(); S.fresh.clear(); S.freshTrick.clear(); S.hint = null; S.lastLoss = null; S.handStudy = []; S.moon = null; S.keyProbs = null;
    S.dealAnim = true;
    // Computers choose their passes straight away; you pick yours.
    if (g.hand.phase === "pass") {
      for (let s = 1; s < g.hand.hands.length; s++) S.game = H.apply(S.game, { type: "pass", seat: s, cards: AI.choosePass(S.game.hand.hands[s], S.level) });
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
    if (seat === ME && !S.online && !S.daily) S.undo = { game: before, study: S.handStudy.length, tricks: S.tricks.length };
    S.game = H.apply(before, { type: "play", seat, card });
    S.freshTrick.add(card);
    S.sel.clear();
    if (seat === ME) { S.fresh.clear(); recordLoss(before.hand, card); S.hint = null; }
    const h = S.game.hand;
    persist();
    if (h.trick.length === 0) {
      S.tricks.push(h.lastTrick);
      if (h.phase === "done") S.undo = null;
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
          S.showTrick = null; S.collecting = false; S.freshTrick.clear(); S.busy = false;
          if (h.phase === "done") onHandDone();
          updateMoon();
          step();
        }, 380);
      }, { fast: 550, slow: 1500 }[cfg().speed] || 950);
    } else step();
  }

  /** A Daily game: today's deals (the same for everyone), standard rules, Medium computers, game to 50. No Undo. */
  function startDaily() {
    const P = root.Profile, D = root.HSProfile && root.HSProfile.DAILY.hearts;
    if (!P || !D) return;
    if (root.COACH) root.COACH.closeOffer();
    quit();
    gen++;
    const day = P.daily.date();
    S = blank(H.apply(null, { type: "new", opts: D.opts }), D.level);
    S.daily = { day, seed: P.daily.seed(day, "hearts") >>> 0 || 1 };
    if (root.App && root.App.tab !== "hearts") root.App.go("hearts");
    dealNext();
  }

  /** The guided first game: standard rules, three Easy computers, the same cards every time. */
  function startTutorial() {
    quit();
    gen++;
    S = blank(H.apply(null, { type: "new", opts: { target: 100, moon: "add", jack: false, queenBreaks: false, bleed: false, passing: "cycle4", players: 4, points: "standard" } }), "easy");
    S.tutorial = true;
    if (root.App && root.App.tab !== "hearts") root.App.go("hearts");
    dealNext();
  }

  /** Leaving a game before the end counts as a loss, so a bad game can't be dropped. */
  function quit() {
    if (!S || S.online || S.done || S.tutorial || !S.game || !S.game.hand) return;
    recordGame();
  }

  /** The game is over (or abandoned): into the player profile, once. */
  function recordGame() {
    if (!S || S.online || S.done || S.tutorial) return;
    S.done = true;
    persist();
    const HP = root.HSProfile;
    if (!HP || !HP.use("hearts", startDaily)) return;
    const g = S.game;
    root.Profile.recordResult(HP.result({
      game: "hearts", over: !!g.over, winners: g.winners || [], me: ME, scores: g.scores, level: S.level, helped: S.helped, daily: !!S.daily,
      players: g.scores.length, points: g.opts.points, moons: g.history.filter((x) => x.moonBy === ME).length,
    }));
  }

  /** Take back your last card (and everything the computers played after it). The game becomes unrated. */
  function undo() {
    if (!S || !S.undo || S.online || S.daily) return;
    const u = S.undo;
    gen++;
    S.game = u.game; S.handStudy.length = Math.min(S.handStudy.length, u.study); S.tricks.length = u.tricks;
    S.undo = null; S.helped = true;
    S.sel.clear(); S.hint = null; S.lastLoss = null; S.showTrick = null; S.collecting = false; S.busy = false; S.cpuPending = null; S.thinking = false; S.moon = null;
    persist();
    updateMoon();
    step();
  }

  function onHandDone() {
    const g = S.game;
    if (g.over) recordGame();     // also after a replayed last hand (that hand's numbers were already counted)
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
    if (!S.online) { S.helped = true; persist(); }
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
    const N = h.hands.length;
    const passing = h.phase === "pass";
    const passName = H.passName(h.passOffset, N);
    const trickShown = S.showTrick ? S.showTrick.cards : h.trick;
    const win = S.showTrick ? S.showTrick.winner : -1;
    const myTurn = h.phase === "play" && h.turn === ME && !S.busy;

    let seats = "";
    const piles = T.wonPiles(h, H.trickWinner, (c) => H.points(c, h.scheme) > 0 || (g.opts.jack && c === 22), !!S.showTrick);
    for (let s = 0; s < N; s++) {
      const pos = T.posOf(T.rel(s, ME, N), N);
      seats += T.seatHTML({
        pos, seat: s, name: NAMES[T.rel(s, ME, N)], score: g.scores[s], sub: seatSub(h, s), cpu: !!R && isCpu(s),
        turn: h.phase === "play" && h.turn === s && !S.busy, count: s !== ME ? h.hands[s].length - (passing && h.passes[s] ? 3 : 0) : null,
        won: piles.n[s], pts: piles.pts[s], deal: S.dealAnim, passed: passing && !!h.passes[s],
      });
    }

    // On a phone the score pad sits below the table, so every seat, pile and score stays in view.
    const padOut = h.phase === "done" && !S.showTrick && !sideVisible();
    const passDone = !!S.flipNew;
    let center = "";
    if (h.phase === "done" && !S.showTrick) center = padOut ? "" : summaryHTML();
    else if (passing && !h.passes[ME]) center = `<div class="felt-msg">Pass 3 cards <b>${passName}</b></div>`;
    else if (h.trickNo === 0 && !trickShown.length && h.received[ME] && S.fresh.size) center = `<div class="felt-msg">Blue outline = cards you got</div>`;

    const moon = S.moon && h.phase === "play" ? `<div class="moon">Moon risk · ${NAMES[T.rel(S.moon.seat, ME, N)]} ${Math.round(S.moon.chance * 100)}%${T.help("moon")}</div>` : "";

    const metaTxt = h.phase === "pass" ? `Hand ${g.handNo + 1} · pass ${passName}` :
      h.phase === "play" ? `Hand ${g.handNo + 1} · trick ${Math.min(h.tricksTotal || 13, h.trickNo + 1)} of ${h.tricksTotal || 13}` : `Hand ${g.handNo} done`;

    const td = T.trackerData(h, ME);
    el.innerHTML =
      `<div class="game"><div class="game-main">` +
      `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">${S.daily ? "Daily · " : S.tutorial ? "Guided game · " : ""}${metaTxt} · ${S.level}</span></div>` +
      `<button class="btn sm hint-btn${S.hint ? " on" : ""}${S.thinking ? " thinking" : ""}" data-act="hint" ${(myTurn || (passing && !h.passes[ME])) && !S.thinking ? "" : "disabled"}>Hint</button>` +
      `<button class="icon-btn" data-act="menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>` +
      `<div class="table tbl-surface tbl-felt-green${padOut ? " end" : ""}${N !== 4 ? " n" + N : ""}"><div class="felt">${seats}${T.trickHTML(trickShown, ME, S.freshTrick, win, S.collecting ? win : null, N)}${S.dealAnim ? T.deckHTML() : ""}${center}${moon}</div>` +
      (padOut ? `<div class="pad-slot">${summaryHTML()}</div>` :
        (cfg().tracker ? T.stripHTML(td, NAMES, ME, N) : "") +
        `<div class="prompt" id="h-prompt">${promptHTML()}</div>` +
        `<div class="hand-wrap">${handHTMLFor(h, myTurn, passing)}</div>`) +
      `</div></div><aside class="game-side">${sideHTML(td)}</aside></div>`;
    T.fitHand(el.querySelector(".hand-wrap"));
    if (S.dealAnim) T.runDeck(el);
    if (passDone && h.phase === "play") T.passFly(el, h.passOffset, ME, N);
    if (root.GameFX) root.GameFX.observe("hearts", { g: S.game, me: ME, dealAnim: S.dealAnim, show: S.showTrick, collecting: S.collecting, busy: S.busy }, el);
    S.dealAnim = false; S.flipNew = false; S.freshTrick.clear(); // a played card lands once, not again on every redraw
  }

  function handHTMLFor(h, myTurn, passing) {
    // Cards you've passed (online, while the others choose) are already out of your hand, face down on the table.
    const gone = passing && Array.isArray(h.passes[ME]) ? new Set(h.passes[ME]) : null;
    const cards = gone ? h.hands[ME].filter((c) => !gone.has(c)) : h.hands[ME];
    // The cards you get turn face up once the passed cards have slid across to you. A redraw while
    // that runs (a computer leading quickly) keeps the flip going from where it was, not restarting it.
    const now = performance.now();
    if (S.flipNew) { const sp = root.GameFX ? root.GameFX.speed() : 1; S.flipAt = now + 700 * sp; S.flipEnd = S.flipAt + (500 + 13 * 35) * sp + 100; }
    const flipping = S.flipEnd && now < S.flipEnd;
    const opts = { sel: S.sel, fresh: S.fresh, deal: S.dealAnim, flip: flipping ? S.fresh : null, flipDelay: flipping ? Math.round(S.flipAt - now) : 0 };
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
        msg = `<b>Pick 3 to pass ${H.passName(h.passOffset, h.hands.length)}</b><span class="small">${S.sel.size}/3 chosen${S.hint && S.hint.pass ? " · green = suggested" + "" : ""}</span>`;
        btn = `<button class="btn warm" data-act="pass" ${S.sel.size === 3 ? "" : "disabled"}>Pass</button>`;
      }
    } else if (h.phase === "play") {
      if (h.turn === ME && !S.busy) {
        const lead = h.trick.length === 0;
        msg = `<b>${lead ? (h.trickNo === 0 ? "Lead the " + C.name(h.leadCard >= 0 ? h.leadCard : 0) : "Your lead") : "Your turn"}</b>`;
        if (S.sel.size) msg += `<span class="small">Tap again to play</span>`;
        else msg += lossLine();
      } else {
        msg = `<span>${S.busy ? (S.showTrick ? NAMES[T.rel(S.showTrick.winner, ME, h.hands.length)] + " take" + (S.showTrick.winner === ME ? "" : "s") + " it" + (S.showTrick.points ? ` · ${S.showTrick.points} pt${S.showTrick.points > 1 ? "s" : ""}` : "") : "") : NAMES[T.rel(h.turn, ME, h.hands.length)] + " is playing…"}</span>` + lossLine();
      }
      if (S.hint && S.hint.list && h.turn === ME) btn = T.help("ev");
      if (S.undo && !S.online && !S.daily) btn = `<button class="btn sm" data-act="undo">Undo</button>` + btn;
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
    const N = g.scores.length;
    const order = g.scores.map((_, k) => (ME + k) % N);
    const low = Math.min(...g.scores);
    for (const s of order) {
      rows += `<tr class="${s === ME ? "me" : ""}"><td>${NAMES[T.rel(s, ME, N)]}</td><td>${h.taken[s]}</td><td>${r.pts[s] > 0 ? "+" : ""}${r.pts[s]}</td><td class="${g.scores[s] === low ? "good" : ""}">${g.scores[s]}</td></tr>`;
    }
    let title = g.over ? (g.winners.includes(ME) ? (g.winners.length > 1 ? "You tie for the win" : "You win!") : NAMES[T.rel(g.winners[0], ME, N)] + " wins") : "Hand " + g.handNo;
    let note = r.moonBy >= 0 ? `<div class="warm" style="margin-bottom:6px;font-weight:700">${NAMES[T.rel(r.moonBy, ME, N)]} shot the moon!</div>` : "";
    return `<div class="panel-c pad"><h3>${T.esc(title)}</h3>${note}<table class="mini"><tr><th></th><th>Took</th><th>Scored</th><th>Total</th></tr>${rows}</table>` +
      (cfg().study && S.handStudy.length ? `<div class="muted" style="margin-top:8px">Your points lost this hand: <b style="color:${lost < 1 ? "var(--good)" : lost < 4 ? "var(--accent-warm)" : "var(--bad)"}">${lost.toFixed(1)}</b> ${T.help("lost")}</div>` : "") +
      `<div class="row" style="margin-top:12px"><button class="btn" data-act="reveal">All hands</button>` +
      (S.handStart && !S.online && !S.daily ? `<button class="btn" data-act="replay" title="Play this hand again with the same cards">Replay</button>` : "") + `<span style="flex:1"></span>` +
      (g.over ? `<button class="btn primary" data-act="new">New game</button>` : `<button class="btn primary" data-act="next">Next hand</button>`) + `</div></div>`;
  }

  function sideHTML(td) {
    const g = S.game, h = g.hand;
    const N = g.scores.length;
    let hist = `<table class="mini"><tr><th>#</th>${g.scores.map((_, s) => `<th>${T.esc(shortName(NAMES[T.rel(s, ME, N)]))}</th>`).join("")}</tr>`;
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
    return `<div class="side-sec"><div class="pad side-pad"><h4>Scores · game to ${g.opts.target}</h4>${hist}</div></div>` +
      (cfg().tracker ? `<div class="side-sec"><h4>Cards left ${T.help("tracker")}</h4>${T.trackerDetailHTML(td, NAMES, ME, keyProbs(), N)}</div>` : "") +
      (cfg().study ? `<div class="side-sec fill"><h4>Points lost ${T.help("lost")}</h4>${study}</div>` : "");
  }

  // "Far left" -> "F.left" would be cut; two-word seat names become "FL"/"FR" in the narrow score table
  const shortName = (nm) => (/^Far (left|right)$/.test(nm) ? "F" + nm[4].toUpperCase() : nm.slice(0, 6));
  const sideVisible = () => root.matchMedia && root.matchMedia("(min-width: 900px)").matches;

  /** Where are the queen, king and ace of spades likely to be? Sampled from what you know.
   *  The side panel gets it from the background worker (old numbers stay up until the new ones land);
   *  the phone's tracker sheet works it out on tap. */
  function keyProbs(force) {
    const h = S.game.hand;
    if (!h || h.phase !== "play") return null;
    if (!force && !sideVisible()) return null;
    const k = key(h);
    if (S.keyProbs && S.keyProbs.k === k) return S.keyProbs.v;
    if (force) {
      const v = root.ThinkFns.heartsKeyProbs(h, ME, 300);
      S.keyProbs = { k, v };
      return v;
    }
    if (S.keyJob !== k) {
      S.keyJob = k;
      const my = gen;
      root.Think.run("heartsKeyProbs", h, ME, 300).then((v) => {
        if (my !== gen || !S || !S.game.hand || key(S.game.hand) !== k) return;
        S.keyProbs = { k, v };
        if (!S.busy) render();
      }, () => {});
    }
    // Meanwhile show the last numbers for cards that are still unseen.
    return S.keyProbs ? S.keyProbs.v.filter((x) => !h.played[x.card] && !h.hands[ME].includes(x.card)) : null;
  }

  function renderStart() {
    if (root.GameFX) root.GameFX.observe("hearts", null, el);
    if (R && R.snap && R.snap.status === "lobby") {
      el.innerHTML = `<div class="game"><div class="game-main">` +
        `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">Online room · ${T.esc(R.snap.options && R.snap.options.level || "medium")} computers</span></div></div>` +
        `<div class="table tbl-surface tbl-felt-green"><div class="felt">${root.OnlineUI.lobbyHTML(R.snap, (i) => i === ME ? "You" : BASE_NAMES[T.rel(i, ME)])}</div></div></div></div>`;
      return;
    }
    const c = cfg();
    const lv = ["easy", "medium", "hard"];
    const np = [3, 4, 5].includes(c.players) ? c.players : 4;
    const tot = H.totalPoints(c.points);
    const across = np === 4 ? "/across" : "";
    const rules = [`Game to ${c.target}`, c.passing === "none" ? "no passing" : c.passing === "left" ? "pass left only" : c.passing === "cycle3" && np === 4 ? "pass L/R/across" : `pass L/R${across}/keep`,
      c.moon === "subtract" ? `moon −${tot}` : c.moon === "choice" ? "moon: shooter's choice" : `moon +${tot} to others`];
    if (c.points === "maria") rules.unshift("Black Maria");
    if (c.points === "spot") rules.unshift("Spot Hearts");
    if (np === 3) rules.push("2♦ out");
    if (np === 5) rules.push("2♣ 2♦ out, 3♣ leads");
    if (c.jack) rules.push("J♦ −10");
    if (c.queenBreaks) rules.push("Q♠ breaks hearts");
    if (c.bleed) rules.push("points on trick 1");
    el.innerHTML = `<div class="game"><div class="game-main">` +
      `<div class="bar"><div class="grow"><span class="title">Hearts</span><span class="meta">You vs ${np - 1} computers · lowest score wins</span></div></div>` +
      `<div class="table tbl-surface tbl-felt-green"><div class="felt">${T.restDeckHTML()}<div class="panel-c start">` +
      `<h3>New game</h3>` +
      `<div class="seg players" data-act="players" aria-label="Players">${[3, 4, 5].map((n) => `<button data-players="${n}" aria-pressed="${np === n}">${n} players</button>`).join("")}</div>` +
      `<div class="seats">${NAMES_BY_N[np].slice(1).map((nm) => `<div>${nm}<b>Computer</b></div>`).join("")}</div>` +
      `<div style="display:flex;align-items:center;font-size:13px;color:var(--muted)">Computer level ${T.help("level", "hearts")}</div>` +
      `<div class="seg levels" data-act="level">${lv.map((l) => `<button data-level="${l}" aria-pressed="${c.level === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("")}</div>` +
      `<div class="muted" style="margin-bottom:12px">${rules.join(" · ")} · <a href="#settings" data-act="go-settings">change</a></div>` +
      `<button class="btn primary wide" data-act="deal">Deal</button>` +
      `<div class="start-row"><button class="btn" data-act="online">Play online</button>${root.Profile ? `<button class="btn pf-open" data-act="stats">${root.Profile.avatarSVG(root.Profile.avatar, 22)}My stats</button>` : ""}</div>` +
      `</div></div></div></div></div>`;
    offerTutorial();
  }

  function offerTutorial() {
    const CO = root.COACH, HC = root.HSCoach;
    if (!CO || !HC || S || R || CO.offered(HC.ID) || !root.App || root.App.tab !== "hearts") return;
    setTimeout(() => {
      if (S || R || !root.App || root.App.tab !== "hearts") return;
      CO.offer({ id: HC.ID, title: "New to Hearts?", text: "Play one guided hand against Easy computers.", yes: "Teach me", no: "No thanks", onYes: () => root.App.startTutorial(), place: "auto", avoid: ['[data-act="deal"]'] });
    }, 400);
  }

  function openStats() {
    if (root.HSProfile && root.HSProfile.use("hearts", startDaily)) { root.Profile.openPanel(); if (root.App) root.App.modalOpened("profile"); }
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
      if (act === "stats") return openStats();
      if (act === "level") {
        const b = e.target.closest("[data-level]");
        if (b) { cfg().level = b.dataset.level; Store.save(); render(); }
        return;
      }
      if (act === "players") {
        const b = e.target.closest("[data-players]");
        if (b) { cfg().players = +b.dataset.players; Store.save(); render(); }
        return;
      }
      if (act === "go-settings") { e.preventDefault(); return root.App.go("settings"); }
      if (act === "hint") return hint();
      if (act === "menu") return menu();
      if (act === "pass") return submitPass();
      if (act === "next") return S.online ? send({ type: "next" }) : dealNext();
      if (act === "new") { if (S.online) return root.OnlineUI.leave("hearts"); S = null; persist(); return render(); }   // only shown once the game is over
      if (act === "reveal") return reveal();
      if (act === "undo") return undo();
      if (act === "replay") { if (S.handStart && !S.online && !S.daily) { gen++; dealNext(S.handStart); } return; }
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
    if (!H.legal(h, ME).includes(card)) { if (root.GameFX) root.GameFX.illegal(el.querySelector(`.hc[data-card="${card}"]`)); T.toast(h.trick.length ? "Follow suit if you can" : (h.trickNo === 0 ? "The 2♣ leads first" : "Hearts aren't broken yet")); return; }
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
    S.flipNew = true;
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
      (S.daily ? `<p class="muted">Today's Daily game: the same deals for everyone, no Undo.</p>` : S.tutorial ? "" : !S.done ? `<p class="muted">Leaving before the end counts as a loss in My stats.</p>` : "") +
      `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-m="new">New game</button><button class="btn" data-m="rules">Rules</button><button class="btn" data-m="strength">How strong?</button>${root.Profile ? `<button class="btn" data-m="stats">My stats</button>` : ""}</div>`,
      (sh) => sh.addEventListener("click", (e) => {
        const b = e.target.closest("[data-m]");
        if (!b) return;
        if (b.dataset.m === "new") { T.closeSheet(); quit(); gen++; S = null; persist(); render(); }
        if (b.dataset.m === "rules") { T.closeSheet(); setTimeout(() => root.Lab.rulesSheet("hearts"), 30); }
        if (b.dataset.m === "strength") { T.closeSheet(); setTimeout(() => root.Lab.strengthSheet("hearts"), 30); }
        if (b.dataset.m === "stats") { T.closeSheet(); setTimeout(openStats, 30); }
      }));
  }

  function trackerSheet() {
    const h = S.game.hand;
    T.openSheet(`<h3>Cards left ${T.help("tracker")}</h3>` + T.trackerDetailHTML(T.trackerData(h, ME), NAMES, ME, keyProbs(true), h.hands.length));
  }

  function reveal() {
    const h = S.game.hand;
    let out = `<h3>Everyone's starting hand</h3>`;
    for (let s = 0; s < h.hands.length; s++) {
      out += `<div style="margin:8px 0 4px;font-size:13px;color:var(--muted)">${NAMES[T.rel(s, ME, h.hands.length)]} · took ${h.taken[s]}</div><div style="display:flex;flex-wrap:wrap;gap:2px">` +
        h.start[s].map((c) => `<div style="width:30px">${Art.cardHTML(c)}</div>`).join("") + `</div>`;
      if (h.passes[s]) out += `<div style="font-size:12px;color:var(--muted);margin-top:2px">Passed ${h.passes[s].map(C.name).join(" ")}</div>`;
    }
    out += trickReviewHTML(h);
    T.openSheet(out);
  }

  /** Every trick of the hand in order: who led, each card, who took it and for how many points. */
  function trickReviewHTML(h) {
    const list = S.tricks || [];
    if (!list.length) return "";
    const n = h.hands.length;
    let out = `<h3 style="margin-top:14px">Trick by trick</h3><div class="trick-review">`;
    list.forEach((t, i) => {
      out += `<div class="tr-row"><span class="tr-n">${i + 1}</span><span class="tr-cards">` +
        t.cards.map((x) => `<span class="tr-c${x.seat === t.winner ? " win" : ""}" title="${T.esc(NAMES[T.rel(x.seat, ME, n)])}"><i>${T.esc(shortName(NAMES[T.rel(x.seat, ME, n)]))}</i>${Art.cardHTML(x.card)}</span>`).join("") +
        `</span><span class="tr-w">${T.esc(NAMES[T.rel(t.winner, ME, n)])}${t.points ? ` · <b>${t.points}</b>` : ""}</span></div>`;
    });
    return out + `</div>`;
  }

  // ----------------------------------------------------------------- online
  function openOnline() {
    if (root.COACH) root.COACH.closeOffer();
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
    if (oh.phase === "pass" && h.phase === "play") { S.fresh = new Set(h.received[ME] || []); S.flipNew = true; S.sel.clear(); S.hint = null; }
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
          S.showTrick = null; S.collecting = false; S.freshTrick.clear(); S.busy = false;
          if (S.game.hand.phase === "done") onHandDone();
          updateMoon();
          render();
        }, 380);
      }, { fast: 550, slow: 1500 }[cfg().speed] || 950);
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
    // Turning a tablet or resizing past the laptop width moves the score pad between table and side.
    const mq = root.matchMedia && root.matchMedia("(min-width: 900px)");
    const onMq = () => { if (S && S.game.hand && S.game.hand.phase === "done" && !S.busy) render(); };
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq); }
    restore();
    if (S) { updateMoon(); }
    if (root.OnlineUI && root.OnlineUI.savedRoom("hearts")) root.OnlineUI.resume("hearts", onSnap);
  }
  function show() { if (S) step(); else render(); }

  root.HeartsUI = { mount, show, render, get state() { return S; }, get room() { return R; }, newGame, startDaily, startTutorial, openStats };
})(typeof self !== "undefined" ? self : globalThis);
