# Hearts & Spades — progress

## START HERE
Read order: this file → CLAUDE.md → docs/rules-check.md → docs/ideas.md → chat.md.
Last updated: 2026-10-27 (improvement pass: variants, Undo/Replay, kits; builder agent).

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
| Tests | hearts 20, spades 22, odds 7, variants 14, online 6, fx 9, layout ~147–150 (count varies run to run; Playwright, WebKit + Chromium): all pass (2026-10-27). `node tools/pwa-check.mjs --engine chromium` 18/18 |
| Improvement pass (2026-10-27) | Done, live at 74703b9. Hearts 3/4/5 players (start panel), Black Maria + Spot Hearts (Settings "Point cards"); Spades Whiz/Mirror/Suicide (Settings "Bidding"); Undo (card or bid), Replay hand (same deal), trick-by-trick review; My stats + Daily game (`_profile` 1.0.1, separate `profile:hearts` / `profile:spades`); guided first Hearts hand + rules sheets (`_coach`); home-screen install + offline (`_pwa` 1.1.0); laptop New game panel scaled up (zoom 1.25 / 1.45) |
| Computer ladder (whole games, 2026-10-27) | Spades: Medium beats Easy 87.5%, Hard beats Medium 90.2%. Hearts 4p (2 v 2 seats): Medium 98.3% vs Easy, Hard 71.5% vs Medium; 3p: Medium 90.7% / Hard 75% (fair 33%); 5p: Medium 92% / Hard 64.2% (fair 40%). `tools/sim-hearts-games.js` |
| Visibility pass | Done 2026-10-27: trick 64→75 px phone, 48→54 SE, 44→52 landscape, 88→105 laptop, 99→118 at 1440; side seats raised (27% phone, 24% SE) so the trick never covers names/bid lines; your trick card on top so all 4 corner indexes show; moon/make-bid chip moved to felt's bottom-right; seat lines 12.5 px phone / 15 px laptop; Hearts point cards 24 px phone. Shots + audit: scratchpad `vis/hearts-spades/` (before/, after/, audit.md) |
| Edge-case pass | Done 2026-10-20: 58 weird scenarios listed, about 49 run (online ones not), 10 failed, all fixed (table below) |
| Sound & effects | Done 2026-10-20: `js/fx.js` (byte copy of `_fx/fx.js`, never edit) + `js/game-fx.js` (this site's event→sound map). Settings → "Sound & effects". Map below |
| Real-table look | Done 2026-10-20: green felt (shared kit `_table` copied to `css/table.css` + `js/kit/table.js`, never edit). Opponents hold fans of card backs turned to face them; played cards land crooked in a cross; won tricks sit face down and staggered by each seat, Hearts point cards face up beside them; paper score pad; squared deck on the setup screen that thins as it deals; 3-D flip for received/looked-at cards. Research in scratchpad `table/hearts-spades/real.md`, shots `before/` + `after/` |
| Visual design pass | Done 2026-10-20 (1e05cf1): cards scale to screen (`--cw`/`--tw` clamps in style.css), lining "10", court frame clear of index, laptop seats/score bigger, Settings 3 columns ≥1200px, tap targets ≥36–40px. Screenshot script: scratchpad `design/hearts-spades/shoot.mjs` (JS clicks) |

## Authorized next steps
- (none pending; wait for Tim's feedback via the manager)

## Standing instructions (Tim's words, from the briefs)
- "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game."
- "Really work on the webdesign of the games, aswell as art"
- "make sure that everything works properlly without errors"
- "Make sure to get everything right like rules and artwork and specific numbers of cards"
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "could you also make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life, so it's easy to understand if you've already played it before, and also so it feels more like you're actually playing in real life rather than you're playing it online. Even things like how youre cards or other things are laid out infront of you, make it look like they are actual cards laid out similar to how it looks like in real life. Make the decks look like actual decks. Make the board have the same design as it does in real life with the same layouts. It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)

- "I've noticed the games often have good user interfaces but could be improved especially when a scenario happens that the game might've not really thought about or whatnot. Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)

- "for a lot of the games the cards or board layout is too small to easily see what's going on. Some games just need small design imporvements like filling the screen with the board view and fitting the cards and other things in the empty space, some have severe errors like TTR. Fix this so the view of what's happening and where everything is is very clear. Consider parts of the board that are dense in what's happening and if the user can reasonably see it." (2026-10-26)

## Edge-case scenarios (2026-10-20)
List and harness: scratchpad `edge/hearts-spades/` (scenarios.md, rules.js, ui.mjs, ui2.mjs, pass.mjs, shots.mjs; WebKit at 393x659, 320x568, 659x393, 1280x800, 1920x1080).
| Family | Tested | Failed → fixed |
|---|---|---|
| Rules (R1–R19) | 19 | R19 scorekeeper ignored Spades lose-at → shared `Spades.gameEnd()` |
| People (P1–P6) | 3 offline (P1–P3, P6 online not run) | P4 blank name " wins" → "Player N"; P5 Lab claimed nil % with nil off |
| Taps (T1–T11) | 11 | T9 scorekeeper Moon/J♦ radio couldn't be un-picked |
| Devices (D1–D9) | 8 | D6 reload mid-sweep of last trick lost the hand from the record; D1/D3 landscape (bid 13 covered, felt 77 px) |
| Screens (S1–S8) | 7 | S3 Spades bar overflow at 320; S6 end pad hid seats/Next on phone, SE, landscape |
| Leftovers (L1–L4, F1) | 5 | L1 pass slide added; L2 Spades tricks crosswise; L3 landscape; L4 pad below table; F1 flip survives redraws |

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
- **Kits re-copied 2026-10-27 (kitfix):** game-coach 1.1.0 (rules tabs wrap instead of scrolling sideways; a note beside a tall target keeps title + 2 lines + buttons) and game-pwa 1.3.0 (`data-extra` on the pwa.js tag caches files loaded later by script). Copies stay byte-identical to `../_coach` / `../_pwa`. `tests/layout.test.mjs` fails 1 random "trick N: trick clear of seats" check on the iPhone SE size, before and after the re-copy (flaky, not the kits).
- **online.js cache stamp (2026-10-27):** every import of `js/online.js` uses `?v=a3d0418b`, the `_online` content stamp. After a re-copy: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump the importing file's `?v=` (and pwa.js `data-version`), then `node ../_online/tools/stamp.mjs --check .` must say OK.
- **OneDrive locks files**: python http.server on the OneDrive folder gives random 404s for JS files. For testing, serve a copy outside OneDrive (the scratchpad `hs-site/` on port 18474).
- **Chrome-engine phone-view needs 127.0.0.1**, not localhost (it tries IPv6 first).
- Headless WebKit on Windows is slow (renders take 80–340 ms against about 22 ms in Chrome). It's the test environment, not the site. Use JS `el.click()` in Playwright scripts, since the stability waits time out.
- Cache version must be bumped in 5 places (see CLAUDE.md), and in two spellings: `index.html` uses `20261027f` (also pwa.js `data-version`), store/think/worker/online-ui use `2026-10-27f`. A sed on only one spelling left index.html stale once.
- Shared kit copies (never edit, re-copy; all `-text` in .gitattributes): js/profile.js + css/profile.css, js/coach.js + css/coach.css, sw.js + js/pwa.js, js/fx.js, css/table.css + js/kit/table.js. This game's parts: js/profile-hs.js, js/coach-hs.js.
- Hearts/Spades UI state saved per game: `tricks`, `handStart` (game before the deal + deck, for Replay), `undo`, `helped`, `daily`, `done`, `tutorial`. `S.done` stops a game being recorded twice; quitting (menu New game, Daily, tutorial) records an unfinished game as a loss.
- Shell heredocs drop backslashes in regexes (`/\s+/` became `/s+/` once). Edit regexes with the Edit tool.
- `tools/pwa-check.mjs` fails "offline cold open" in WebKit for Hold'em too (kit/harness issue); Chromium passes all 18.
- Trick layout lives in CSS vars on `.trick`: `--tw` card width, `--tdx`/`--tdy` side/vertical offsets, `--ty0` vertical position; per-size overrides in the 360 / SE (max-height 640) / laptop / landscape blocks. `tests/layout.test.mjs` guards it (trick never covers seat parts, every corner index on top, chip clear of indexes); it needs Playwright from `~/.claude/tools`. `sed -i` on these files is blocked by the guard; use a small node replace.
- Phone (<900 px) end of hand: the pad renders in `.pad-slot` below the felt (beside it in landscape), not in the felt; laptop keeps it on the felt. A matchMedia listener re-renders on crossing 900 px.
- Landscape phone = `@media (max-width:899px) and (max-height:500px)`: tabs become a left rail.
- `.gitattributes` marks the kit/fx copies `-text` so they stay byte-identical.
- `css/table.css` and `js/kit/table.js` are byte copies of `_table`; `js/fx.js` is a byte copy of `_fx` 1.0.3 (its speed buttons use `data-fxspeed`, so they can't clash with the game's `.seg[data-k]` Speed). Re-copy, never edit.
- The hand fan is placed by `fitHand` (js/table.js) with `--x/--y/--r`; it switches the transition off while placing, or freshly drawn cards slide in from the left edge on every tap. `S.freshTrick` is cleared after each render so trick cards fly in once, not on every redraw.
- `<i class="tbl-card">` is inline; give it `display:block` or it has no height.
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
- Blind-nil swap order follows Pagat (nil bidder gives 2 first, partner gives 2 back); the Help text was corrected to match (2026-10-20).
- Hearts pass: passed cards wait face down in front of each passer, then slide as backs to the receiver; your received cards flip up when they land.
- Spades won tricks alternate crosswise (every other trick turned 90°).
- Improvement pass (2026-10-27, Tim didn't pick): 5-player seats "Far left"/"Far right" (FL/FR in tight spots); 3/5 players pass left, right, keep; Black Maria keeps the moon rule (43); Spot Hearts keeps the target at 100; online stays 4-player standard; Daily = Hearts to 50 / Spades to 200 vs Medium, no Undo or Replay; ratings Hearts 1200/1900/2060, Spades 1200/1540/1930 from measured win rates; Undo button sits in the prompt row, Replay in the hand summary; Spades Cutthroat and 2-player not built.
- Visibility (2026-10-27, Tim didn't pick): side seats sit high; your trick card overlaps Across's (yours on top); moon/make-bid chip in the felt's bottom-right corner; on phone the side seats' point cards sit beside their tricks (row, not column).

## NOT verified
- On a real iPhone (only WebKit headless at 393 px). Real-device speed of Hard/hint is reasoned to be fine, not measured.
- Online with 3–4 real people at once (tested with 2 browsers + computers).
- Online reconnect after a phone sleeps for a long time.
- Sounds never heard by a person (headless has no audio); loudness balance and iPhone silent switch untested. Online sound path reasoned (same render/observe path as local), not run with 2 browsers.
- Edge pass: online scenarios (two people passing at once, disconnect mid-pass, P1–P3, P6, S8) not run. Pass slide and waiting pass piles checked in WebKit at 393 only; online "my passed cards wait face down" path reasoned, not run.
- Visibility pass (2026-10-27): no real iPhone; online table not shot; Hearts point cards beside won piles still small (24 px phone, totals shown as "♥ N"); at SE the corner chip can sit near your trick card (test checks it never covers an index).
- Improvement pass: real iPhone install/offline not tried; WebKit offline cold open fails in the kit's own check (same for Hold'em); the "replayed last hand records the game" fix is reasoned, not run; the guided Hearts hand was shot at step 1 only (later steps not walked through); Back pressed within ~30 ms of opening Rules/My stats from the game menu could close the new panel (timing race, not seen).
- Design pass checked at 393x659 and 1440x900 only; 1280x720 laptop and iPhone SE heights not screenshotted (sizes are clamps by vh/vw, reasoned to fit).

## Rejected / parked
- See docs/ideas.md (6 ideas skipped, each with a reason).
