/* online-ui.js — play Hearts or Spades with friends through the shared online layer
 * (js/online.js, a copy of Board and Card Games/_online/online.js). Handles the
 * "Play online" sheet, the room lobby and loading the module only when it's needed.
 * The tables themselves (hearts-ui / spades-ui) draw the game from each snapshot. */
(function (root) {
  "use strict";
  const { Table: T, Store } = root;
  const rooms = {};          // kind -> { ctl, snap, listeners }
  let modP = null;

  function loadModule() {
    if (!modP) modP = import(new URL("js/online.js?v=2026-10-27d", document.baseURI).href);
    return modP;
  }
  const savedRoom = (kind) => { try { return JSON.parse(localStorage.getItem("online." + kind)); } catch (e) { return null; } };
  const myName = () => (Store.data.online && Store.data.online.name) || "";
  function setName(n) { Store.data.online = Store.data.online || {}; Store.data.online.name = String(n || "").trim().slice(0, 20); Store.save(); }

  /** Get (or make) the room controller for a game. onSnap(snap) is called on every change. */
  async function controller(kind, onSnap) {
    if (rooms[kind]) { rooms[kind].onSnap = onSnap; return rooms[kind]; }
    const mod = await loadModule();
    const ctl = mod.createOnline({ game: root.NetGames[kind], gameId: kind, botDelayMs: 750 });
    const r = { ctl, snap: null, onSnap };
    ctl.on("change", (snap) => { r.snap = snap; if (r.onSnap) r.onSnap(snap); });
    ctl.on("error", (msg) => T.toast(String(msg)));
    rooms[kind] = r;
    return r;
  }

  /** After a reload: if this browser was in a room for this game, go back into it. */
  async function resume(kind, onSnap) {
    const s = savedRoom(kind);
    if (!s || !s.code) return false;
    try {
      const r = await controller(kind, onSnap);
      return await r.ctl.resume();
    } catch (e) { return false; }
  }

  /** The "Play online" sheet: your name, then make a room or type a friend's code. */
  function openSheet(kind, options, onSnap) {
    const html = `<h3>Play online</h3>` +
      `<p class="muted" style="font-size:13px;margin:0 0 10px">Make a room and send the code to friends, or join theirs. Empty seats are played by computers.</p>` +
      `<label class="fld"><span>Your name</span><input id="on-name" maxlength="20" autocomplete="nickname" value="${T.esc(myName())}" placeholder="Name"></label>` +
      `<div class="on-row"><button class="btn primary" data-on="create">Make a room</button></div>` +
      `<div class="on-or">or join</div>` +
      `<div class="on-row"><input id="on-code" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="Code" aria-label="Room code"><button class="btn" data-on="join">Join</button></div>` +
      `<p class="on-msg muted" id="on-msg" style="font-size:13px;min-height:18px;margin:8px 0 0"></p>`;
    T.openSheet(html, (sh) => {
      const msg = (t) => { const m = sh.querySelector("#on-msg"); if (m) m.textContent = t; };
      sh.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-on]");
        if (!b || b.disabled) return;
        const name = sh.querySelector("#on-name").value.trim();
        if (!name) { msg("Type your name first."); sh.querySelector("#on-name").focus(); return; }
        setName(name);
        b.disabled = true; msg(b.dataset.on === "create" ? "Making a room…" : "Joining…");
        try {
          const r = await controller(kind, onSnap);
          let res;
          if (b.dataset.on === "create") res = await r.ctl.createRoom({ name, seats: ["human", "empty", "empty", "empty"], options });
          else {
            const code = sh.querySelector("#on-code").value.trim().toUpperCase();
            if (code.length !== 5) { msg("Room codes are 5 letters."); b.disabled = false; return; }
            res = await r.ctl.joinRoom(code, name);
          }
          if (res.ok) T.closeSheet(); else { msg(res.message || "That didn't work."); b.disabled = false; }
        } catch (err) { msg("Couldn't reach the online service. Check your connection."); b.disabled = false; }
      });
    });
  }

  /** Lobby panel for the felt. seatLabel(i) gives the table position name for seat i. */
  function lobbyHTML(snap, seatLabel) {
    const host = snap.isHost;
    const rows = snap.seats.map((s, i) => {
      const who = s.kind === "human" ? `${T.esc(s.name)}${i === snap.mySeat ? " (you)" : ""}${s.isHost ? " · host" : ""}` : s.kind === "computer" ? "Computer" : `<span class="muted">Open for a friend</span>`;
      let ctl = "";
      if (host && i !== snap.mySeat && s.kind !== "human") ctl = `<button class="btn sm" data-on-seat="${i}" data-kind="${s.kind === "empty" ? "computer" : "empty"}">${s.kind === "empty" ? "Computer" : "Open"}</button>`;
      return `<div class="on-seat"><span class="pos">${seatLabel(i)}</span><span class="who">${who}</span>${ctl}</div>`;
    }).join("");
    return `<div class="panel-c lobby"><div class="on-code-big" aria-label="Room code">${T.esc(snap.code || "")}</div>` +
      `<div class="muted" style="text-align:center;margin:-2px 0 10px">Friends join with this code</div>` +
      `<div class="on-seats">${rows}</div>` +
      `<div class="row" style="margin-top:12px"><button class="btn" data-on="leave">Leave</button><span style="flex:1"></span>` +
      (host ? `<button class="btn primary" data-on="start">Start</button>` : `<span class="muted">Waiting for the host…</span>`) + `</div></div>`;
  }

  /** Lobby clicks (Start / Leave / seat toggles). Returns true if it handled the click. */
  async function lobbyClick(kind, e) {
    const r = rooms[kind];
    if (!r) return false;
    const seatBtn = e.target.closest("[data-on-seat]");
    if (seatBtn) { await r.ctl.setSeat(+seatBtn.dataset.onSeat, seatBtn.dataset.kind); return true; }
    const b = e.target.closest("[data-on]");
    if (!b) return false;
    if (b.dataset.on === "start") { b.disabled = true; const res = await r.ctl.start(); if (!res.ok) b.disabled = false; return true; }
    if (b.dataset.on === "leave") { await leave(kind); return true; }
    return false;
  }

  async function act(kind, action) {
    const r = rooms[kind];
    if (!r) return { ok: false };
    return r.ctl.act(action);
  }

  async function leave(kind) {
    const r = rooms[kind];
    if (!r) return;
    const cb = r.onSnap;
    r.snap = null;
    try { await r.ctl.leave(); } catch (e) { /* ignore */ }
    if (cb) cb({ mode: "online", status: "left" });
  }

  root.OnlineUI = { openSheet, resume, lobbyHTML, lobbyClick, act, leave, savedRoom, room: (k) => rooms[k] };
})(typeof self !== "undefined" ? self : globalThis);
