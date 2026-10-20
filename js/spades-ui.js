/* spades-ui.js — the Spades table: you (seat 0) and a computer partner (seat 2) against two
 * computers. Bidding with the bid advisor, blind nil (when switched on), the card swap,
 * play with hints, points lost, a live "make the bid" chance and the cards-left tracker. */
(function (root) {
  "use strict";
  const { Cards: C, Spades: S_, SpadesAI: AI, Table: T, Art, Store } = root;
  const NAMES = ["You", "Left", "Partner", "Right"];
  const ME = 0;
  let el = null, S = null, gen = 0;

  const cfg = () => Store.data.spades;
  const delay = () => (Store.data.hearts.speed === "fast" ? 260 : 620);
  const bidTxt = (h, s) => (h.bids[s] === null ? "…" : h.bids[s] === 0 ? (h.blind[s] ? "Blind nil" : "Nil") : "Bid " + h.bids[s]);

  function persist() {
    Store.data.games.spades = S ? { game: S.game, level: S.level, handStudy: S.handStudy, looked: S.looked, recorded: S.recorded, bidLoss: S.bidLoss } : null;
    Store.save();
  }
  function blank(game, level) {
    return { game, level, sel: new Set(), freshTrick: new Set(), showTrick: null, collecting: false, hint: null, lastLoss: null,
      handStudy: [], dealAnim: false, busy: false, recorded: -1, advice: null, adviceP: null, bidPick: null, looked: true, make: null, bidLoss: null, thinking: false, cpuPending: null };
  }
  function restore() {
    const sv = Store.data.games.spades;
    if (!sv || !sv.game || !sv.game.hand) return;
    S = blank(sv.game, sv.level);
    S.handStudy = sv.handStudy || []; S.looked = sv.looked !== false; S.recorded = sv.recorded ?? -1; S.bidLoss = sv.bidLoss || null;
  }

  function optsFromCfg() {
    const c = cfg();
    return { target: c.target, nil: c.nil, blindNil: c.blindNil, blindNilBehind: c.blindNilBehind, bagLimit: c.bagLimit, bagPenalty: c.bagPenalty,
      nilCounts: c.nilCounts, spadesLead: c.spadesLead, loseAt: c.loseAt, firstLead: c.firstLead };
  }

  function newGame() {
    gen++;
    S = blank(S_.apply(null, { type: "new", opts: optsFromCfg() }), cfg().level);
    dealNext();
  }
  function dealNext() {
    S.game = S_.apply(S.game, { type: "deal", deck: C.shuffle(C.deck()) });
    Object.assign(S, { sel: new Set(), freshTrick: new Set(), hint: null, lastLoss: null, handStudy: [], advice: null, adviceP: null, bidPick: null, make: null, bidLoss: null, thinking: false, cpuPending: null });
    S.looked = !S_.blindNilAllowed(S.game, ME);
    S.dealAnim = S.looked;
    persist();
    step();
  }

  function actor() {
    const a = S_.toAct(S.game);
    return a ? { seat: a.seats[0], kind: a.kind } : null;
  }

  function step() {
    if (!S || S.busy) return render();
    render();
    const a = actor();
    if (!a || a.seat === ME) return;
    const my = gen, g = S.game;
    if (S.cpuPending === g) return;
    S.cpuPending = g;
    // Think in the background while the pause runs, so a slow Hard move never freezes the page.
    const job = a.kind === "bid" ? root.Think.run("spadesBid", g, a.seat, S.level)
      : a.kind === "exchange" ? Promise.resolve(AI.chooseExchange(g.hand.hands[a.seat], a.seat === g.hand.exchange.nilSeat))
      : root.Think.run("spadesMove", g, a.seat, S.level);
    const wait = new Promise((r) => setTimeout(r, delay()));
    Promise.all([job, wait]).then(([choice]) => {
      if (my !== gen || !S || S.game !== g) return;
      S.cpuPending = null;
      if (S.busy) return;
      if (a.kind === "bid") { S.game = S_.apply(g, { type: "bid", seat: a.seat, bid: choice, blind: false }); persist(); step(); }
      else if (a.kind === "exchange") { S.game = S_.apply(g, { type: "exchange", seat: a.seat, cards: choice }); persist(); step(); }
      else doPlay(a.seat, choice);
    }, (err) => { if (S) S.cpuPending = null; T.toast("Computer error: " + err.message); });
  }

  function doPlay(seat, card) {
    const before = S.game;
    S.game = S_.apply(before, { type: "play", seat, card });
    S.freshTrick.add(card);
    S.sel.clear();
    if (seat === ME) { recordLoss(before, card); S.hint = null; }
    const h = S.game.hand;
    persist();
    if (h.trick.length === 0) {
      const my = gen;
      S.showTrick = h.lastTrick; S.busy = true; render();
      setTimeout(() => {
        if (my !== gen) return;
        S.collecting = true; render();
        setTimeout(() => {
          if (my !== gen) return;
          S.showTrick = null; S.collecting = false; S.freshTrick.clear(); S.busy = false;
          if (h.phase === "done") onHandDone(); else updateMake();
          step();
        }, 380);
      }, Store.data.hearts.speed === "fast" ? 550 : 950);
    } else step();
  }

  function onHandDone() {
    const g = S.game;
    if (S.recorded === g.handNo) return;
    S.recorded = g.handNo;
    const rec = Store.data.record.spades;
    const lost = S.handStudy.reduce((a, x) => a + x.lost, 0) + (S.bidLoss ? S.bidLoss.lost : 0);
    rec.hands++; rec.pts += g.hand.result[0].points; rec.lost += lost;
    Store.data.study.spades.push({ t: Date.now(), pts: g.hand.result[0].points, them: g.hand.result[1].points, lost: +lost.toFixed(1), level: S.level });
    if (Store.data.study.spades.length > 400) Store.data.study.spades.shift();
    if (g.over) { rec.played++; if (g.winner === 0) rec.won++; }
    persist();
  }

  const key = (h) => h.trickNo * 10 + h.trick.length + ":" + h.hands[ME].length;

  function recordLoss(gBefore, card) {
    if (!cfg().study) return;
    const h = gBefore.hand;
    const moves = S_.legal(h, ME);
    if (moves.length < 2) { S.handStudy.push({ trick: h.trickNo + 1, card, best: card, lost: 0 }); return; }
    const pre = S.hint && S.hint.forTrick === key(h) ? S.hint.list : null;
    const my = gen;
    const run = (list) => {
      if (my !== gen || !S) return;
      const best = list[0], mine = list.find((x) => x.card === card);
      const rec = { trick: h.trickNo + 1, card, best: best.card, lost: +Math.max(0, best.ev - mine.ev).toFixed(1) };
      S.handStudy.push(rec); S.lastLoss = rec; persist();
      if (!S.busy) render();
    };
    if (pre) run(pre); else root.Think.run("spadesEvaluate", gBefore, ME, 50).then(run, () => {});
  }

  /** Chance our team makes its bid (and that each live nil survives), played out from here. */
  function updateMake() {
    if (!S) return;
    const h = S.game.hand;
    if (!h || h.phase !== "play") { S.make = null; return; }
    const my = gen, tn = h.trickNo;
    root.Think.run("spadesMake", h, ME, 120).then((m) => {
      if (my !== gen || !S || !S.game.hand || S.game.hand.trickNo !== tn) return;
      S.make = m;
      if (!S.busy) render();
    }, () => {});
  }

  /** Starts the bid advisor in the background (once per hand); resolves when it's ready. */
  function computeAdvice() {
    if (S.advice) return Promise.resolve(S.advice);
    if (S.adviceP) return S.adviceP;
    const my = gen, hn = S.game.handNo;
    S.adviceP = root.Think.run("spadesAdvise", S.game, ME, 360).then((A) => {
      if (my !== gen || !S || S.game.handNo !== hn) return null;
      S.advice = A;
      if (S.bidPick === null && cfg().advisor) S.bidPick = A.best.bid;
      render();
      return A;
    }, () => null);
    return S.adviceP;
  }

  function hint() {
    const g = S.game, h = g.hand;
    if (h.phase === "bid" && h.bidTurn === ME) { computeAdvice().then((A) => { if (A && S) { S.bidPick = A.best.bid; render(); } }); return; }
    if (h.phase === "exchange") { S.sel = new Set(AI.chooseExchange(h.hands[ME], h.exchange.nilSeat === ME)); return render(); }
    if (h.phase !== "play" || h.turn !== ME || S.busy || S.thinking) return;
    if (S.hint && S.hint.forTrick === key(h)) { S.hint = null; return render(); }
    const my = gen, k = key(h);
    S.thinking = true; render();
    root.Think.run("spadesEvaluate", g, ME, 70).then((list) => {
      if (my !== gen || !S) return;
      S.thinking = false;
      if (S.game.hand && key(S.game.hand) === k && S.game.hand.turn === ME) S.hint = { forTrick: k, list };
      render();
    }, () => { if (S) { S.thinking = false; render(); } });
  }

  // ----------------------------------------------------------------- render
  function render() {
    if (!el) return;
    if (!S) return renderStart();
    const g = S.game, h = g.hand;
    const a = actor();
    const myAct = a && a.seat === ME && !S.busy ? a.kind : null;
    if (myAct === "bid" && S.looked && (cfg().advisor || cfg().study)) computeAdvice();
    const trickShown = S.showTrick ? S.showTrick.cards : h.trick;
    const win = S.showTrick ? S.showTrick.winner : -1;

    let seats = "";
    for (let s = 0; s < 4; s++) {
      const pos = T.POS[T.rel(s, ME)];
      const sub = h.phase === "bid" && h.bids[s] === null ? (h.bidTurn === s ? "bidding…" : "") : `${bidTxt(h, s)} · won ${h.tricks[s]}`;
      seats += T.seatHTML({ pos, seat: s, name: NAMES[T.rel(s, ME)], score: s % 2 === 0 ? (s === ME ? "" : "") : "", sub, cpu: s !== ME, initial: "Y",
        them: s % 2 === 1, turn: a && a.seats ? false : a && a.seat === s && !S.busy, count: s !== ME ? h.hands[s].length : null });
    }
    seats = seats.replace(/<span class="seat-score"><\/span>/g, "");

    let center = "";
    if (h.phase === "done" && !S.showTrick) center = summaryHTML();
    else if (myAct === "bid") center = S.looked ? bidPanelHTML() : blindPanelHTML();
    else if (myAct === "exchange") center = `<div class="felt-msg">Blind nil: pick 2 cards to give Partner. Partner gives 2 back.</div>`;
    else if (h.phase === "bid") center = `<div class="felt-msg">Bidding…</div>`;

    const makeChip = S.make && S.make.bid !== null && h.phase === "play" ? makeChipHTML() : "";

    const bar = `<div class="bar"><div class="grow"><span class="title">Us ${g.scores[0]} <span style="color:var(--muted);font-weight:500;font-size:12px">${g.bags[0]} bag${g.bags[0] === 1 ? "" : "s"}</span> · <span class="warm">Them ${g.scores[1]}</span> <span style="color:var(--muted);font-weight:500;font-size:12px">${g.bags[1]}</span></span>` +
      `<span class="meta">Hand ${g.handNo + (h.phase === "done" ? 0 : 1)} · to ${g.opts.target} · ${S.level}${h.phase === "play" ? ` · bids ${teamBid(h, 0)}–${teamBid(h, 1)}` : ""}</span></div>` +
      `<button class="btn sm hint-btn${S.hint ? " on" : ""}${S.thinking ? " thinking" : ""}" data-act="hint" ${myAct && S.looked && !S.thinking ? "" : "disabled"}>Hint</button>` +
      `<button class="icon-btn" data-act="menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>`;

    const td = T.trackerData(h, ME);
    el.innerHTML = `<div class="game"><div class="game-main">${bar}` +
      `<div class="felt">${seats}${T.trickHTML(trickShown, ME, S.freshTrick, win, S.collecting ? win : null)}${center}${makeChip}</div>` +
      (cfg().tracker && h.phase === "play" ? T.stripHTML(td, NAMES, ME) : "") +
      `<div class="prompt" id="s-prompt">${promptHTML(myAct)}</div>` +
      `<div class="hand-wrap">${handFor(h, myAct)}</div>` +
      `</div><aside class="game-side">${sideHTML(td)}</aside></div>`;
    S.dealAnim = false;
    T.fitHand(el.querySelector(".hand-wrap"));
  }

  const teamBid = (h, t) => (h.bids[t] || 0) + (h.bids[t + 2] || 0);

  function makeChipHTML() {
    const p = S.make.bid;
    const color = T.scaleColor(1 - p, 0, 1);
    let nil = "";
    for (let s = 0; s < 4; s++) if (S.game.hand.bids[s] === 0 && S.game.hand.tricks[s] === 0) nil += ` · ${NAMES[s]} nil ${Math.round(S.make.nil[s] * 100)}%`;
    return `<div class="moon" style="background:rgba(10,14,22,.85);border-color:var(--line);color:var(--text)">Make our bid <b style="color:${color}">${Math.round(p * 100)}%</b>${nil}${T.help("makeBid")}</div>`;
  }

  function handFor(h, myAct) {
    const opts = { sel: S.sel, deal: S.dealAnim, hidden: !S.looked };
    if (myAct === "exchange") opts.legal = new Set(h.hands[ME]);
    if (myAct === "play") {
      opts.legal = new Set(S_.legal(h, ME));
      if (S.hint && S.hint.forTrick === key(h)) {
        const list = S.hint.list, best = list[0].ev, worst = list[list.length - 1].ev;
        opts.evs = new Map(list.map((x) => [x.card, { txt: (x.ev >= 0 ? "+" : "") + x.ev.toFixed(0), color: T.scaleColor(-x.ev, -best, -worst) }]));
        opts.best = new Set([list[0].card]);
      }
    }
    return T.handHTML(h.hands[ME], opts);
  }

  function promptHTML(myAct) {
    const g = S.game, h = g.hand;
    let msg = "", btn = "";
    if (myAct === "bid") {
      if (!S.looked) msg = `<b>Blind nil?</b><span class="small">Decide before you look ${T.help("blindNil")}</span>`;
      else {
        msg = `<b>Your bid</b><span class="small">${[1, 2, 3].map((k) => (ME + k) % 4).filter((s) => h.bids[s] !== null).map((s) => NAMES[s] + " " + bidTxt(h, s).replace("Bid ", "")).join(" · ") || "You bid first"}</span>`;
        const p = S.bidPick;
        btn = `<button class="btn warm" data-act="bid" ${p === null ? "disabled" : ""}>${p === null ? "Bid" : p === 0 ? "Bid nil" : "Bid " + p}</button>`;
      }
    } else if (myAct === "exchange") {
      msg = `<b>Give partner 2 cards</b><span class="small">${S.sel.size}/2 chosen</span>`;
      btn = `<button class="btn warm" data-act="give" ${S.sel.size === 2 ? "" : "disabled"}>Give</button>`;
    } else if (myAct === "play") {
      msg = `<b>${h.trick.length ? "Your turn" : "Your lead"}</b>` + (S.sel.size ? `<span class="small">Tap again to play</span>` : lossLine());
      if (S.hint && S.hint.list) btn = T.help("ev");
    } else if (h.phase === "done") {
      msg = `<b>${g.over ? "Game over" : "Hand over"}</b>` + lossLine();
    } else {
      const a = actor();
      msg = (S.busy && S.showTrick ? `${NAMES[S.showTrick.winner]} take${S.showTrick.winner === ME ? "" : "s"} it` : a ? `${NAMES[a.seat]} is ${a.kind === "bid" ? "bidding" : a.kind === "exchange" ? "passing cards" : "playing"}…` : "") + lossLine();
    }
    return `<div class="msg">${msg}</div>${btn}`;
  }

  function lossLine() {
    if (!cfg().study) return "";
    const L = S.lastLoss;
    if (!L) return S.bidLoss ? `<span class="small">Bid: ${S.bidLoss.mine === 0 ? "nil" : S.bidLoss.mine} · lost ${S.bidLoss.lost.toFixed(0)} pts${S.bidLoss.best !== S.bidLoss.mine ? " (best " + (S.bidLoss.best === 0 ? "nil" : S.bidLoss.best) + ")" : ""}</span>` : "";
    const color = L.lost < 2 ? "var(--good)" : L.lost < 8 ? "var(--accent-warm)" : "var(--bad)";
    return `<span class="small">Last: ${C.name(L.card)} · <span style="color:${color};font-weight:700">lost ${L.lost.toFixed(0)} pts</span>${L.best !== L.card ? " (best " + C.name(L.best) + ")" : ""} ${T.help("lost")}</span>`;
  }

  function bidPanelHTML() {
    const h = S.game.hand, g = S.game;
    const A = cfg().advisor ? S.advice : null;
    let adv = "";
    if (cfg().advisor && !A) {
      // Same shape as the finished advisor, so nothing moves when the numbers arrive.
      adv = `<div class="row" style="justify-content:space-between"><span class="muted">Working out your hand…</span><span>&nbsp;</span></div>` +
        `<div class="dist">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<div class="b"><i style="height:0"></i><span>${i}</span></div>`).join("")}</div>` +
        `<div class="muted" style="text-align:center;margin-bottom:6px">&nbsp;</div>`;
    }
    if (A) {
      const maxK = Math.max(6, A.dist.reduce((m, p, i) => (p > 0.01 ? i : m), 0));
      const peak = Math.max(...A.dist);
      adv = `<div class="row" style="justify-content:space-between"><span>Expected <b>${A.expected.toFixed(1)}</b> tricks ${T.help("advisor")}</span>` +
        (A.nilChance !== null ? `<span>Nil <b style="color:${T.scaleColor(1 - A.nilChance, 0, 1)}">${Math.round(A.nilChance * 100)}%</b> ${T.help("nil")}</span>` : "") + `</div>` +
        `<div class="dist">${A.dist.slice(0, maxK + 1).map((p, i) => `<div class="b${i === S.bidPick ? " mine" : ""}"><i style="height:${(p / peak) * 100}%"></i><span>${i}</span></div>`).join("")}</div>` +
        `<div class="muted" style="text-align:center;margin-bottom:6px">Tricks you took in ${360} play-outs</div>`;
    }
    const minBid = g.opts.nil ? 0 : 1;
    let bids = "";
    for (let b = 0; b <= 13; b++) {
      const dis = b < minBid;
      bids += `<button data-bid="${b}" aria-pressed="${S.bidPick === b}" class="${A && A.best.bid === b ? "sugg" : ""}" ${dis ? "disabled" : ""}>${b === 0 ? "Nil" : b}</button>`;
    }
    return `<div class="panel-c">${adv}<div class="bids" data-act="pickbid">${bids}</div>` +
      (A ? `<div class="muted" style="margin-top:6px">Green dot = best average score (${A.best.ev >= 0 ? "+" : ""}${A.best.ev.toFixed(0)} vs them)</div>` : "") + `</div>`;
  }

  function blindPanelHTML() {
    return `<div class="panel-c"><h3>Blind nil?</h3><p class="muted" style="margin:0 0 10px">You're behind by ${S.game.scores[1] - S.game.scores[0]}. Bid nil without looking for ±200.</p>` +
      `<div class="row"><button class="btn" data-act="look">Look at cards</button><span style="flex:1"></span><button class="btn warm" data-act="blind">Blind nil</button></div></div>`;
  }

  function summaryHTML() {
    const g = S.game, h = g.hand;
    const team = (t) => {
      const r = h.result[t];
      return `<div style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><b class="${t ? "warm" : ""}">${t ? "Them" : "Us"}</b><b>${r.points >= 0 ? "+" : ""}${r.points} → ${g.scores[t]}</b></div>` +
        `<div class="muted">${[t, t + 2].map((s) => `${NAMES[s]} ${bidTxt(h, s).replace("Bid ", "bid ")}, took ${h.tricks[s]}`).join(" · ")}</div>` +
        `<div class="muted">${r.parts.map((p) => `${T.esc(p.label)} ${p.pts >= 0 ? "+" : ""}${p.pts}`).join(" · ")} · bags ${g.bags[t]}</div></div>`;
    };
    const lost = S.handStudy.reduce((a, x) => a + x.lost, 0) + (S.bidLoss ? S.bidLoss.lost : 0);
    const title = g.over ? (g.winner === 0 ? "You win!" : "They win") : "Hand " + g.handNo;
    return `<div class="panel-c"><h3>${title}</h3>${team(0)}${team(1)}` +
      (cfg().study ? `<div class="muted">Points lost this hand: <b style="color:${lost < 5 ? "var(--good)" : lost < 20 ? "var(--accent-warm)" : "var(--bad)"}">${lost.toFixed(0)}</b> ${T.help("lost")}</div>` : "") +
      `<div class="row" style="margin-top:12px"><span style="flex:1"></span>${g.over ? `<button class="btn primary" data-act="new">New game</button>` : `<button class="btn primary" data-act="next">Next hand</button>`}</div></div>`;
  }

  function sideHTML(td) {
    const g = S.game, h = g.hand;
    let hist = `<table class="mini"><tr><th>#</th><th>Us</th><th>Them</th></tr>`;
    g.history.slice(-8).forEach((x, i) => {
      hist += `<tr><td>${g.history.length - Math.min(8, g.history.length) + i + 1}</td><td>${x.pts[0]}</td><td>${x.pts[1]}</td></tr>`;
    });
    hist += `<tr class="me"><td>Total</td><td>${g.scores[0]}</td><td>${g.scores[1]}</td></tr><tr><td>Bags ${T.help("bags")}</td><td>${g.bags[0]}</td><td>${g.bags[1]}</td></tr></table>`;
    let study = S.handStudy.map((x) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Trick ${x.trick} · ${C.name(x.card)}${x.best !== x.card ? ` <span style="color:var(--muted)">(best ${C.name(x.best)})</span>` : ""}</span><b style="color:${x.lost < 2 ? "var(--good)" : x.lost < 8 ? "var(--accent-warm)" : "var(--bad)"}">${x.lost.toFixed(0)}</b></div>`).join("");
    if (S.bidLoss) study = `<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Bid ${S.bidLoss.mine === 0 ? "nil" : S.bidLoss.mine}${S.bidLoss.best !== S.bidLoss.mine ? ` <span style="color:var(--muted)">(best ${S.bidLoss.best === 0 ? "nil" : S.bidLoss.best})</span>` : ""}</span><b>${S.bidLoss.lost.toFixed(0)}</b></div>` + study;
    return `<div class="side-sec"><h4>Scores · game to ${g.opts.target}</h4>${hist}</div>` +
      (cfg().tracker && h.phase === "play" ? `<div class="side-sec"><h4>Cards left ${T.help("tracker")}</h4>${T.trackerDetailHTML(td, NAMES, ME, null)}</div>` : "") +
      (cfg().study ? `<div class="side-sec fill"><h4>Points lost ${T.help("lost")}</h4>${study || `<div class="muted" style="font-size:13px">Your bid and plays show here with the points each one lost.</div>`}</div>` : "");
  }

  function renderStart() {
    const c = cfg();
    const lv = ["easy", "medium", "hard"];
    const rules = [`Game to ${c.target}`, c.nil ? (c.blindNil ? "nil + blind nil" : "nil on") : "no nil",
      c.bagLimit ? `${c.bagLimit} bags = −${c.bagPenalty}` : "no bag penalty", c.spadesLead === "any" ? "lead spades any time" : "spades must be broken"];
    if (c.nilCounts) rules.push("nil tricks count");
    if (c.loseAt) rules.push(`lose at −${c.loseAt}`);
    if (c.firstLead === "2c") rules.push("2♣ leads");
    el.innerHTML = `<div class="game"><div class="game-main">` +
      `<div class="bar"><div class="grow"><span class="title">Spades</span><span class="meta">You + computer partner vs 2 computers</span></div></div>` +
      `<div class="felt"><div class="panel-c start"><h3>New game</h3>` +
      `<div class="seats"><div>Left<b>Computer</b></div><div>Partner<b>Computer</b></div><div>Right<b>Computer</b></div></div>` +
      `<div style="display:flex;align-items:center;font-size:13px;color:var(--muted)">Computer level ${T.help("level", "spades")}</div>` +
      `<div class="seg levels" data-act="level">${lv.map((l) => `<button data-level="${l}" aria-pressed="${c.level === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("")}</div>` +
      `<div class="muted" style="margin-bottom:12px">${rules.join(" · ")} · <a href="#settings" data-act="go-settings">change</a></div>` +
      `<button class="btn primary wide" data-act="deal">Deal</button></div></div></div></div>`;
  }

  // ------------------------------------------------------------------ input
  function onClick(e) {
    const a = e.target.closest("[data-act]");
    const cardEl = e.target.closest(".hc");
    if (a && el.contains(a)) {
      const act = a.dataset.act;
      if (act === "deal") return newGame();
      if (act === "level") { const b = e.target.closest("[data-level]"); if (b) { cfg().level = b.dataset.level; Store.save(); render(); } return; }
      if (act === "go-settings") { e.preventDefault(); return root.App.go("settings"); }
      if (act === "hint") return hint();
      if (act === "menu") return menu();
      if (act === "pickbid") { const b = e.target.closest("[data-bid]"); if (b) { S.bidPick = +b.dataset.bid; render(); } return; }
      if (act === "bid") return submitBid(S.bidPick, false);
      if (act === "blind") return submitBid(0, true);
      if (act === "look") { S.looked = true; S.dealAnim = true; persist(); return render(); }
      if (act === "give") return give();
      if (act === "next") return dealNext();
      if (act === "new") { S = null; persist(); return render(); }
      if (act === "tracker") return T.openSheet(`<h3>Cards left ${T.help("tracker")}</h3>` + T.trackerDetailHTML(T.trackerData(S.game.hand, ME), NAMES, ME, null));
    }
    if (cardEl && S) tapCard(+cardEl.dataset.card);
  }

  function submitBid(bid, blind) {
    if (bid === null || bid === undefined) return;
    const g = S.game;
    try { S.game = S_.apply(g, { type: "bid", seat: ME, bid, blind }); }
    catch (err) { T.toast(err.message); return; }
    if (cfg().study && !blind) {
      // Points lost for the bid, from the advisor's numbers (it may still be finishing).
      const my = gen, hn = g.handNo;
      computeAdvice().then((A) => {
        if (!A || my !== gen || !S || S.game.handNo !== hn) return;
        const mineEv = A.evs[bid] !== undefined ? A.evs[bid] : null;
        if (mineEv !== null) { S.bidLoss = { mine: bid, best: A.best.bid, lost: Math.max(0, A.best.ev - mineEv) }; persist(); if (!S.busy) render(); }
      });
    }
    if (blind) { S.looked = true; S.dealAnim = true; }
    persist(); step();
  }

  function give() {
    if (S.sel.size !== 2) return;
    S.game = S_.apply(S.game, { type: "exchange", seat: ME, cards: [...S.sel] });
    S.sel.clear(); persist(); step();
  }

  function tapCard(card) {
    const g = S.game, h = g.hand;
    const a = actor();
    if (!a || a.seat !== ME || S.busy) return;
    if (a.kind === "exchange") {
      if (S.sel.has(card)) S.sel.delete(card); else if (S.sel.size < 2) S.sel.add(card);
      return render();
    }
    if (a.kind !== "play") return;
    if (!S_.legal(h, ME).includes(card)) { T.toast(h.trick.length ? "Follow suit if you can" : "Spades aren't broken yet"); return; }
    if (S.sel.has(card)) return doPlay(ME, card);
    S.sel = new Set([card]); render();
  }

  function menu() {
    T.openSheet(`<h3>Spades</h3><p>You and Partner against Left and Right. First team to ${S.game.opts.target} wins.</p>` +
      `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-m="new">New game</button><button class="btn" data-m="rules">Rules</button><button class="btn" data-m="strength">How strong?</button></div>`,
      (sh) => sh.addEventListener("click", (e) => {
        const b = e.target.closest("[data-m]");
        if (!b) return;
        if (b.dataset.m === "new") { T.closeSheet(); gen++; S = null; persist(); render(); }
        if (b.dataset.m === "rules") { T.closeSheet(); setTimeout(() => root.Lab.rulesSheet("spades"), 30); }
        if (b.dataset.m === "strength") { T.closeSheet(); setTimeout(() => root.Lab.strengthSheet("spades"), 30); }
      }));
  }

  function mount(view) {
    el = view;
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.closest(".hc")) { e.preventDefault(); if (S) tapCard(+e.target.closest(".hc").dataset.card); }
    });
    window.addEventListener("resize", () => T.fitHand(el.querySelector(".hand-wrap")));
    restore();
    if (S && S.game.hand.phase === "play") updateMake();
  }
  function show() { if (S) step(); else render(); }

  root.SpadesUI = { mount, show, render, get state() { return S; }, newGame };
})(typeof self !== "undefined" ? self : globalThis);
