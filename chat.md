# Hearts & Spades — chat log

## 2026-10-27 — visibility pass (builder agent)
- **Asked:** Tim: cards/board too small to see what's going on; fill the screen, make dense areas readable.
- **Audit:** trick cards covered seat names/bid lines at 320 and 393; your trick card's index hidden under Across's; trick 64 px phone / 88 px laptop in a mostly empty felt; seat lines 11 px; point cards 18 px. 13-card hand and pass selection were already fine.
- **Built:** bigger trick (75 phone, 105 laptop), side seats raised, slot offsets as `--tdx/--tdy/--ty0`, chip to felt corner, larger seat text and point cards. Cache 20261027a.
- **Verified:** new tests/layout.test.mjs failed 49/148 on the old build, passes 148/148 (WebKit x several, Chromium once); existing suites green; 65 after shots at 5 sizes, 0 overflow; one reviewer sub-agent, its findings fixed (Across overlap, SE void-note wrap) or listed as NOT verified.
- **Open:** real iPhone; online table.

## 2026-10-19 — first build + phase 2
- **Asked:** Hearts and Spades in one site, modelled on Cribbage: computers with measured strength, cards-left tracker, moon warning, bid advisor, real-table scorekeeper. Phase 2 added: exact rules plus variants, online play via the shared `_online` module, an ideas brainstorm with the good ones built, polished art, and a QA pass.
- **Built:**
  - engines, AI and helpers;
  - Score and Lab tabs;
  - Settings variants;
  - Web Worker for the heavy maths;
  - online rooms (js/net-games.js adapters + js/online-ui.js);
  - docs/rules-check.md and docs/ideas.md.
- **Verified:**
  - Tests: hearts 20, spades 21, odds 7, online 6, all pass.
  - Full games to game over through the UI at 393 px (WebKit): Hearts and Spades, 0 errors, no overflow, no page scroll.
  - Desktop: hands checked.
  - Online: two WebKit browsers against the real Firebase played a hand of each game; the scores matched.
- **QA sub-agent pass (live):** found 3 bugs, all fixed in de9f32d:
  - Lab and tracker suit icons had no size;
  - Spades scorekeeper names were squashed to 20px on phone (now full-width over Bid/Won);
  - the seat said "1 cards".
- **Open:** real iPhone check, and online with more than 2 people.

## 2026-10-20 — visual design pass
- **Asked (Tim):** "review them again for design improvements especially visually".
- **Built:** bigger hand/trick cards on phone and laptop, trick centred clear of seats, lining-numeral "10", bigger card index, court frame narrowed, larger laptop seats and scorekeeper, Settings 3 columns on wide screens, bigger tap targets, clearer received-card outline. No rules or wording changed.
- **Verified:** 11 states × phone (WebKit 393px) + desktop 1440px before/after, 0 errors, no overflow, no page scroll; tests 20/21/7/6 pass; live at 1e05cf1.

## 2026-10-20 — sounds, celebrations, animations
- **Asked (Tim):** "add opptional sounds ... win celebrations, and other fun annimations ... customizable in the settings".
- **Built:** `js/fx.js` (copy of `_fx`), `js/game-fx.js` (snapshot diff → sounds/animations, same path for local, computer and online moves), custom `heartsBroken` and `queenThud` sounds, Settings "Sound & effects" section, CSS deal/fly/sweep animations obey Animations off / Fast. Map in progress.md.
- **Verified:** `tests/fx.test.mjs` 9 pass (failed 8/9 on a do-nothing stub first; a mutation dropping the Q♠ thud and flipping Spades win also failed it); other suites 20/21/7/6 pass. WebKit play-throughs at 393px and 1440px: real Hearts games to game over (win with confetti, lose, a real moon) and a Spades hand, 0 console errors, no overflow, no page scroll; logged sound calls per game. Screenshots in scratchpad `design/hearts-spades-fx/`.
- **Open:** sounds never heard by a person; online sound path not run with 2 browsers.

## 2026-10-20 — real-table look
- **Asked (Tim):** make each game look like the real thing on a real table, "like you're looking through a camera that is connected to a user's glasses".
- **Built:**
  - green felt from the shared `_table` kit;
  - opponents' held fans of lattice backs (white-bordered back art), trick cross with crooked cards, face-down staggered won tricks plus face-up Hearts point cards;
  - name plates, a cream paper score pad (centre and laptop side), a squared deck on setup that thins during the deal;
  - deal from the deck, 3-D flip for received/blind-nil cards, hand held as an arc fan;
  - `_fx` 1.0.3 re-copied.
  - Fixed a found glitch: the hand slid in from the left on every tap.
- **Verified:**
  - Tests 20/21/7/6/9 pass.
  - 20 WebKit shots (393x659 + 1280x800, both games, setup to end), 0 errors, no overflow, no scroll.
  - 320, 393, 659x393 and 1280 checked.
  - Effects speed leaves the game Speed setting unchanged.
  - Two read-only reviewer rounds.
- **Open:** passed-card slide animation; landscape phone still cramped.

## 2026-10-20 — edge-case pass
- **Asked:** make each game perfect in unexpected or weird scenarios (Tim's words in progress.md). Also the leftovers: pass slide, crosswise Spades tricks, landscape, end pad covering seats.
- **Built:**
  - kit `_table` 1.0.1 re-copied, `.gitattributes`;
  - the hand is recorded on reload mid-sweep;
  - `Spades.gameEnd()` is shared with the scorekeeper (lose-at);
  - Moon/J♦ un-pick; blank-name winner line; Lab nil % hidden when nil is off;
  - phone end pad below the table (beside it in landscape);
  - landscape layout with a tab rail; SE bar fit;
  - pass piles, the pass slide, and a flip that survives redraws;
  - crosswise Spades tricks;
  - blind-nil partner prompt and Help order (Pagat).
- **Verified:**
  - 58 scenarios listed, about 49 run (the online ones were not), 10 failed, all now pass (WebKit at 5 sizes, node engine checks).
  - Each fix's check was first seen failing.
  - Tests 20/22/7/6/9 pass.
- **Open:** online edge scenarios not run.
