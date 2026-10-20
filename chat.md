# Hearts & Spades — chat log

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
