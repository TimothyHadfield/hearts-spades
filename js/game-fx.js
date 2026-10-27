/* game-fx.js — sounds, celebrations and small animations for both tables, on top of fx.js.
 * Each table render calls GameFX.observe(kind, snapshot, viewEl). events() compares the last
 * snapshot with this one (pure: it only reads engine state), so a local game, a computer's move
 * and another player's online move all sound the same. perform() plays what changed.
 * Every sound, celebration and animation obeys the Sound & effects switches in Settings. */
(function (root) {
  "use strict";
  const fx = () => root.FX;
  const QS = 36;                                  // queen of spades (cards.js: suit*13 + rank)
  const suit = (c) => (c / 13) | 0;
  // place to your left, folded onto the 4 sides of the table (you, left, across, right) for panning
  let NP = 4;
  const FOLD = { 3: [0, 1, 3], 4: [0, 1, 2, 3], 5: [0, 1, 2, 2, 3] };
  const rel = (seat, me) => (FOLD[NP] || FOLD[4])[(seat - me + NP) % NP];
  const PAN = [0, -0.5, 0, 0.5];                  // you, left, across, right

  // ---------------------------------------------------------- custom sounds
  function defineSounds() {
    const F = fx();
    // Hearts broken: a short two-note sting, low then a bright minor stab.
    F.define("heartsBroken", (k) => {
      k.tone({ f: 330, dur: 0.12, vol: 0.14, type: "triangle" });
      k.tone({ f: 622, dur: 0.32, vol: 0.13, type: "triangle", at: 0.09 });
      k.tone({ f: 784, dur: 0.3, vol: 0.08, type: "triangle", at: 0.09 });
      k.noise({ f: 3000, q: 1.2, dur: 0.06, vol: 0.12, at: 0.09 });
    }, "moves");
    // Queen of spades taken: a heavy, low thud.
    F.define("queenThud", (k) => {
      k.tone({ f: 110, f2: 42, dur: 0.38, vol: 0.5 });
      k.noise({ f: 700, f2: 120, filter: "lowpass", dur: 0.22, vol: 0.55 });
      k.tone({ f: 220, f2: 140, dur: 0.1, vol: 0.12, type: "triangle" });
    }, "moves");
  }

  // ---------------------------------------------------------------- settings
  function speed() {
    const s = fx() ? fx().settings : null;
    if (!s || !s.animations) return 0;
    return s.animSpeed === "fast" ? 0.55 : 1;
  }
  function syncClasses() {
    const d = root.document && root.document.documentElement;
    if (!d || !d.classList) return;
    const sp = speed();
    d.classList.toggle("fx-noanim", sp === 0);
    d.classList.toggle("fx-fast", sp > 0 && sp < 1);
  }

  let ready = false;
  function init() {
    if (ready || !fx()) return;
    ready = true;
    fx().init({ game: "hearts-spades", accent: "#6ea8fe" });
    defineSounds();
    fx().onChange(syncClasses);
    syncClasses();
  }

  // ---------------------------------------------------------------- events
  function actorSeat(kind, g, busy) {
    const h = g.hand;
    if (!h || g.over || busy) return -1;
    if (kind === "hearts") return h.phase === "play" ? h.turn : -1;
    if (h.phase === "bid") return h.bidTurn;
    if (h.phase === "exchange" && h.exchange) return h.exchange.step === "nil" ? h.exchange.nilSeat : (h.exchange.nilSeat + 2) % 4;
    return h.phase === "play" ? h.turn : -1;
  }
  const myTurn = (kind, x) => !!(x && x.g && x.g.hand) && actorSeat(kind, x.g, x.busy) === x.me;
  const summaryUp = (x) => !!(x && x.g && x.g.hand && x.g.hand.phase === "done" && !x.show);

  /** What happened between snapshot p and snapshot c? Returns a list of plain events. */
  function events(kind, p, c) {
    const ev = [];
    if (!c || !c.g || !c.g.hand) return ev;
    const g = c.g, h = g.hand, me = c.me;
    NP = h.hands ? h.hands.length : 4;
    if (!p || !p.g || !p.g.hand) {             // first look at this game: just the deal, if it's animating
      if (c.dealAnim) ev.push({ t: "deal" });
      return ev;
    }
    const pg = p.g, ph = pg.hand;
    const newHand = (ph.phase === "done" && h.phase !== "done") || h.trickNo < ph.trickNo || (kind === "hearts" && pg.handNo !== g.handNo && h.phase !== "done");
    if (c.dealAnim) ev.push({ t: "deal" });
    else if (newHand) ev.push({ t: "shuffle" });   // Spades blind nil: dealt face down
    if (newHand) return ev;

    // Passing (Hearts) and the blind-nil swap (Spades)
    if (kind === "hearts" && ph.phase === "pass") {
      if (!ph.passes[me] && h.passes[me] && h.phase === "pass") ev.push({ t: "pass" });
      if (h.phase === "play") ev.push({ t: "receive" });
    }
    if (kind === "spades") {
      for (let s = 0; s < 4; s++) if (ph.bids[s] === null && h.bids[s] !== null && h.bids[s] !== undefined) ev.push({ t: "bid", seat: s, rel: rel(s, me), bid: h.bids[s], blind: !!h.blind[s] });
      const st = (x) => (x.exchange ? x.exchange.step : null);
      if (st(h) !== st(ph) && st(ph)) ev.push({ t: "exchange" });
    }

    // Cards played
    if (ph.phase === "play") {
      const before = new Set(ph.trick.map((x) => x.card));
      let fresh = [];
      if (h.trickNo > ph.trickNo || h.phase === "done") fresh = (h.lastTrick ? h.lastTrick.cards : []).concat(h.phase === "play" ? h.trick : []);
      else fresh = h.trick;
      for (const x of fresh) if (!before.has(x.card)) ev.push({ t: "play", seat: x.seat, rel: rel(x.seat, me), card: x.card });
      if (kind === "hearts" && h.heartsBroken && !ph.heartsBroken) {
        const br = fresh.filter((x) => !before.has(x.card) && (suit(x.card) === 3 || x.card === QS)).pop();
        ev.push({ t: "heartsBroken", rel: br ? rel(br.seat, me) : 0 });
      }
    }

    // The finished trick sweeps to its winner
    if (c.collecting && !p.collecting && c.show) {
      const w = c.show.winner;
      ev.push({ t: "sweep", seat: w, rel: rel(w, me), points: kind === "hearts" ? c.show.points || 0 : 0, queen: kind === "hearts" && c.show.cards.some((x) => x.card === QS) });
    }

    // Hand over: scores, moon, nil, bags, made/set, game over
    if (summaryUp(c) && !summaryUp(p) && h.result) {
      if (kind === "hearts") {
        const r = h.result;
        ev.push({ t: "scores", from: g.scores.map((s, i) => s - r.pts[i]), to: g.scores.slice() });
        if (r.moonBy >= 0) ev.push({ t: "moon", seat: r.moonBy, mine: r.moonBy === me });
        if (g.over) ev.push({ t: g.winners && g.winners.includes(me) ? "win" : "lose" });
      } else {
        const us = me % 2;
        for (let s = 0; s < 4; s++) if (h.bids[s] === 0) ev.push({ t: h.tricks[s] === 0 ? "nilMade" : "nilSet", seat: s, us: s % 2 === us });
        for (let t = 0; t < 2; t++) {
          const r = h.result[t];
          for (const part of r.parts) {
            if (/^Bid \d+ made/.test(part.label)) ev.push({ t: "made", us: t === us });
            if (/ set$/.test(part.label)) ev.push({ t: "set", us: t === us });
          }
          if (r.penalty > 0) ev.push({ t: "bags", us: t === us });
        }
        if (g.over) ev.push({ t: g.winner === us ? "win" : "lose" });
      }
    }

    // It just became your turn
    if (myTurn(kind, c) && !myTurn(kind, p) && !c.dealAnim) ev.push({ t: "turn" });
    return ev;
  }

  // --------------------------------------------------------------- perform
  const later = (ms, f) => setTimeout(f, ms);
  const q = (el, sel) => (el && el.querySelector ? el.querySelector(sel) : null);
  const seatEl = (el, s) => q(el, `.seat[data-seat="${s}"]`);
  const WIN_COLORS = ["#6ea8fe", "#f0b354", "#6ee7a8", "#ff8c8c", "#e8eaf0"];

  function perform(kind, list, el) {
    const F = fx();
    if (!F || !list.length) return;
    const play = (n, o) => F.play(n, o);
    let endDelay = 0;
    for (const e of list) {
      switch (e.t) {
        case "deal":
          play("shuffle", { vol: 0.8 });
          for (let i = 0; i < 4; i++) later(140 + i * 120, () => play("cardDeal", { vol: 0.7 }));
          break;
        case "shuffle": play("shuffle", { vol: 0.8 }); break;
        case "pass": for (let i = 0; i < 3; i++) later(i * 70, () => play("cardDeal", { vol: 0.7 })); break;
        case "receive": {
          play("cardFlip");
          later(90, () => play("cardFlip", { pitch: 1.08 }));
          const got = el && el.querySelectorAll ? el.querySelectorAll(".hand .hc.new") : [];
          Array.prototype.forEach.call(got, (c) => F.pop(c));
          break;
        }
        case "exchange": play("cardDeal"); later(90, () => play("cardDeal")); break;
        case "bid":
          if (e.bid === 0) play(e.blind ? "drumroll" : "pop", { pan: PAN[e.rel] });
          else play("place", { pan: PAN[e.rel] });
          F.pop(q(seatEl(el, e.seat), ".seat-sub"));
          break;
        case "play": play("cardSlide", { pan: PAN[e.rel] }); break;
        case "heartsBroken":
          later(120, () => play("heartsBroken"));
          later(120, () => F.flash(q(el, `.trick .slot.s${e.rel}`), "rgba(255,90,90,.9)"));
          break;
        case "sweep": {
          play("whoosh", { vol: 0.5, pan: PAN[e.rel] });
          const seat = seatEl(el, e.seat);
          if (e.queen) { later(260, () => play("queenThud")); later(260, () => F.shake(seat)); }
          if (e.points) later(300, () => F.floatText(seat, "+" + e.points, "#ff9b9b"));
          else F.pop(q(seat, ".seat-sub"));
          break;
        }
        case "scores":
          e.to.forEach((v, s) => { if (v !== e.from[s]) F.countUp(q(seatEl(el, s), ".seat-score"), e.from[s], v, { duration: 700 }); });
          break;
        case "moon":
          endDelay = 1300;
          F.celebrate({ kind: "big", at: seatEl(el, e.seat) });
          if (e.mine) later(250, () => play("cheer", { cat: "celebrations", vol: 0.6 }));
          break;
        case "nilMade":
          endDelay = Math.max(endDelay, 1300);
          if (e.us) F.celebrate({ kind: "big", at: seatEl(el, e.seat) });
          else play("ding", { pitch: 0.8 });
          break;
        case "nilSet": later(150, () => play("hit", { vol: 0.8 })); F.shake(seatEl(el, e.seat)); break;
        case "made": if (e.us) later(200, () => play("coins")); break;
        case "set": later(320, () => play("stamp")); if (e.us) F.shake(q(el, ".bar .title")); break;
        case "bags":
          endDelay = Math.max(endDelay, 900);
          later(450, () => play("explosion", { vol: 0.55 }));
          later(450, () => F.shake(q(el, ".bar .title")));
          break;
        case "win": case "lose": {
          const kindC = e.t;
          later(endDelay, () => F.celebrate({ kind: kindC, colors: kindC === "win" ? WIN_COLORS : undefined }));
          break;
        }
        case "turn":
          play("turn");
          F.pulse(q(el, ".seat.bottom"));          // your seat is always drawn at the bottom
          break;
      }
    }
  }

  // ---------------------------------------------------------------- observe
  const last = {};
  /** snap: { g, me, dealAnim, show, collecting, busy } or null (start screen). */
  function observe(kind, snap, el) {
    if (!ready) init();
    const prev = last[kind] || null;
    last[kind] = snap && snap.g ? { g: snap.g, me: snap.me, dealAnim: !!snap.dealAnim, show: snap.show || null, collecting: !!snap.collecting, busy: !!snap.busy } : null;
    if (!last[kind]) return [];
    // A different seat (joined online) or a different game object family: start fresh.
    const p = prev && prev.me === snap.me ? prev : null;
    const list = events(kind, p, last[kind]);
    try { perform(kind, list, el); } catch (e) { /* effects never break the game */ }
    return list;
  }

  /** A tap on a card you can't play: soft error and a little shake. */
  function illegal(cardEl) {
    if (!fx()) return;
    fx().play("error");
    fx().shake(cardEl);
  }

  const api = { init, observe, events, illegal, speed };
  root.GameFX = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root.document && root.FX) init();
})(typeof self !== "undefined" ? self : globalThis);
