// Measure Hearts computer strength by self-play.
// node tools/sim-hearts.js <hands> <level0,level1,level2,level3> [seed] [workers]
// Seats rotate through the table every hand so no seat gets a positional edge.
// Prints the average points per hand for each level (lower is better; 6.5 = even).
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const path = require("path");

function runChunk({ hands, levels, seed }) {
  const C = require(path.join(__dirname, "../js/cards.js"));
  const H = require(path.join(__dirname, "../js/hearts.js"));
  const AI = require(path.join(__dirname, "../js/hearts-ai.js"));
  const rnd = C.makeRng(seed);
  const sum = {}, cnt = {}, moons = {};
  for (let n = 0; n < hands; n++) {
    const g = H.newGame({ target: 1e9 });
    g.handNo = n; // rotate passing direction
    H.deal(g, rnd);
    const shift = n % 4;
    const lv = [0, 1, 2, 3].map((s) => levels[(s + shift) % 4]);
    if (g.hand.phase === "pass") for (let s = 0; s < 4; s++) H.submitPass(g, s, AI.choosePass(g.hand.hands[s], lv[s], rnd));
    while (g.hand.phase === "play") {
      const s = g.hand.turn;
      H.play(g, s, AI.chooseMove(g.hand, s, lv[s], rnd, g.opts));
    }
    const pts = g.hand.result.pts;
    for (let s = 0; s < 4; s++) {
      sum[lv[s]] = (sum[lv[s]] || 0) + pts[s];
      cnt[lv[s]] = (cnt[lv[s]] || 0) + 1;
    }
    if (g.hand.result.moonBy >= 0) moons[lv[g.hand.result.moonBy]] = (moons[lv[g.hand.result.moonBy]] || 0) + 1;
  }
  return { sum, cnt, moons };
}

if (isMainThread) {
  const hands = +process.argv[2] || 1000;
  const levels = (process.argv[3] || "hard,medium,medium,medium").split(",");
  const seed = +process.argv[4] || 1;
  const workers = +process.argv[5] || 10;
  const per = Math.ceil(hands / workers);
  const t0 = Date.now();
  let done = 0;
  const tot = { sum: {}, cnt: {}, moons: {} };
  for (let w = 0; w < workers; w++) {
    const wk = new Worker(__filename, { workerData: { hands: per, levels, seed: seed * 1000 + w } });
    wk.on("message", (r) => {
      for (const k of ["sum", "cnt", "moons"]) for (const l in r[k]) tot[k][l] = (tot[k][l] || 0) + r[k][l];
      if (++done === workers) {
        const out = {};
        for (const l in tot.cnt) out[l] = { avgPerHand: +(tot.sum[l] / tot.cnt[l]).toFixed(3), seatHands: tot.cnt[l], moons: tot.moons[l] || 0 };
        console.log(JSON.stringify({ hands: per * workers, levels, seconds: (Date.now() - t0) / 1000, result: out }, null, 1));
      }
    });
    wk.on("error", (e) => { console.error(e); process.exit(1); });
  }
} else {
  parentPort.postMessage(runChunk(workerData));
}
