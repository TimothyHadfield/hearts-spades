/* table.js — pieces shared by both games: seats, the trick, your hand, the cards-left
 * tracker, pop-up sheets, "?" help and toasts. Pure HTML builders plus a few DOM helpers. */
(function (root) {
  "use strict";
  const C = root.Cards, Art = root.Art;

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const POS = ["bottom", "left", "top", "right"];
  // Where each player sits, by place to your left (0 = you), for 3, 4 or 5 at the table.
  const LAYOUT = { 3: ["bottom", "left", "right"], 4: POS, 5: ["bottom", "left", "topl", "topr", "right"] };
  const SLOT = { bottom: 0, left: 1, top: 2, right: 3, topl: 4, topr: 5 };
  const posOf = (r, n) => (LAYOUT[n] || POS)[r];
  const rel = (seat, me, n) => (seat - me + (n || 4)) % (n || 4);

  // --------------------------------------------------------------- help (?)
  const HELP = {
    level: ["How strong?", "LEVELS"],
    tracker: ["Cards left", "The number is how many cards of that suit are still hidden in other players' hands. A red letter means that player has shown they have none of the suit (they couldn't follow it), so a lead in that suit lets them throw points on you."],
    moon: ["Moon warning", "One player has taken every point so far. If they take all 26 they score 0 and everyone else gets 26. The % is how often they finished the job when the rest of the hand was played out a few hundred times from what you can see. Taking a single heart stops it."],
    ev: ["Expected points", "Each number is the average points you'd take this hand if you played that card, found by dealing the hidden cards at random a hundred-plus times and playing the rest out. Lower is better. Green is the best card."],
    lost: ["Points lost", "How many more points (on average) your card was expected to cost than the best card at that moment. Zero means you matched the best play. It's measured, not a rule of thumb, so small numbers can be noise."],
    passHint: ["Pass suggestion", "The three cards most likely to hurt you: the queen, ace and king of spades when you're short of low spades, high hearts, and cards that empty a short suit so you can throw points later."],
    advisor: ["Bid advisor", "The bars show how often you took each number of tricks when your hand was played out against random deals of the other cards. The suggested bid is the one with the best average score for your team, counting bags and the partner's bid."],
    nil: ["Nil chance", "How often you took zero tricks when the hand was played out with you trying to lose every trick. Nil scores 100 if it works and loses 100 if it doesn't."],
    makeBid: ["Making the bid", "How often your team reached its bid when the rest of the hand was played out many times from what you can see."],
    bags: ["Bags", "Each trick over your bid is a bag: it scores 1 point, but every 10 bags costs 100."],
    jack: ["Jack of diamonds", "A common house rule: whoever takes the jack of diamonds subtracts 10 points. It doesn't count toward shooting the moon."],
    moonChoice: ["Shooter's choice", "The shooter normally gives everyone else 26. With this option they take −26 instead when adding 26 would end the game with them not winning."],
    blindNil: ["Blind nil", "Bid nil before looking at your cards, for 200 points. Allowed only when your team is behind by 100 or more (set below). You then pass 2 cards to your partner, who passes 2 back."],
    nilCounts: ["Nil tricks", "Standard rule: tricks a nil bidder takes don't count toward the partner's bid; they are bags. Turn this on to let them count."],
    points: ["Point cards", "Standard: each heart 1, Q♠ 13 (26 a hand). Black Maria adds the A♠ (7) and K♠ (10) for 43. Spot Hearts scores each heart at its face value (J 11, Q 12, K 13, A 14) and the Q♠ 25, for 129. Shooting the moon means taking every point."],
    bidding: ["Bidding variants", "Whiz: bid your number of spades, or nil. Mirror: bid exactly your number of spades. Suicide: on each team one partner must bid nil and the other 4 or more. Standard lets you bid anything."],
    strength: ["How measured", "Each level played thousands of hands against three Medium players, swapping seats every hand. The number is the average points taken per hand: 6.5 is an even share and lower is better."],
  };

  // ------------------------------------------------------------------ sheet
  let sheetOpen = false;
  function openSheet(html, bind) {
    const back = document.getElementById("sheet-back"), sh = document.getElementById("sheet");
    sh.innerHTML = html + `<div class="acts"><span></span><button class="btn" data-close>Close</button></div>`;
    back.hidden = false;
    if (!sheetOpen) { sheetOpen = true; try { history.pushState({ sheet: 1 }, ""); } catch (e) { /* ignore */ } }
    if (bind) bind(sh);
  }
  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false;
    document.getElementById("sheet-back").hidden = true;
    document.getElementById("sheet").innerHTML = "";
    if (!fromPop) { try { history.back(); } catch (e) { /* ignore */ } }
  }
  function initSheet() {
    const back = document.getElementById("sheet-back");
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) closeSheet(); });
    window.addEventListener("popstate", () => { if (sheetOpen) closeSheet(true); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-help]");
      if (!b) return;
      e.stopPropagation();
      const key = b.dataset.help;
      const h = HELP[key];
      if (!h) return;
      if (h[1] === "LEVELS") return root.Lab && root.Lab.strengthSheet(b.dataset.game || "hearts");
      openSheet(`<h3>${esc(h[0])}</h3><p>${esc(h[1])}</p>`);
    });
  }
  const help = (key, game) => `<button class="help" data-help="${key}"${game ? ` data-game="${game}"` : ""} aria-label="Why?">?</button>`;

  let toastT = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ------------------------------------------------------------------ seats
  // Each seat is drawn the way a player looks across a real card table: their held cards
  // as a fan of backs, a small name plate, and the tricks they've won stacked face down in front.
  const CPU_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01"/></svg>`;
  const KIT = () => root.TABLE || null;
  const jit = (seed, i, o) => (KIT() ? KIT().jitter(seed, i, o) : { x: 0, y: 0, r: 0 });
  const dealStep = () => 35 * (root.GameFX ? root.GameFX.speed() : 1);
  const BACK = `tbl-card tbl-back tbl-lattice`;

  /** n card backs held in a fan (drawn for a player at the bottom, then turned to face their seat). */
  function backsHTML(n, r, deal) {
    let out = `<div class="ofan-wrap" aria-label="${n} card${n === 1 ? "" : "s"}"><div class="ofan">`;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      out += `<i class="ob ${BACK}${deal ? " deal" : ""}" style="--a:${(k * 4).toFixed(1)}deg;--o:${k.toFixed(1)}` +
        (deal ? `;animation-delay:${Math.round((i + r / 4) * dealStep())}ms` : "") + `"></i>`;
    }
    return out + `</div></div>`;
  }

  /** Tricks won: face-down, each one staggered on the last so the count reads at a glance.
   *  pts (Hearts): the point cards from those tricks, laid face up beside the pile. */
  function wonHTML(seat, n, pts, cross) {
    // cross (Spades): every other trick is laid crosswise on the last, the way players square up
    // tricks at a real table so each one can still be counted.
    let out = `<div class="won${n ? "" : " empty"}${cross ? " cross" : ""}" style="--n:${n}">`;
    for (let i = 0; i < n; i++) {
      const j = jit("won" + seat, i, { rot: 4, off: 1 });
      out += `<i class="${BACK}" style="--i:${i};rotate:${j.r + (cross && i % 2 ? 90 : 0)}deg;translate:0 ${j.y}px"></i>`;
    }
    out += `</div>`;
    if (pts && pts.length) {
      out += `<div class="wpts" style="--n:${pts.length}">` + pts.map((c, i) => {
        const j = jit("pt" + seat, i, { rot: 5, off: 1 });
        return `<div class="wp" style="--i:${i};rotate:${j.r}deg">${Art.cardHTML(c)}</div>`;
      }).join("") + `</div>`;
    }
    return `<div class="won-area">${out}</div>`;
  }

  /** Three cards a player has passed, waiting face down in front of them until everyone has passed. */
  function passPileHTML(seat) {
    let out = `<div class="passpile" aria-label="3 cards passed">`;
    for (let i = 0; i < 3; i++) { const j = jit("pass" + seat, i, { rot: 9, off: 2 }); out += `<i class="${BACK}" style="--i:${i};rotate:${j.r}deg;translate:${j.x}px ${j.y}px"></i>`; }
    return out + `</div>`;
  }

  /** o: pos, seat, name, score, sub, cpu, turn, count (cards held, others only), won, pts, deal,
   *  cross (lay won tricks crosswise), passed (3 passed cards waiting in front of the seat) */
  function seatHTML(o) {
    const r = SLOT[o.pos] || 0;
    const plate = `<div class="plate tbl-plate">${o.cpu ? `<span class="cpu" aria-label="computer">${CPU_ICON}</span>` : ""}` +
      `<span class="seat-name">${esc(o.name)}</span>${o.score !== "" && o.score != null ? `<b class="seat-score">${esc(o.score)}</b>` : ""}</div>`;
    const info = `<div class="seat-info">${plate}${o.sub ? `<span class="seat-sub">${o.sub}</span>` : ""}</div>`;
    return `<div class="seat ${o.pos}${o.turn ? " turn" : ""}" data-seat="${o.seat}">` +
      (o.pos !== "bottom" ? backsHTML(o.count || 0, r, o.deal) : "") +
      `<div class="seat-front">${info}${wonHTML(o.seat, o.won || 0, o.pts, o.cross)}${o.passed ? passPileHTML(o.seat) : ""}</div></div>`;
  }

  /** The pass, like at a real table: each player's 3 cards slide face down across to the player
   *  they go to. Ghost cards only (the hands are already updated). Returns ms until they land. */
  function passFly(view, offset, me, n) {
    n = n || 4;
    const sp = root.GameFX ? root.GameFX.speed() : 1;
    if (!sp || !offset || !view || !view.querySelector || !document.body.animate) return 0;
    const tbl = view.querySelector(".table");
    if (!tbl) return 0;
    const cs = getComputedStyle(tbl), vars = ["--back", "--ink", "--back-frame"].map((v) => `${v}:${cs.getPropertyValue(v)}`).join(";");
    const spot = (s) => {
      const e = s === me ? view.querySelector(".hand-wrap .hand") : view.querySelector(`.seat[data-seat="${s}"] .ofan-wrap`) || view.querySelector(`.seat[data-seat="${s}"]`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    const w = Math.max(22, Math.min(40, (parseFloat(cs.getPropertyValue("--ow")) || 24) * 1.15)), hgt = w * 1.4;
    const ms = Math.round(560 * sp), gap = Math.round(70 * sp);
    for (let s = 0; s < n; s++) {
      const a = spot(s), b = spot((s + offset) % n);
      if (!a || !b) continue;
      for (let k = 0; k < 3; k++) {
        const g = document.createElement("i");
        g.className = BACK;
        g.setAttribute("aria-hidden", "true");
        g.style.cssText = `${vars};--card-w:${w}px;position:fixed;left:${a.x - w / 2}px;top:${a.y - hgt / 2}px;margin:0;z-index:40;pointer-events:none;box-shadow:0 3px 8px rgba(0,0,0,.45)`;
        document.body.appendChild(g);
        const off = (k - 1) * 4, r0 = jit("pf" + s, k, { rot: 10, off: 0 }).r;
        let anim = null;
        try {
          anim = g.animate([{ transform: `translate(${off}px,0) rotate(${r0}deg)` }, { transform: `translate(${b.x - a.x + off}px,${b.y - a.y}px) rotate(${r0 + 20}deg)` }],
            { duration: ms, delay: k * gap, easing: "cubic-bezier(.3,.7,.3,1)", fill: "both" });
        } catch (e) { /* ignore */ }
        const done = () => g.remove();
        if (anim) anim.onfinish = done;
        setTimeout(done, ms + k * gap + 400);
      }
    }
    return ms + 2 * gap;
  }

  /** Tricks each seat has won and (Hearts) the point cards in them, rebuilt from the play log.
   *  The trick still showing on the table (busy) isn't in anyone's pile yet. */
  function wonPiles(h, trickWinner, isPoint, showing) {
    const np = h.hands.length;
    const n = new Array(np).fill(0), pts = Array.from({ length: np }, () => []);
    const plays = h.plays || [];
    const done = h.trickNo - (showing ? 1 : 0);
    for (let t = 0; t < done; t++) {
      const cards = plays.filter((p) => p.trickNo === t);
      if (cards.length !== np) continue;
      const w = trickWinner(cards);
      n[w]++;
      if (isPoint) for (const p of cards) if (isPoint(p.card)) pts[w].push(p.card);
    }
    if (!plays.length) {   // an older saved game without the log: counts only
      const src = h.tricksWon || h.tricks || [0, 0, 0, 0];
      for (let s = 0; s < np; s++) n[s] = src[s];
      if (showing && h.lastTrick) n[h.lastTrick.winner] = Math.max(0, n[h.lastTrick.winner] - 1);
    }
    return { n, pts };
  }

  // ------------------------------------------------------------------- deck
  /** The squared-up deck in the middle of the table while the cards are dealt out. */
  function deckHTML() {
    if (!root.GameFX || !root.GameFX.speed()) return "";
    return `<div class="deal-deck"><i class="${BACK}"></i></div>`;
  }
  /** The squared, face-down deck waiting on the table before the first deal. */
  function restDeckHTML() {
    const st = KIT() ? KIT().stackShadow(52) : null;
    return `<div class="rest-deck" aria-hidden="true"><i class="${BACK}"${st ? ` style="--tbl-stack:${st.shadow};translate:0 ${-st.thickness}px"` : ""}></i></div>`;
  }
  /** Thin the deck card by card as the deal goes round, then lift it away. */
  function runDeck(view) {
    const d = view && view.querySelector(".deal-deck");
    if (!d || !KIT()) return;
    const top = d.firstElementChild, total = 13 * dealStep() + 300, t0 = performance.now();
    // Lift it away on time even when animation frames are held back (a hidden tab, a slow phone),
    // so the deck never stays under the "Pass 3 cards" note.
    setTimeout(() => d.classList.add("gone"), total + 120);
    const tick = () => {
      if (!d.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / total);
      const st = KIT().stackShadow(Math.round(52 * (1 - k)));
      top.style.setProperty("--tbl-stack", st.shadow);
      top.style.translate = `0 ${-st.thickness}px`;
      if (k < 1) requestAnimationFrame(tick); else d.classList.add("gone");
    };
    tick();
  }

  // ------------------------------------------------------------------ trick
  /** trick: [{seat, card}], fresh: Set of cards to animate in, win: winning seat or -1.
   *  Cards land a little crooked, like real cards tossed onto felt (same tilt every render). */
  function trickHTML(trick, me, fresh, win, collectTo, np) {
    np = np || 4;
    let out = `<div class="trick n${np}${collectTo != null ? " collect" : ""}">`;
    const off = { bottom: [60, 150], left: [-150, 30], top: [60, -150], right: [150, 30], topl: [-70, -150], topr: [70, -150] };
    for (const t of trick) {
      const r = SLOT[posOf(rel(t.seat, me, np), np)];
      const j = jit("trick", t.card, { rot: 7, off: 3 });
      let style = `rotate:${j.r}deg;translate:${j.x}px ${j.y}px`;
      if (collectTo != null) {
        const p = off[posOf(rel(collectTo, me, np), np)];
        style += `;--tx:${p[0]}px;--ty:${p[1]}px`;
      }
      out += `<div class="slot s${r}${fresh && fresh.has(t.card) ? " fresh" : ""}${t.seat === win ? " win" : ""}" style="${style}">${Art.cardHTML(t.card)}</div>`;
    }
    return out + `</div>`;
  }

  // ------------------------------------------------------------------- hand
  /**
   * Your hand, fanned to fit the row. opts: legal(Set), sel(Set), best(card), evs(Map card->{txt,color}),
   * fresh(Set: cards newly received), deal(bool: animate in), hidden(bool: face down),
   * flip(true or Set: turn these cards face up with a 3-D flip, once).
   */
  function handHTML(cards, opts) {
    opts = opts || {};
    let out = `<div class="hand" data-n="${cards.length}">`;
    cards.forEach((c, i) => {
      const cls = ["hc"];
      if (opts.legal) cls.push(opts.legal.has(c) ? "legal" : "illegal");
      if (opts.sel && opts.sel.has(c)) cls.push("sel");
      if (opts.best && opts.best.has && opts.best.has(c)) cls.push("best");
      if (opts.fresh && opts.fresh.has(c)) cls.push("new");
      if (opts.deal) cls.push("deal");
      const flip = opts.flip && (opts.flip === true || opts.flip.has(c));
      if (flip) cls.push("flip");
      const ev = opts.evs && opts.evs.get(c);
      out += `<div class="${cls.join(" ")}" data-card="${c}" style="z-index:${i + 1}${opts.deal ? `;animation-delay:${Math.round(i * dealStep())}ms` : ""}${flip ? `;--fd:${Math.round((opts.flipDelay || 0) + i * dealStep())}ms` : ""}"` +
        `${opts.legal && opts.legal.has(c) ? ` role="button" tabindex="0" aria-label="${C.longName(c)}"` : ""}>` +
        (ev ? `<span class="ev" style="color:${ev.color}">${ev.txt}</span>` : "") +
        Art.cardHTML(opts.hidden ? null : c) + (flip ? Art.cardHTML(null, "flip-back") : "") + `</div>`;
    });
    return out + `</div>`;
  }

  /** Hold the hand as a real fan: overlapping, on a gentle arc, every card's corner index showing.
   *  While dealing, each card starts at the deck in the middle of the table. */
  function fitHand(container) {
    const hand = container && container.querySelector(".hand");
    if (!hand) return;
    const cards = hand.querySelectorAll(".hc");
    const n = cards.length;
    if (!n) return;
    const w = cards[0].offsetWidth || 52, ch = cards[0].offsetHeight || w * 1.4;
    const width = hand.clientWidth || container.clientWidth;
    let L;
    if (KIT()) L = KIT().fanLayout(n, { width, cardW: w, cardH: ch, spread: 0.64, maxRot: 11 });
    else {
      const step = Math.min(w * 0.64, (width - w) / Math.max(1, n - 1)), x0 = (width - (w + step * (n - 1))) / 2;
      L = cards.length ? Array.from(cards, (_, i) => ({ x: x0 + i * step, y: 0, r: 0 })) : [];
    }
    const drop = Math.max(...L.map((p) => p.y));
    let deck = null;
    if (hand.querySelector(".hc.deal")) {
      const felt = container.parentElement && container.parentElement.querySelector(".felt");
      if (felt) { const f = felt.getBoundingClientRect(), hr = hand.getBoundingClientRect(); deck = { x: f.left + f.width / 2 - hr.left, y: f.top + f.height / 2 - hr.bottom }; }
    }
    // Freshly rendered cards must land in place, not slide in from the left edge.
    cards.forEach((el) => { el.style.transition = "none"; });
    cards.forEach((el, i) => {
      const p = L[i];
      el.style.setProperty("--x", p.x + "px");
      el.style.setProperty("--y", (p.y - drop) + "px");
      el.style.setProperty("--r", p.r + "deg");
      if (deck) { el.style.setProperty("--dx", (deck.x - w / 2) + "px"); el.style.setProperty("--dy", (deck.y + ch / 2) + "px"); }
    });
    void hand.offsetWidth;
    cards.forEach((el) => { el.style.transition = ""; });
  }

  // ---------------------------------------------------------- cards-left tracker
  /** For each suit: hidden cards (not played, not yours) and which seats are void. */
  function trackerData(h, me) {
    const mine = new Set(h.hands[me]);
    const out = [];
    for (let s = 0; s < 4; s++) {
      const hidden = [];
      for (let r = 12; r >= 0; r--) { const c = C.card(s, r); if (!h.played[c] && !mine.has(c)) hidden.push(c); }
      const np = h.hands.length;
      const voids = Array.from({ length: np - 1 }, (_, k) => (me + k + 1) % np).filter((seat) => h.voids[seat][s]);
      out.push({ suit: s, hidden, voids });
    }
    return out;
  }
  // "Left" -> "L", "Far left" -> "FL" (5 players), an online name -> its first letter
  const initials = (nm) => String(nm).split(/s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  function stripHTML(td, names, me, np) {
    let out = `<div class="strip" data-act="tracker" role="button" aria-label="Cards left in each suit">`;
    for (const t of td) {
      out += `<div class="cell">${Art.suitIcon(t.suit)}<span class="n">${t.hidden.length}</span><span class="voids">` +
        (t.voids.length ? t.voids.map((s) => `<b>${esc(initials(names[rel(s, me, np)]))} none</b>`).join("") : `<span>&nbsp;</span>`) + `</span></div>`;
    }
    return out + `</div>`;
  }
  /** Full tracker: each suit's hidden cards + void players + where key cards probably are. */
  function trackerDetailHTML(td, names, me, keyProbs, np) {
    np = np || 4;
    let out = "";
    for (const t of td) {
      out += `<div style="display:flex;align-items:center;gap:8px;margin:6px 0">${Art.suitIcon(t.suit)}` +
        `<b style="min-width:18px">${t.hidden.length}</b><span style="color:var(--muted);font-size:13px;flex:1;line-height:1.3">` +
        (t.hidden.length ? t.hidden.map((c) => C.RANK_NAMES[C.rank(c)]).join(" ") : "none hidden") +
        (t.voids.length ? ` · <span class="bad">${t.voids.map((s) => esc(names[rel(s, me, np)])).join(", ")} out</span>` : "") +
        `</span></div>`;
    }
    if (keyProbs && keyProbs.length) {
      out += `<div style="margin-top:10px;font-size:12px;color:var(--muted)">Where the big cards probably are</div><table class="mini"><tr><th></th>` +
        names.slice(1, np).map((nm) => `<th>${esc(nm)}</th>`).join("") + `</tr>`;
      for (const kp of keyProbs) {
        out += `<tr><td>${C.name(kp.card)}</td>` + kp.p.map((p) => `<td style="color:${p > 0.6 ? "var(--bad)" : p < 0.15 ? "var(--muted)" : "var(--text)"}">${Math.round(p * 100)}%</td>`).join("") + `</tr>`;
      }
      out += `</table>`;
    }
    return out;
  }

  /** Red -> green colour for a "lower is better" value v within [best, worst]. */
  function scaleColor(v, best, worst) {
    const t = worst > best ? Math.max(0, Math.min(1, (v - best) / (worst - best))) : 0;
    const hue = 140 - 140 * t;   // 140 green -> 0 red
    return `hsl(${hue.toFixed(0)} 70% 62%)`;
  }

  root.Table = { esc, POS, LAYOUT, posOf, rel, HELP, help, openSheet, closeSheet, initSheet, toast, seatHTML, passFly, wonPiles, deckHTML, restDeckHTML, runDeck, trickHTML, handHTML, fitHand, trackerData, stripHTML, trackerDetailHTML, scaleColor, CPU_ICON };
})(typeof self !== "undefined" ? self : globalThis);
