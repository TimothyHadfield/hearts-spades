// Hearts computer strength in whole games: who wins a game to 100?
// node tools/sim-hearts-games.js <games> <level0,level1,...> [seed] [workers] [optsJSON]
// The number of levels sets the number of players (3, 4 or 5). The seats rotate every game.
// Prints each level's share of games won and the fair share (seats with that level / players).
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const path = require("path");

function runChunk({ games, levels, seed, opts }) {
  const C = require(path.join(__dirname, "../js/cards.js"));
  const H = require(path.join(__dirname, "../js/hearts.js"));
  const AI = require(path.join(__dirname, "../js/hearts-ai.js"));
  const rnd = C.makeRng(seed);
  const n = levels.length;
  const wins = {}, hands = {}, pts = {};
  for (let k = 0; k < games; k++) {
    const shift = k % n;
    const lv = levels.map((_, s) => levels[(s + shift) % n]);
    const g = H.newGame(Object.assign({ players: n }, opts));
    let guard = 0;
    while (!g.over && guard++ < 200) {
      H.deal(g, rnd);
      if (g.hand.phase === "pass") for (let s = 0; s < n; s++) H.submitPass(g, s, AI.choosePass(g.hand.hands[s], lv[s], rnd));
      while (g.hand.phase === "play") { const s = g.hand.turn; H.play(g, s, AI.chooseMove(g.hand, s, lv[s], rnd, g.opts)); }
      for (let s = 0; s < n; s++) { pts[lv[s]] = (pts[lv[s]] || 0) + g.hand.result.pts[s]; hands[lv[s]] = (hands[lv[s]] || 0) + 1; }
    }
    if (g.over) { const w = lv[g.winners[0]]; wins[w] = (wins[w] || 0) + 1; }
  }
  return { games, wins, hands, pts };
}

if (isMainThread) {
  const games = +process.argv[2] || 200;
  const levels = (process.argv[3] || "hard,hard,medium,medium").split(",");
  const seed = +process.argv[4] || 1;
  const workers = +process.argv[5] || 4;
  const opts = process.argv[6] ? JSON.parse(process.argv[6]) : {};
  const per = Math.ceil(games / workers);
  const t0 = Date.now();
  const tot = { games: 0, wins: {}, hands: {}, pts: {} };
  let done = 0;
  for (let w = 0; w < workers; w++) {
    const wk = new Worker(__filename, { workerData: { games: per, levels, seed: seed * 1000 + w, opts } });
    wk.on("message", (r) => {
      tot.games += r.games;
      for (const k of ["wins", "hands", "pts"]) for (const l in r[k]) tot[k][l] = (tot[k][l] || 0) + r[k][l];
      if (++done === workers) {
        const out = {};
        for (const l of new Set(levels)) {
          const seats = levels.filter((x) => x === l).length;
          out[l] = { gamesWon: +((tot.wins[l] || 0) / tot.games).toFixed(3), fairShare: +(seats / levels.length).toFixed(3), perHand: +(tot.pts[l] / tot.hands[l]).toFixed(2) };
        }
        console.log(JSON.stringify({ games: tot.games, levels, opts, seconds: (Date.now() - t0) / 1000, result: out }));
      }
    });
    wk.on("error", (e) => { console.error(e); process.exit(1); });
  }
} else parentPort.postMessage(runChunk(workerData));
