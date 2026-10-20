// Measure Spades computer strength by self-play: team A (levels a) vs team B (levels b).
// node tools/sim-spades.js <games> <levelA> <levelB> [seed] [workers] [optsJSON]
// Teams swap seats every game. Prints game win rate for A and average points per hand.
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const path = require("path");

function runChunk({ games, A, B, seed, opts }) {
  const C = require(path.join(__dirname, "../js/cards.js"));
  const S = require(path.join(__dirname, "../js/spades.js"));
  const AI = require(path.join(__dirname, "../js/spades-ai.js"));
  const rnd = C.makeRng(seed);
  let winsA = 0, handsN = 0, ptsA = 0, ptsB = 0, nilA = 0, nilAok = 0, setsA = 0, bidsA = 0;
  for (let n = 0; n < games; n++) {
    const aTeam = n % 2;              // which team index A plays
    const lv = [0, 1, 2, 3].map((s) => (S.team(s) === aTeam ? A : B));
    const g = S.newGame(opts);
    g.dealer = n % 4;
    let guard = 0;
    while (!g.over && guard++ < 200) {
      S.deal(g, rnd);
      while (g.hand.phase === "bid") { const s = g.hand.bidTurn; S.submitBid(g, s, AI.chooseBid(g, s, lv[s], rnd), false); }
      while (g.hand.phase === "exchange") { const x = g.hand.exchange; const s = x.step === "nil" ? x.nilSeat : (x.nilSeat + 2) % 4; S.submitExchange(g, s, AI.chooseExchange(g.hand.hands[s], s === x.nilSeat)); }
      const h = g.hand;
      while (h.phase === "play") { const s = h.turn; S.play(g, s, AI.chooseMove(g, s, lv[s], rnd)); }
      handsN++;
      ptsA += h.result[aTeam].points; ptsB += h.result[1 - aTeam].points;
      for (const s of [aTeam, aTeam + 2]) { if (h.bids[s] === 0) { nilA++; if (h.tricks[s] === 0) nilAok++; } }
      const contract = [aTeam, aTeam + 2].reduce((x, s) => x + (h.bids[s] || 0), 0);
      const made = [aTeam, aTeam + 2].reduce((x, s) => x + (h.bids[s] ? h.tricks[s] : 0), 0);
      if (contract > 0) { bidsA++; if (made < contract) setsA++; }
    }
    if (g.winner === aTeam) winsA++;
  }
  return { games, winsA, handsN, ptsA, ptsB, nilA, nilAok, setsA, bidsA };
}

if (isMainThread) {
  const games = +process.argv[2] || 200;
  const A = process.argv[3] || "hard", B = process.argv[4] || "medium";
  const seed = +process.argv[5] || 1;
  const workers = +process.argv[6] || 10;
  const opts = process.argv[7] ? JSON.parse(process.argv[7]) : {};
  const per = Math.ceil(games / workers);
  const t0 = Date.now();
  const tot = {}; let done = 0;
  for (let w = 0; w < workers; w++) {
    const wk = new Worker(__filename, { workerData: { games: per, A, B, seed: seed * 1000 + w, opts } });
    wk.on("message", (r) => {
      for (const k in r) tot[k] = (tot[k] || 0) + r[k];
      if (++done === workers) {
        console.log(JSON.stringify({ A, B, games: tot.games, hands: tot.handsN, seconds: (Date.now() - t0) / 1000,
          winRateA: +(tot.winsA / tot.games).toFixed(3), avgPerHandA: +(tot.ptsA / tot.handsN).toFixed(1), avgPerHandB: +(tot.ptsB / tot.handsN).toFixed(1),
          nilA: tot.nilA, nilMadeA: tot.nilA ? +(tot.nilAok / tot.nilA).toFixed(2) : null, setRateA: +(tot.setsA / tot.bidsA).toFixed(3) }));
      }
    });
    wk.on("error", (e) => { console.error(e); process.exit(1); });
  }
} else parentPort.postMessage(runChunk(workerData));
