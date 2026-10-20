/* table.js — pieces shared by both games: seats, the trick, your hand, the cards-left
 * tracker, pop-up sheets, "?" help and toasts. Pure HTML builders plus a few DOM helpers. */
(function (root) {
  "use strict";
  const C = root.Cards, Art = root.Art;

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const POS = ["bottom", "left", "top", "right"];
  const rel = (seat, me) => (seat - me + 4) % 4;

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
    blindNil: ["Blind nil", "Bid nil before looking at your cards, for 200 points. Allowed only when your team is behind by 100 or more (set below). Your partner then passes you 2 cards and you pass 2 back."],
    nilCounts: ["Nil tricks", "Standard rule: tricks a nil bidder takes don't count toward the partner's bid; they are bags. Turn this on to let them count."],
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
  const CPU_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01"/></svg>`;
  function seatHTML(o) {
    const vertical = o.pos === "left" || o.pos === "right";
    return `<div class="seat ${o.pos}${o.turn ? " turn" : ""}" data-seat="${o.seat}">` +
      `<div class="avatar${o.them ? " them" : ""}${o.cpu ? " cpu" : ""}" aria-hidden="true">${o.cpu ? CPU_ICON : esc(o.initial || "?")}</div>` +
      `<div class="seat-txt"><span class="seat-name">${esc(o.name)}</span><span class="seat-score">${esc(o.score)}</span>` +
      (o.sub ? `<span class="seat-sub">${o.sub}</span>` : "") +
      (vertical && o.count != null ? `<span class="seat-count">${o.count} cards</span>` : "") +
      `</div></div>`;
  }

  // ------------------------------------------------------------------ trick
  /** trick: [{seat, card}], fresh: Set of cards to animate in, win: winning seat or -1. */
  function trickHTML(trick, me, fresh, win, collectTo) {
    let out = `<div class="trick${collectTo != null ? " collect" : ""}">`;
    const off = { bottom: [0, 170], left: [-170, 0], top: [0, -170], right: [170, 0] };
    for (const t of trick) {
      const r = rel(t.seat, me);
      let style = "";
      if (collectTo != null) {
        const p = off[POS[rel(collectTo, me)]];
        style = ` style="--tx:${p[0]}px;--ty:${p[1]}px"`;
      }
      out += `<div class="slot s${r}${fresh && fresh.has(t.card) ? " fresh" : ""}${t.seat === win ? " win" : ""}"${style}>${Art.cardHTML(t.card)}</div>`;
    }
    return out + `</div>`;
  }

  // ------------------------------------------------------------------- hand
  /**
   * Your hand, fanned to fit the row. opts: legal(Set), sel(Set), best(card), evs(Map card->{txt,color}),
   * fresh(Set: cards newly received), deal(bool: animate in), hidden(bool: face down).
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
      const ev = opts.evs && opts.evs.get(c);
      out += `<div class="${cls.join(" ")}" data-card="${c}" style="z-index:${i + 1}${opts.deal ? `;animation-delay:${i * 35}ms` : ""}"` +
        `${opts.legal && opts.legal.has(c) ? ` role="button" tabindex="0" aria-label="${C.longName(c)}"` : ""}>` +
        (ev ? `<span class="ev" style="color:${ev.color}">${ev.txt}</span>` : "") +
        Art.cardHTML(opts.hidden ? null : c) + `</div>`;
    });
    return out + `</div>`;
  }

  /** Overlap the cards so the whole hand fits the row's width. */
  function fitHand(container) {
    const hand = container && container.querySelector(".hand");
    if (!hand) return;
    const cards = hand.querySelectorAll(".hc");
    const n = cards.length;
    if (!n) return;
    const w = cards[0].offsetWidth || 52;
    const avail = hand.clientWidth || container.clientWidth;
    const gap = 4;
    let step = Math.min(w + gap, (avail - w) / Math.max(1, n - 1));
    const m = step - w;
    cards.forEach((el, i) => { el.style.marginLeft = i === 0 ? "0" : m + "px"; });
  }

  // ---------------------------------------------------------- cards-left tracker
  /** For each suit: hidden cards (not played, not yours) and which seats are void. */
  function trackerData(h, me) {
    const mine = new Set(h.hands[me]);
    const out = [];
    for (let s = 0; s < 4; s++) {
      const hidden = [];
      for (let r = 12; r >= 0; r--) { const c = C.card(s, r); if (!h.played[c] && !mine.has(c)) hidden.push(c); }
      const voids = [1, 2, 3].map((k) => (me + k) % 4).filter((seat) => h.voids[seat][s]);
      out.push({ suit: s, hidden, voids });
    }
    return out;
  }
  function stripHTML(td, names, me) {
    let out = `<div class="strip" data-act="tracker" role="button" aria-label="Cards left in each suit">`;
    for (const t of td) {
      out += `<div class="cell">${Art.suitIcon(t.suit)}<span class="n">${t.hidden.length}</span><span class="voids">` +
        (t.voids.length ? t.voids.map((s) => `<b>${esc(names[rel(s, me)][0])} none</b>`).join("") : `<span>&nbsp;</span>`) + `</span></div>`;
    }
    return out + `</div>`;
  }
  /** Full tracker: each suit's hidden cards + void players + where key cards probably are. */
  function trackerDetailHTML(td, names, me, keyProbs) {
    let out = "";
    for (const t of td) {
      out += `<div style="display:flex;align-items:center;gap:8px;margin:6px 0">${Art.suitIcon(t.suit)}` +
        `<b style="min-width:18px">${t.hidden.length}</b><span style="color:var(--muted);font-size:13px;flex:1;line-height:1.3">` +
        (t.hidden.length ? t.hidden.map((c) => C.RANK_NAMES[C.rank(c)]).join(" ") : "none hidden") +
        (t.voids.length ? ` · <span class="bad">${t.voids.map((s) => esc(names[rel(s, me)])).join(", ")} out</span>` : "") +
        `</span></div>`;
    }
    if (keyProbs && keyProbs.length) {
      out += `<div style="margin-top:10px;font-size:12px;color:var(--muted)">Where the big cards probably are</div><table class="mini"><tr><th></th>` +
        [1, 2, 3].map((k) => `<th>${esc(names[k])}</th>`).join("") + `</tr>`;
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

  root.Table = { esc, POS, rel, HELP, help, openSheet, closeSheet, initSheet, toast, seatHTML, trickHTML, handHTML, fitHand, trackerData, stripHTML, trackerDetailHTML, scaleColor, CPU_ICON };
})(typeof self !== "undefined" ? self : globalThis);
