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
- **Open:** real iPhone check, and online with more than 2 people.
