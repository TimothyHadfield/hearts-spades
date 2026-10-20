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
