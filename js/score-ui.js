/* score-ui.js — real-table scorekeeper for both games. It uses the same scoring functions as
 * the computer games (Hearts.handPoints, Spades.scoreTeam), so a number can't differ between them. */
(function (root) {
  "use strict";
  const { Hearts: H, Spades: Sp, Table: T, Store } = root;
  let el = null;
  const draft = { hearts: null, spades: null };
  const sk = () => Store.data.score;

  // ----------------------------------------------------------------- hearts
  function heartsTotals() {
    const d = sk().hearts;
    const tot = d.names.map(() => 0);
    for (const hnd of d.hands) hnd.pts.forEach((p, i) => { tot[i] += p; });
    return tot;
  }
  function heartsHTML() {
    const d = sk().hearts, c = Store.data.hearts;
    const n = d.names.length;
    if (!draft.hearts || draft.hearts.taken.length !== n) draft.hearts = { taken: d.names.map(() => ""), moon: -1, jack: -1 };
    const tot = heartsTotals();
    const over = Math.max(...tot) >= c.target && d.hands.length;
    const low = Math.min(...tot);
    let head = `<tr><th></th>${d.names.map((nm, i) => `<th><input class="txt" data-name="${i}" value="${T.esc(nm)}" maxlength="10" aria-label="Player ${i + 1} name" style="text-align:center;padding:4px 2px;min-height:32px;font-size:16px"></th>`).join("")}</tr>`;
    let total = `<tr class="tot"><td style="font-size:12px;color:var(--muted);font-weight:600">Total</td>${tot.map((t) => `<td class="${d.hands.length && t === low ? "lead" : ""}">${t}</td>`).join("")}</tr>`;
    let rows = d.hands.slice().reverse().map((hnd, k) => `<tr><td style="color:var(--muted);font-size:12px">${d.hands.length - k}</td>${hnd.pts.map((p, i) => `<td>${p}${hnd.moonBy === i ? " ☾" : ""}</td>`).join("")}</tr>`).join("");
    const dr = draft.hearts;
    const entry = `<tr><td style="font-size:12px;color:var(--muted)">Took</td>${d.names.map((_, i) => `<td><input class="num" inputmode="numeric" data-took="${i}" value="${T.esc(dr.taken[i])}" placeholder="0" aria-label="Points taken by ${T.esc(d.names[i])}"></td>`).join("")}</tr>` +
      `<tr><td style="font-size:12px;color:var(--muted)">Moon</td>${d.names.map((_, i) => `<td><label class="chk"><input type="radio" name="moon" data-moon="${i}" ${dr.moon === i ? "checked" : ""}></label></td>`).join("")}</tr>` +
      (c.jack ? `<tr><td style="font-size:12px;color:var(--muted)">J♦</td>${d.names.map((_, i) => `<td><label class="chk"><input type="radio" name="jack" data-jack="${i}" ${dr.jack === i ? "checked" : ""}></label></td>`).join("")}</tr>` : "");
    return `<div class="sec">` +
      (over ? `<div class="warm" style="font-weight:800;margin-bottom:6px">${T.esc(d.names[tot.indexOf(low)])} wins (lowest score)</div>` : "") +
      `<table class="sk-table">${head}${total}${entry}</table>` +
      `<div class="row" style="display:flex;gap:8px;align-items:center;margin-top:10px"><span id="sk-check" class="muted" style="flex:1;font-size:13px">${checkHearts()}</span>` +
      `<button class="btn primary" data-act="h-add">Add hand</button></div></div>` +
      `<div class="sec"><table class="sk-table">${rows || `<tr><td class="muted" style="font-size:13px">No hands yet</td></tr>`}</table></div>` +
      `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="h-undo" ${d.hands.length ? "" : "disabled"}>Undo last</button>` +
      `<button class="btn sm" data-act="h-minus" ${n > 3 ? "" : "disabled"}>− player</button><button class="btn sm" data-act="h-plus" ${n < 5 ? "" : "disabled"}>+ player</button>` +
      `<span style="flex:1"></span><button class="btn sm" data-act="h-new">New game</button></div>` +
      `<p class="muted" style="font-size:12px;margin-top:10px">Game to ${c.target} · moon ${c.moon === "subtract" ? "−26" : c.moon === "choice" ? "shooter's choice" : "+26 to others"}${c.jack ? " · J♦ −10" : ""} (from Settings). 3 players: take out the 2♦ (17 cards each). 5 players: take out the 2♦ and 2♣ (10 each); the 3♣ leads.</p>`;
  }
  function checkHearts() {
    const dr = draft.hearts;
    if (dr.moon >= 0) return "Moon: " + T.esc(sk().hearts.names[dr.moon]) + " took all 26";
    const sum = dr.taken.reduce((a, v) => a + (parseInt(v, 10) || 0), 0);
    return sum === 26 ? `<span class="good">26 points ✓</span>` : `${sum} of 26 points`;
  }
  function addHearts() {
    const d = sk().hearts, c = Store.data.hearts, dr = draft.hearts;
    let taken = dr.taken.map((v) => Math.max(0, Math.min(26, parseInt(v, 10) || 0)));
    if (dr.moon >= 0) taken = taken.map((_, i) => (i === dr.moon ? 26 : 0));
    else if (taken.reduce((a, b) => a + b, 0) !== 26) return T.toast("Points must add up to 26");
    const r = H.handPoints(taken, c.moon, c.jack ? dr.jack : -1, heartsTotals(), c.target);
    d.hands.push({ taken, pts: r.pts, moonBy: r.moonBy });
    draft.hearts = null;
    Store.save(); render();
  }

  // ----------------------------------------------------------------- spades
  function spadesTotals() {
    const d = sk().spades;
    let sc = [0, 0], bags = [0, 0];
    for (const hnd of d.hands) for (let t = 0; t < 2; t++) { sc[t] += hnd.res[t].points; bags[t] = hnd.res[t].bagsAfter; }
    return { sc, bags };
  }
  function spadesHTML() {
    const d = sk().spades, c = Store.data.spades;
    if (!draft.spades) draft.spades = { bid: ["", "", "", ""], tricks: ["", "", "", ""] };
    const dr = draft.spades;
    const { sc, bags } = spadesTotals();
    const over = d.hands.length && (sc[0] >= c.target || sc[1] >= c.target) && sc[0] !== sc[1];
    const bidOpts = (i) => {
      let o = `<option value="">Bid</option>`;
      if (c.nil) o += `<option value="0" ${dr.bid[i] === "0" ? "selected" : ""}>Nil</option>`;
      if (c.nil && c.blindNil) o += `<option value="B" ${dr.bid[i] === "B" ? "selected" : ""}>Blind nil</option>`;
      for (let b = 1; b <= 13; b++) o += `<option value="${b}" ${dr.bid[i] === String(b) ? "selected" : ""}>${b}</option>`;
      return o;
    };
    // player order around the table: team A = 0 & 2, team B = 1 & 3
    const team = (t) => `<div style="flex:1;min-width:0"><input class="txt" data-team="${t}" value="${T.esc(d.teams[t])}" maxlength="12" aria-label="Team name" style="font-weight:800;margin-bottom:6px">` +
      `<div class="big" style="font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;${t ? "color:var(--accent-warm)" : ""}">${sc[t]}</div><div class="muted" style="font-size:12px">${bags[t]} bag${bags[t] === 1 ? "" : "s"}</div>` +
      [t, t + 2].map((i) => `<div style="display:grid;grid-template-columns:1fr 74px 60px;gap:4px;margin-top:6px;align-items:center">` +
        `<input class="txt" data-pname="${i}" value="${T.esc(d.names[i])}" maxlength="10" aria-label="Player name">` +
        `<select class="num" data-bid="${i}" aria-label="Bid">${bidOpts(i)}</select>` +
        `<input class="num" inputmode="numeric" data-tricks="${i}" value="${T.esc(dr.tricks[i])}" placeholder="Won" aria-label="Tricks won"></div>`).join("") + `</div>`;
    const rows = d.hands.slice().reverse().map((hnd, k) => `<tr><td style="color:var(--muted);font-size:12px">${d.hands.length - k}</td>` +
      [0, 1].map((t) => `<td>${hnd.res[t].points >= 0 ? "+" : ""}${hnd.res[t].points}<div class="muted" style="font-size:11px">${[t, t + 2].map((i) => (hnd.bid[i] === 0 ? (hnd.blind[i] ? "BN" : "N") : hnd.bid[i]) + "/" + hnd.tricks[i]).join(" ")}</div></td>`).join("") + `</tr>`).join("");
    return `<div class="sec">` + (over ? `<div class="warm" style="font-weight:800;margin-bottom:6px">${T.esc(d.teams[sc[0] > sc[1] ? 0 : 1])} win</div>` : "") +
      `<div style="display:flex;gap:14px">${team(0)}${team(1)}</div>` +
      `<div style="display:flex;gap:8px;align-items:center;margin-top:10px"><span id="sk-check" class="muted" style="flex:1;font-size:13px">${checkSpades()}</span><button class="btn primary" data-act="s-add">Add hand</button></div></div>` +
      `<div class="sec"><table class="sk-table"><tr><th>#</th><th>${T.esc(d.teams[0])}</th><th>${T.esc(d.teams[1])}</th></tr>${rows || `<tr><td colspan="3" class="muted" style="font-size:13px">No hands yet</td></tr>`}</table></div>` +
      `<div style="display:flex;gap:8px"><button class="btn sm" data-act="s-undo" ${d.hands.length ? "" : "disabled"}>Undo last</button><span style="flex:1"></span><button class="btn sm" data-act="s-new">New game</button></div>` +
      `<p class="muted" style="font-size:12px;margin-top:10px">Game to ${c.target} · ${c.bagLimit ? `${c.bagLimit} bags = −${c.bagPenalty}` : "no bag penalty"} · nil ±100${c.blindNil ? ", blind nil ±200" : ""} (from Settings).</p>`;
  }
  function checkSpades() {
    const dr = draft.spades;
    const sum = dr.tricks.reduce((a, v) => a + (parseInt(v, 10) || 0), 0);
    const bids = dr.bid.filter((b) => b !== "").length;
    return `${bids}/4 bids · ` + (sum === 13 ? `<span class="good">13 tricks ✓</span>` : `${sum} of 13 tricks`);
  }
  function addSpades() {
    const d = sk().spades, c = Store.data.spades, dr = draft.spades;
    if (dr.bid.some((b) => b === "")) return T.toast("Enter all four bids");
    const tricks = dr.tricks.map((v) => Math.max(0, Math.min(13, parseInt(v, 10) || 0)));
    if (tricks.reduce((a, b) => a + b, 0) !== 13) return T.toast("Tricks must add up to 13");
    const bid = dr.bid.map((b) => (b === "B" ? 0 : +b));
    const blind = dr.bid.map((b) => b === "B");
    const { bags } = spadesTotals();
    const res = [0, 1].map((t) => Sp.scoreTeam([bid[t], bid[t + 2]], [blind[t], blind[t + 2]], [tricks[t], tricks[t + 2]], bags[t], c));
    d.hands.push({ bid, blind, tricks, res });
    draft.spades = null;
    Store.save(); render();
  }

  // ------------------------------------------------------------------ frame
  function render() {
    if (!el) return;
    const mode = sk().mode;
    el.innerHTML = `<div class="page"><div class="page-in" style="max-width:640px">` +
      `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><h2 style="margin:0;flex:1">Scorekeeper</h2>` +
      `<div class="seg" data-act="mode" style="width:200px"><button data-mode="hearts" aria-pressed="${mode === "hearts"}">Hearts</button><button data-mode="spades" aria-pressed="${mode === "spades"}">Spades</button></div></div>` +
      (mode === "hearts" ? heartsHTML() : spadesHTML()) + `</div></div>`;
  }

  function confirmNew(fn) {
    T.openSheet(`<h3>Start a new game?</h3><p>This clears the scores on this page.</p><div style="display:flex;justify-content:flex-end"><button class="btn warm" data-yes>Clear scores</button></div>`,
      (sh) => sh.querySelector("[data-yes]").addEventListener("click", () => { fn(); T.closeSheet(); render(); }));
  }

  function mount(view) {
    el = view;
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      const act = a.dataset.act, d = sk();
      if (act === "mode") { const b = e.target.closest("[data-mode]"); if (b) { d.mode = b.dataset.mode; Store.save(); render(); } }
      if (act === "h-add") addHearts();
      if (act === "h-undo") { d.hearts.hands.pop(); Store.save(); render(); }
      if (act === "h-plus" && d.hearts.names.length < 5) { d.hearts.names.push("P" + (d.hearts.names.length + 1)); d.hearts.hands = []; draft.hearts = null; Store.save(); render(); T.toast("Scores reset for the new player count"); }
      if (act === "h-minus" && d.hearts.names.length > 3) { d.hearts.names.pop(); d.hearts.hands = []; draft.hearts = null; Store.save(); render(); T.toast("Scores reset for the new player count"); }
      if (act === "h-new") confirmNew(() => { d.hearts.hands = []; draft.hearts = null; Store.save(); });
      if (act === "s-add") addSpades();
      if (act === "s-undo") { d.spades.hands.pop(); Store.save(); render(); }
      if (act === "s-new") confirmNew(() => { d.spades.hands = []; draft.spades = null; Store.save(); });
    });
    // Typing never re-renders (that would close the iPhone keyboard); only the check line updates.
    el.addEventListener("input", (e) => {
      const t = e.target, d = sk();
      if (t.dataset.name !== undefined) { d.hearts.names[+t.dataset.name] = t.value.slice(0, 10); Store.save(); }
      if (t.dataset.team !== undefined) { d.spades.teams[+t.dataset.team] = t.value.slice(0, 12); Store.save(); }
      if (t.dataset.pname !== undefined) { d.spades.names[+t.dataset.pname] = t.value.slice(0, 10); Store.save(); }
      if (t.dataset.took !== undefined) draft.hearts.taken[+t.dataset.took] = t.value.replace(/[^0-9]/g, "").slice(0, 2);
      if (t.dataset.tricks !== undefined) draft.spades.tricks[+t.dataset.tricks] = t.value.replace(/[^0-9]/g, "").slice(0, 2);
      const chk = el.querySelector("#sk-check");
      if (chk) chk.innerHTML = d.mode === "hearts" ? checkHearts() : checkSpades();
    });
    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.moon !== undefined) { draft.hearts.moon = draft.hearts.moon === +t.dataset.moon ? -1 : +t.dataset.moon; }
      if (t.dataset.jack !== undefined) draft.hearts.jack = +t.dataset.jack;
      if (t.dataset.bid !== undefined) draft.spades.bid[+t.dataset.bid] = t.value;
      const chk = el.querySelector("#sk-check");
      if (chk) chk.innerHTML = sk().mode === "hearts" ? checkHearts() : checkSpades();
    });
  }

  root.ScoreUI = { mount, show: render, render };
})(typeof self !== "undefined" ? self : globalThis);
