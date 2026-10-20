# Hearts & Spades — progress

## START HERE
Read order: this file → CLAUDE.md → docs/rules-check.md → docs/ideas.md → chat.md.
Last updated: 2026-10-20 (sounds, celebrations and animations, builder agent).

## Goal right now
Hearts and Spades in one site. Play against measured computers, use study helpers, play online with friends, and keep score at a real table. Phase 1 and phase 2 of the games brief are both done.

## Status
| Area | State |
|---|---|
| Hearts vs 3 computers (Easy/Medium/Hard) | Done. Measured: Easy 12.51, Medium 6.69, Hard 5.62 points per hand against Medium (lower is better) |
| Hearts helpers | Done: cards-left tracker, key-card odds, moon warning, hint, points-lost study |
| Spades (you + computer partner vs 2) | Done. Nil, blind nil (Settings), bags. Measured: Easy 11.0%, Medium 50.2%, Hard 90.9% games won against Medium |
| Spades helpers | Done: bid advisor (trick histogram, nil odds, best bid), make-it odds, hint, points lost |
| Variants (Settings) | Done, see docs/rules-check.md |
| Scorekeeper (real table) | Done for both games (Score tab) |
| Lab | Done: strength tables, run your own matches |
| Online | Done via the shared `_online` layer (Firebase th-board-games, game IDs `hearts`/`spades`). Rooms with codes; empty seats played by computers |
| Heavy maths | Runs in a Web Worker (js/worker.js through js/think.js); falls back to the page |
| Tests | hearts 20, spades 21, odds 7, online 6, fx 9: all pass (2026-10-20) |
| Sound & effects | Done 2026-10-20: `js/fx.js` (byte copy of `_fx/fx.js`, never edit) + `js/game-fx.js` (this site's event→sound map). Settings → "Sound & effects". Map below |
| Visual design pass | Done 2026-10-20 (1e05cf1): cards scale to screen (`--cw`/`--tw` clamps in style.css), lining "10", court frame clear of index, laptop seats/score bigger, Settings 3 columns ≥1200px, tap targets ≥36–40px. Screenshot script: scratchpad `design/hearts-spades/shoot.mjs` (JS clicks) |

## Authorized next steps
- (none pending; wait for Tim's feedback via the manager)

## Standing instructions (Tim's words, from the briefs)
- "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game."
- "Really work on the webdesign of the games, aswell as art"
- "make sure that everything works properlly without errors"
- "Make sure to get everything right like rules and artwork and specific numbers of cards"
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)

## Event → sound map (js/game-fx.js)
Every table render calls `GameFX.observe(kind, snapshot, el)`; `events()` diffs the last snapshot (pure engine state), so local, computer and online moves sound the same. Computers use the same volume as you.
| Event | Sound | Animation |
|---|---|---|
| Deal (hand cards fly in) | `shuffle` + 4 `cardDeal` ticks over the deal | existing CSS deal (stagger scales with Speed) |
| Your pass sent (online, waiting) / cards received | 3 `cardDeal` / 2 `cardFlip` | received cards pop |
| Spades bid | `place` (panned to seat); nil `pop`; blind nil `drumroll` | seat's bid line pops |
| Blind-nil card swap | 2 `cardDeal` | — |
| Card played (anyone) | `cardSlide`, panned left/right by seat | existing CSS fly-in |
| Hearts broken | custom `heartsBroken` sting | the breaking card flashes red |
| Trick swept to winner | `whoosh` panned to winner | Hearts: "+N" points float at winner; no points: seat line pops |
| Q♠ taken | custom `queenThud` | winner's seat shakes |
| Hearts hand scored | — | seat scores count up |
| Shoot the moon | celebrate `big` at shooter (+ `cheer` if it's you) | star burst |
| Spades: our bid made / any set | `coins` / `stamp` | our set shakes the score bar |
| Nil made / failed | ours: celebrate `big` at seat; theirs: low `ding` / `hit` | failed nil seat shakes |
| Bag penalty | `explosion` (quiet) | score bar shakes |
| Game over | celebrate `win` (confetti) or `lose` (dim), per player online | after any moon/nil moment |
| It becomes your turn (not every turn) | `turn` (Alerts) | your seat pulses |
| Illegal card tap | `error` (Alerts) | the card shakes |
| Any button | `tap` (Button clicks) | — |

## Traps
- **OneDrive locks files**: python http.server on the OneDrive folder gives random 404s for JS files. For testing, serve a copy outside OneDrive (the scratchpad `hs-site/` on port 18474).
- **Chrome-engine phone-view needs 127.0.0.1**, not localhost (it tries IPv6 first).
- Headless WebKit on Windows is slow (renders take 80–340 ms against about 22 ms in Chrome). It's the test environment, not the site. Use JS `el.click()` in Playwright scripts, since the stability waits time out.
- Cache version must be bumped in 5 places (see CLAUDE.md). Now `20261020c`.
- Headless WebKit on Windows has no Web Audio, so sounds are silent in screenshots; `tests/fx.test.mjs` checks the sound names with a fake AudioContext instead.
- fx settings live in localStorage `fx:hearts-spades` (one key for both games), separate from `heartsSpades:v1`.
- `js/online.js` is a copy. Don't edit it.
- Online games are never saved to local storage. The room is resumed via `online.<game>` in localStorage.
- Writing long Python through a Bash heredoc failed. Write .py files with Write, then run them.
- Test account: none needed (online rooms are anonymous with a typed name).

## Decisions
- Seats: 0 you (bottom), 1 left, 2 across, 3 right; Spades teams are 0+2 and 1+3.
- Hard AI = Monte Carlo determinization; runs in a worker so taps never freeze.
- Online names are drawn relative to your seat; between hands any person presses "Next hand".
- The Spades bid panel is opaque so the seats don't show through.
- Hearts scorekeeper: a tie for lowest score at game end means another hand is played.

## NOT verified
- On a real iPhone (only WebKit headless at 393 px). Real-device speed of Hard/hint is reasoned to be fine, not measured.
- Online with 3–4 real people at once (tested with 2 browsers + computers).
- Online reconnect after a phone sleeps for a long time.
- Sounds never heard by a person (headless has no audio); loudness balance and iPhone silent switch untested. Online sound path reasoned (same render/observe path as local), not run with 2 browsers.
- Design pass checked at 393x659 and 1440x900 only; 1280x720 laptop and iPhone SE heights not screenshotted (sizes are clamps by vh/vw, reasoned to fit).

## Rejected / parked
- See docs/ideas.md (6 ideas skipped, each with a reason).
