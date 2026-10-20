# Hearts & Spades — project rules

Live: https://timothyhadfield.github.io/hearts-spades/ · Repo: https://github.com/TimothyHadfield/hearts-spades

Read `progress.md` first (START HERE). Tim's global rules apply; this file wins on project details.

- Static GitHub Pages site, no build step, $0. Plain JS files loaded by `index.html` (order matters).
- Engines are pure: `apply(state, action)` / `view(state, seat)`. Keep them that way, since online play (`js/net-games.js`) and the worker depend on it.
- `js/online.js` is an unchanged copy of `Board and Card Games/_online/online.js`. Never edit it here; re-copy it if the shared one changes.
- After changing any JS/CSS, bump the cache version in all of these: `index.html` (`?v=`), `js/think.js`, `js/worker.js`, `js/online-ui.js`, `js/store.js` (VERSION).
- Tests: `node tests/<name>.test.mjs` (hearts, spades, odds, online). Every new test must first be seen failing against a broken engine.
- UI: no page scroll, bottom tabs on phone, side rail + right panel on laptop, 1–3 word labels, "?" help explains why, options live in Settings.
