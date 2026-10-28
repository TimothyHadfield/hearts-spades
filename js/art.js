/* art.js — card faces and backs, drawn as SVG for this site (original art, no publisher designs).
 * A card face is 250 x 350 units. Big corner indexes so a half-hidden card in a fanned hand
 * still reads at phone size; standard pip layouts for 2-10; framed court cards with a crown
 * (king), tiara (queen) or cap (jack). Suit shapes live once in the page (<symbol id="suit-N">). */
(function (root) {
  "use strict";
  const C = root.Cards;
  const RED = "#c8372a", BLACK = "#1b1d26";
  const col = (s) => (s === 1 || s === 3 ? RED : BLACK);
  // Times first: Georgia draws old-style numerals, so its "10" read as "1o" on small cards.
  const SERIF = "'Times New Roman', Times, Georgia, serif";

  // Pip centres (x, y) for ranks 2..10; pips below the middle are drawn upside down.
  const L = 82, M = 125, R = 168;
  const PIPS = {
    2: [[M, 92], [M, 258]],
    3: [[M, 92], [M, 175], [M, 258]],
    4: [[L, 92], [R, 92], [L, 258], [R, 258]],
    5: [[L, 92], [R, 92], [M, 175], [L, 258], [R, 258]],
    6: [[L, 92], [R, 92], [L, 175], [R, 175], [L, 258], [R, 258]],
    7: [[L, 92], [R, 92], [M, 133], [L, 175], [R, 175], [L, 258], [R, 258]],
    8: [[L, 92], [R, 92], [M, 133], [L, 175], [R, 175], [M, 217], [L, 258], [R, 258]],
    9: [[L, 92], [R, 92], [L, 147], [R, 147], [M, 175], [L, 203], [R, 203], [L, 258], [R, 258]],
    10: [[L, 92], [R, 92], [M, 120], [L, 147], [R, 147], [L, 203], [R, 203], [M, 230], [L, 258], [R, 258]],
  };

  const use = (s, x, y, size, flip) =>
    `<use href="#suit-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ""}/>`;

  function corner(s, r) {
    const label = C.RANK_NAMES[r];
    const ten = label === "10";
    return `<text x="${ten ? 41 : 38}" y="74" text-anchor="middle" font-size="${ten ? 60 : 72}" font-weight="800" font-family="${SERIF}" letter-spacing="${ten ? -6 : 0}">${label}</text>` +
      use(s, 38, 110, 42);
  }

  function crown(kind, c) {
    if (kind === "K") return `<path d="M88 116l12-30 16 22 9-30 9 30 16-22 12 30z" fill="${c}" opacity=".9"/><rect x="88" y="116" width="74" height="10" rx="3" fill="#d9a531"/>`;
    if (kind === "Q") return `<path d="M95 120c10-10 20-14 30-24 10 10 20 14 30 24z" fill="#d9a531"/><circle cx="125" cy="92" r="6" fill="${c}"/><circle cx="104" cy="108" r="4" fill="${c}"/><circle cx="146" cy="108" r="4" fill="${c}"/>`;
    return `<path d="M92 122c4-22 22-34 40-30 10 2 18 10 22 20-14-4-26 0-34 10z" fill="${c}" opacity=".9"/><path d="M148 100c8-12 13-18 24-20-5 7-10 14-18 23z" fill="#d9a531"/>`;
  }

  // Jokers (Spades house rule): "JOKER" down the corners like a real deck; the Big Joker is in colour,
  // the Little Joker in black, so the two tell apart in a fan.
  function joker(card) {
    const big = card === C.BIG_JOKER, c = big ? RED : BLACK;
    const corner = "JOKER".split("").map((ch, i) => `<text x="34" y="${48 + i * 29}" text-anchor="middle" font-size="30" font-weight="800" font-family="${SERIF}">${ch}</text>`).join("");
    const gold = "#d9a531", tint = big ? "#f6ddd5" : "#dfe4f0";
    const hat = `<path d="M82 206Q72 140 44 116Q98 132 108 206Z" fill="${c}"/>` +
      `<path d="M104 206Q112 130 125 86Q138 130 146 206Z" fill="${big ? "#1d2a4a" : "#6b7080"}"/>` +
      `<path d="M142 206Q152 132 206 116Q178 140 168 206Z" fill="${c}"/>` +
      `<circle cx="44" cy="116" r="10" fill="${gold}"/><circle cx="125" cy="86" r="10" fill="${gold}"/><circle cx="206" cy="116" r="10" fill="${gold}"/>` +
      `<rect x="76" y="202" width="98" height="20" rx="8" fill="${gold}"/>` +
      `<circle cx="125" cy="252" r="32" fill="${tint}" stroke="${c}" stroke-width="3"/>` +
      `<circle cx="113" cy="246" r="4" fill="${c}"/><circle cx="137" cy="246" r="4" fill="${c}"/>` +
      `<path d="M108 262Q125 278 142 262" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 250 350" fill="${c}" aria-hidden="true">` +
      `<rect x="1.5" y="1.5" width="247" height="347" rx="17" fill="#f6f2e8" stroke="#d4ccbb" stroke-width="3"/>` +
      corner + `<g transform="rotate(180 125 175)">${corner}</g>` +
      `<text x="125" y="58" text-anchor="middle" font-size="26" font-weight="800" font-family="${SERIF}">${big ? "BIG" : "LITTLE"}</text>` +
      hat + `</svg>`;
  }

  function face(card) {
    if (C.isJoker && C.isJoker(card)) return joker(card);
    // The high 2♠ (deuces-high house rule) looks like any 2♠.
    if (card === C.HIGH_DEUCE) card = C.card(C.SPADES, 0);
    const s = C.suit(card), r = C.rank(card), c = col(s);
    let mid = "";
    if (r <= 8) {
      for (const [x, y] of PIPS[r + 2]) mid += use(s, x, y, 46, y > 175);
    } else if (r === 12) {
      mid = (s === 2 ? `<circle cx="125" cy="175" r="68" fill="none" stroke="${c}" stroke-width="3" opacity=".35"/>` : "") + use(s, 125, 175, s === 2 ? 104 : 92);
    } else {
      const k = C.RANK_NAMES[r];
      const tint = c === RED ? "#f6ddd5" : "#dfe4f0";
      // The frame stays clear of the corner index, so a half-hidden court card in a fan shows a clean index strip.
      mid = `<rect x="72" y="66" width="106" height="218" rx="12" fill="${tint}" stroke="${c}" stroke-width="3"/>` +
        `<rect x="79" y="73" width="92" height="204" rx="8" fill="none" stroke="#d9a531" stroke-width="2"/>` +
        crown(k, c) +
        `<text x="125" y="214" text-anchor="middle" font-size="92" font-weight="700" font-family="${SERIF}" fill="${c}">${k}</text>` +
        use(s, 125, 250, 34);
    }
    return `<svg viewBox="0 0 250 350" fill="${c}" aria-hidden="true">` +
      `<rect x="1.5" y="1.5" width="247" height="347" rx="17" fill="#f6f2e8" stroke="#d4ccbb" stroke-width="3"/>` +
      corner(s, r) + `<g transform="rotate(180 125 175)">${corner(s, r)}</g>` + mid + `</svg>`;
  }

  const BACK = `<svg viewBox="0 0 250 350" aria-hidden="true">` +
    `<rect x="1.5" y="1.5" width="247" height="347" rx="17" fill="#f7f4ec" stroke="#d4ccbb" stroke-width="3"/>` +
    `<rect x="14" y="14" width="222" height="322" rx="9" fill="#1d2a4a"/>` +
    `<rect x="22" y="22" width="206" height="306" rx="6" fill="url(#hs-lattice)" stroke="#d9a531" stroke-width="3"/>` +
    `<circle cx="125" cy="175" r="44" fill="#1d2a4a" stroke="#d9a531" stroke-width="3"/>` +
    `<use href="#suit-3" x="88" y="142" width="44" height="44" fill="#e2584b"/>` +
    `<use href="#suit-2" x="118" y="164" width="44" height="44" fill="#e8eaf0"/>` +
    `</svg>`;

  const cache = new Map();
  /** HTML for one card. card = null draws a face-down back. */
  function cardHTML(card, cls) {
    const k = card == null ? "b" : card;
    let svg = cache.get(k);
    if (!svg) { svg = card == null ? BACK : face(card); cache.set(k, svg); }
    const label = card == null ? "face-down card" : C.longName(card);
    return `<div class="pc${card == null ? " back" : ""}${cls ? " " + cls : ""}" role="img" aria-label="${label}">${svg}</div>`;
  }

  /** A small inline suit icon. */
  function suitIcon(s, cls) {
    return `<svg class="${cls || "suit"} ${s === 1 || s === 3 ? "suit-red" : "suit-black"}" viewBox="0 0 100 100" aria-label="${C.SUIT_NAMES[s]}"><use href="#suit-${s}"/></svg>`;
  }

  function init() {
    const defs = document.querySelector("svg defs");
    if (!defs || document.getElementById("hs-lattice")) return;
    defs.insertAdjacentHTML("beforeend",
      `<pattern id="hs-lattice" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="22" height="22" fill="#223260"/><path d="M0 11h22M11 0v22" stroke="#2f4280" stroke-width="3"/>` +
      `<circle cx="11" cy="11" r="2.4" fill="#d9a531" opacity=".55"/></pattern>`);
  }

  root.Art = { cardHTML, suitIcon, face, init };
})(typeof self !== "undefined" ? self : globalThis);
