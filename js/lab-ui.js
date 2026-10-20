/* lab-ui.js — the Lab tab: measured computer strength, a bid lab for any 13 cards,
 * your own record over time, plus the rules and "How strong?" sheets used by the games. */
(function (root) {
  "use strict";
  const { Cards: C, Spades: Sp, SpadesAI: SA, Table: T, Art, Store } = root;
  let el = null;
  let lab = { cards: new Set(), result: null };

  // Measured by tools/sim-hearts.js and tools/sim-spades.js (see docs/strength.md for commands and dates).
  const STRENGTH = {
    hearts: {
      note: "Average points per hand against three Medium players (lower is better; 6.5 = an even share).",
      rows: [
        { level: "Easy", v: 12.51, n: 8000 },
        { level: "Medium", v: 6.69, n: 32000 },
        { level: "Hard", v: 5.62, n: 2002 },
      ],
      unit: "pts/hand", lowerBetter: true,
    },
    spades: {
      note: "Games won by a team of this level against a Medium team, playing to 500.",
      rows: [
        { level: "Easy", v: 11.0, n: 2000, extra: "" },
        { level: "Medium", v: 50.2, n: 2000, extra: "" },
        { level: "Hard", v: 90.9, n: 308, extra: "" },
      ],
      unit: "% won", lowerBetter: false,
    },
  };

  function strengthHTML(game) {
    const st = STRENGTH[game];
    const vals = st.rows.map((r) => r.v);
    const max = Math.max(...vals, game === "hearts" ? 13 : 100);
    return `<p class="muted" style="font-size:13px;margin:0 0 8px">${st.note}</p><div class="bars">` +
      st.rows.map((r) => {
        const good = st.lowerBetter ? 1 - r.v / max : r.v / 100;
        const color = T.scaleColor(1 - good, 0, 1);
        return `<div class="r"><span>${r.level}</span><div class="t"><i style="width:${(r.v / max) * 100}%;background:${color}"></i></div><span class="v">${game === "hearts" ? r.v.toFixed(2) : Math.round(r.v) + "%"}</span></div>`;
      }).join("") + `</div><p class="muted" style="font-size:12px;margin:8px 0 0">${st.rows.map((r) => `${r.level}: ${r.n.toLocaleString()} ${game === "hearts" ? "hands" : "games"}${r.extra ? " · " + r.extra : ""}`).join(" · ")}</p>`;
  }
  function strengthSheet(game) {
    T.openSheet(`<h3>How strong? · ${game === "hearts" ? "Hearts" : "Spades"} ${T.help("strength")}</h3>` + strengthHTML(game) +
      `<p style="font-size:13px;margin-top:10px">Easy plays a random legal card half the time. Medium follows rules of thumb. Hard looks ahead: it deals the hidden cards at random many times and plays each option out.</p>`);
  }

  const RULES = {
    hearts: [
      "4 players, 13 cards each. Pass 3 cards: left, right, across, then keep; repeat.",
      "The 2♣ leads the first trick. Follow suit if you can; the highest card of the suit led wins and leads next.",
      "On the first trick you can't throw a heart or the Q♠ unless that's all you hold.",
      "Hearts can't be led until a heart has been played, unless you hold only hearts.",
      "Each heart is 1 point, the Q♠ is 13. Take all 26 (shoot the moon) and everyone else gets 26 instead.",
      "When someone reaches 100 the lowest score wins. A tie for lowest plays another hand.",
      "Variants in Settings: game to 50, moon −26 or shooter's choice, J♦ −10, queen breaks hearts, points on the first trick, passing patterns.",
    ],
    spades: [
      "4 players in two teams; partners sit across. 13 cards each; the deal moves left each hand.",
      "Each player bids how many tricks they'll take (one round, starting left of the dealer). Nil = take none.",
      "The player left of the dealer leads. Follow suit if you can; spades always trump. Spades can't be led until one has been played, unless you hold only spades.",
      "Make your team's total bid: 10 a trick bid + 1 a trick over (a bag). Miss it: −10 a trick bid. Every 10 bags: −100.",
      "Nil: +100 if you take no tricks, −100 if you take any. A nil bidder's tricks don't help the partner's bid; they're bags.",
      "Blind nil (optional): bid nil before looking, ±200, usually only when 100+ behind. You give partner 2 cards, partner gives 2 back.",
      "First team to 500 wins; if both pass 500 on the same hand, the higher score wins.",
    ],
  };
  function rulesSheet(game) {
    T.openSheet(`<h3>${game === "hearts" ? "Hearts" : "Spades"} rules</h3><ul style="margin:0;padding-left:18px;font-size:14px;color:#c9cede">${RULES[game].map((r) => `<li style="margin-bottom:6px">${r}</li>`).join("")}</ul>`);
  }

  // -------------------------------------------------------------- bid lab
  function pickHTML() {
    let out = "";
    for (const s of [2, 3, 1, 0]) {
      out += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0">${Art.suitIcon(s)}<div class="pick" style="flex:1">`;
      for (let r = 12; r >= 0; r--) {
        const c = C.card(s, r);
        out += `<button data-pick="${c}" class="${C.isRed(c) ? "r" : ""}" aria-pressed="${lab.cards.has(c)}">${C.RANK_NAMES[r]}</button>`;
      }
      out += `</div></div>`;
    }
    return out;
  }
  function resultHTML() {
    const A = lab.result;
    if (!A) return `<p class="muted" style="font-size:13px;margin:8px 0 0">Pick 13 cards (or tap Random), then Analyze.</p>`;
    const peak = Math.max(...A.dist);
    const maxK = Math.max(6, A.dist.reduce((m, p, i) => (p > 0.01 ? i : m), 0));
    return `<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap"><span>Expected <b>${A.expected.toFixed(2)}</b> tricks ${T.help("advisor")}</span>` +
      `<span>Nil works <b>${Math.round(A.nilChance * 100)}%</b> ${T.help("nil")}</span><span>Best bid <b class="good">${A.best.bid === 0 ? "Nil" : A.best.bid}</b></span><span class="muted">Rule-of-thumb count ${A.rough}</span></div>` +
      `<div class="dist" style="height:90px">${A.dist.slice(0, maxK + 1).map((p, i) => `<div class="b${i === A.best.bid ? " mine" : ""}"><i style="height:${(p / peak) * 100}%"></i><span>${i}</span></div>`).join("")}</div>` +
      `<p class="muted" style="font-size:12px;margin:4px 0 0">${A.sims} play-outs, you first to bid and lead, everyone else playing Medium.</p>`;
  }
  function analyze() {
    if (lab.cards.size !== 13) return T.toast("Pick exactly 13 cards");
    const mine = [...lab.cards].sort((a, b) => a - b);
    const rest = C.shuffle(C.deck().filter((c) => !lab.cards.has(c)));
    const g = Sp.newGame(Object.assign({}, Store.data.spades, { level: undefined }));
    g.dealer = 3;
    Sp.deal(g, null, mine.concat(rest));
    const sims = 600;
    lab.result = Object.assign(SA.adviseBid(g, 0, sims), { sims });
    render();
  }

  // ---------------------------------------------------------- your record
  function recordHTML(game) {
    const r = Store.data.record[game], hist = Store.data.study[game];
    if (!r.hands) return `<p class="muted" style="font-size:13px;margin:0">Play a hand of ${game === "hearts" ? "Hearts" : "Spades"} and your numbers show up here.</p>`;
    const per = (x) => (x / r.hands).toFixed(game === "hearts" ? 2 : 1);
    // Points lost per hand, last 30 hands, as a small line.
    const pts = hist.slice(-30).map((x) => x.lost);
    let spark = "";
    if (pts.length > 1) {
      const mx = Math.max(...pts, 1);
      const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${40 - (v / mx) * 36}`).join(" ");
      spark = `<svg viewBox="0 0 300 44" style="width:100%;height:44px;margin-top:6px" aria-label="Points lost per hand"><polyline points="${d}" fill="none" stroke="var(--accent-warm)" stroke-width="2"/></svg><div class="muted" style="font-size:11px">Points lost per hand, last ${pts.length} hands</div>`;
    }
    return `<table class="mini"><tr><td>Games</td><td>${r.won} won of ${r.played}</td></tr><tr><td>Hands</td><td>${r.hands}</td></tr>` +
      `<tr><td>${game === "hearts" ? "Points taken / hand" : "Team points / hand"}</td><td>${per(r.pts)}</td></tr><tr><td>Points lost / hand ${T.help("lost")}</td><td>${per(r.lost)}</td></tr></table>${spark}`;
  }

  function render() {
    if (!el) return;
    el.innerHTML = `<div class="page"><div class="page-in"><h2>Lab</h2><div class="cols">` +
      `<div><div class="sec"><h3>How strong? · Hearts ${T.help("strength")}</h3>${strengthHTML("hearts")}</div>` +
      `<div class="sec"><h3>How strong? · Spades</h3>${strengthHTML("spades")}</div>` +
      `<div class="sec"><h3>Your record · Hearts</h3>${recordHTML("hearts")}</div>` +
      `<div class="sec"><h3>Your record · Spades</h3>${recordHTML("spades")}</div></div>` +
      `<div><div class="sec"><h3>Spades bid lab ${T.help("advisor")}</h3>${pickHTML()}` +
      `<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><span class="muted" style="flex:1;font-size:13px">${lab.cards.size}/13 cards</span>` +
      `<button class="btn sm" data-act="clear">Clear</button><button class="btn sm" data-act="random">Random</button><button class="btn sm primary" data-act="analyze" ${lab.cards.size === 13 ? "" : "disabled"}>Analyze</button></div>` +
      resultHTML() + `</div>` +
      `<div class="sec"><h3>Rules</h3><div style="display:flex;gap:8px"><button class="btn sm" data-act="rules-h">Hearts rules</button><button class="btn sm" data-act="rules-s">Spades rules</button></div></div>` +
      `</div></div></div></div>`;
  }

  function mount(view) {
    el = view;
    el.addEventListener("click", (e) => {
      const p = e.target.closest("[data-pick]");
      if (p) {
        const c = +p.dataset.pick;
        if (lab.cards.has(c)) lab.cards.delete(c); else if (lab.cards.size < 13) lab.cards.add(c); else return T.toast("13 cards already");
        lab.result = null; return render();
      }
      const a = e.target.closest("[data-act]");
      if (!a) return;
      const act = a.dataset.act;
      if (act === "clear") { lab.cards.clear(); lab.result = null; render(); }
      if (act === "random") { lab.cards = new Set(C.shuffle(C.deck()).slice(0, 13)); lab.result = null; render(); }
      if (act === "analyze") { a.disabled = true; a.textContent = "Working…"; setTimeout(analyze, 20); }
      if (act === "rules-h") rulesSheet("hearts");
      if (act === "rules-s") rulesSheet("spades");
    });
  }

  root.Lab = { mount, show: render, render, strengthSheet, rulesSheet, STRENGTH };
})(typeof self !== "undefined" ? self : globalThis);
