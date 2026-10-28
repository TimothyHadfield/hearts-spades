/* coach-hs.js — Hearts & Spades' part of the shared coach kit (js/coach.js, never edit that one here):
 * the rules sheets and the guided first game of Hearts.
 *   HSCoach.SEED          the guided game's deals (same cards every time)
 *   HSCoach.steps(ctx)    ctx: { state() -> the Hearts table's state or null }
 *   HSCoach.rules(game)   COACH.rules() options for "hearts" or "spades" */
(function (root) {
  "use strict";
  const SEED = 2207;
  const ID = "hearts-first";

  function steps(ctx) {
    const st = () => ctx.state();
    const h = () => { const s = st(); return s && s.game && s.game.hand; };
    const phase = () => { const x = h(); return x ? x.phase : ""; };
    const mine = () => { const s = st(), x = h(); return !!x && x.phase === "play" && x.turn === 0 && !s.busy; };
    const trickNo = () => { const x = h(); return x ? x.trickNo : 0; };
    return [
      { title: "Your first game of Hearts", text: "You against three Easy computers. Points are bad: every heart is 1 and the queen of spades is 13. The lowest score wins. I'll walk you through the first hand." },
      { target: ".hand-wrap", title: "Pass three cards", html: "Before each hand you pass 3 cards. Pass your most dangerous cards: the <b>Q♠ K♠ A♠</b> and high hearts. Tap 3 cards, then <b>Pass</b>.", when: () => phase() === "pass", until: () => { const x = h(); return !!x && (x.phase !== "pass" || !!x.passes[0]); }, skipIf: () => phase() !== "pass" },
      { target: ".hand-wrap", title: "Cards you got", text: "The cards with a blue outline came from the player on your right.", when: () => phase() === "play", skipIf: () => trickNo() > 0 },
      { target: ".hand-wrap", title: "Follow suit", html: "The <b>2♣</b> always leads the first trick. Play a card of the suit that was led if you can; bright cards are the ones you may play. Tap a card, then tap it again to play it.", when: mine, until: () => trickNo() >= 1, skipIf: () => trickNo() >= 1 },
      { target: ".felt", title: "Who takes the trick", text: "The highest card of the suit that was led wins all the cards in the trick, points and all, and leads next.", when: () => trickNo() >= 1, skipIf: () => trickNo() >= 3 },
      { target: [".strip", ".prompt"], title: "Stay low", html: "Play under the winning card when you can, so someone else takes the points. The strip shows how many cards of each suit are still out. Hearts can't be led until one has been played.", when: () => trickNo() >= 1 && mine(), until: () => trickNo() >= 3, skipIf: () => trickNo() >= 3 },
      { target: ".hint-btn", title: "Stuck?", html: "<b>Hint</b> shows the points each card is likely to cost you. <b>Undo</b> takes a card back. Either one makes that game count as \"with help\" in your stats.", when: () => trickNo() >= 3 },
      { title: "Shoot the moon", html: "If one player takes <b>all 26 points</b> in a hand, everyone else gets 26 instead. Play the hand out, then tap <b>Next hand</b>.", when: () => trickNo() >= 3 },
      { title: "You've got it", html: "Keep playing this game to 100. The full rules are in <b>Settings</b> → Rules, and <b>My stats</b> on the start screen keeps your record." },
    ];
  }

  // Learn links (checked with YouTube's oEmbed on 2026-10-28: each returned its title). Open in a new tab.
  const videos = (list) => `<ul class="vids">${list.map(([id, t, ch]) =>
    `<li><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">${t}</a> <span class="muted">· ${ch} (YouTube)</span></li>`).join("")}</ul>`;

  const HEARTS = {
    title: "How to play Hearts",
    sections: [
      { id: "goal", short: "Goal", title: "Goal", html: `<p>Take as few points as you can. Every <b>heart</b> is 1 point and the <b>queen of spades</b> is 13. When someone reaches the target score (100), the <b>lowest score wins</b>. A tie for lowest plays another hand.</p>` },
      { id: "pass", short: "Pass", title: "Deal and pass", html: `<ul><li>4 players get 13 cards each.</li><li>Before play, everyone passes 3 cards: <b>left</b>, then <b>right</b>, then <b>across</b>, then no pass; and again.</li>
        <li>Pass the cards that could cost you points: the Q♠, the K♠ and A♠, and high hearts.</li></ul>` },
      { id: "play", short: "Play", title: "Playing a trick", html: `<ul><li>The <b>2♣</b> leads the first trick.</li><li>Follow suit if you can. If you can't, play anything.</li>
        <li>The highest card of the suit that was led wins the trick and leads next. There are no trumps.</li>
        <li>On the first trick you can't play a heart or the Q♠ unless that's all you have.</li>
        <li>Hearts can't be led until a heart has been played, unless you hold only hearts.</li></ul>` },
      { id: "moon", short: "Moon", title: "Shooting the moon", html: `<p>Take <b>all 26 points</b> in one hand (every heart and the Q♠) and everyone else gets 26 instead of you.</p>
        <p class="tip">Watch for a player who keeps taking hearts: the moon warning shows the chance they make it.</p>` },
      { id: "players", short: "3 or 5", title: "3 or 5 players", html: `<ul><li><b>3 players</b>: the 2♦ is taken out, 17 cards each.</li><li><b>5 players</b>: the 2♣ and 2♦ are taken out, 10 cards each, and the <b>3♣</b> leads.</li>
        <li>With 3 or 5 players the pass goes left, right, then no pass.</li></ul>` },
      { id: "variants", short: "Variants", title: "Variants (Settings)", html: `<ul><li><b>Black Maria</b>: the K♠ is 10 and the A♠ 7 as well as the Q♠ 13 (43 points in all).</li>
        <li><b>Spot Hearts</b>: each heart is worth its number (A = 14) and the Q♠ is 25 (129 in all).</li>
        <li>Moon: +26 to the others, −26 to you, or your choice. J♦ −10. The queen breaks hearts. Points on the first trick. Game to 50, 75, 100 or 150.</li></ul>` },
      { id: "videos", short: "Videos", title: "Videos", html: videos([
        ["N9zm_oveszc", "How to play Hearts", "Riffle Shuffle & Roll"],
        ["FFm3LiN8QqM", "Hearts for beginners", "Puzzling Games"],
        ["y_ew08d_znA", "Walk-through with tips", "Play-In Games"],
        ["SxS9KnwstRs", "Shooting the moon, a full hand", "Play-In Games"],
      ]) },
    ],
  };

  const SPADES = {
    title: "How to play Spades",
    sections: [
      { id: "goal", short: "Goal", title: "Goal", html: `<p>Two teams of two; partners sit across. Bid how many tricks your team will take, then take at least that many. The first team to the target score (500) wins; if both pass it on the same hand, the higher score wins.</p>` },
      { id: "bid", short: "Bid", title: "Bidding", html: `<ul><li>13 cards each; the deal moves left each hand.</li><li>Starting left of the dealer, each player bids once: how many tricks they expect to take.</li>
        <li>Your team's bid is the two bids added together. <b>Nil</b> = you bet you'll take none.</li></ul>` },
      { id: "play", short: "Play", title: "Playing a trick", html: `<ul><li>The player left of the dealer leads.</li><li>Follow suit if you can. <b>Spades always trump</b>: the highest spade wins, otherwise the highest card of the suit led.</li>
        <li>Spades can't be led until one has been played (broken), unless you hold only spades.</li></ul>` },
      { id: "score", short: "Score", title: "Scoring", html: `<ul><li>Make your team's bid: <b>10 points a trick bid</b>, plus 1 for each extra trick (a <b>bag</b>).</li>
        <li>Miss it: <b>−10 a trick bid</b>.</li><li>Every 10 bags: −100.</li></ul>` },
      { id: "nil", short: "Nil", title: "Nil and blind nil", html: `<ul><li><b>Nil</b>: +100 if you take no tricks, −100 if you take any. A nil bidder's tricks don't help the partner; they're bags.</li>
        <li><b>Blind nil</b> (optional): bid nil before you look, for ±200, usually only when 100 or more behind. You and your partner then swap 2 cards.</li></ul>` },
      { id: "variants", short: "Variants", title: "Bidding variants (Settings)", html: `<ul><li><b>Whiz</b>: bid exactly the number of spades you hold, or nil.</li>
        <li><b>Mirror</b>: bid exactly the number of spades you hold.</li>
        <li><b>Suicide</b>: one partner must bid nil and the other at least 4.</li></ul>
        <p>House rules: <b>Jokers</b> (the 2♣ and 2♥ come out; Big Joker and Little Joker become the top two spades), <b>2♠ high</b> (above the A♠), <b>team minimum 4</b>, spades led any time, 2♣ leads, no bag penalty, lose at −200, game to 200 or 300.</p>` },
      { id: "videos", short: "Videos", title: "Videos", html: videos([
        ["ca13SHejtDE", "How to play Spades in 10 minutes", "How Games Work"],
        ["tZkOB2kABZU", "Rules and gameplay", "Spielregeln TV"],
        ["RFXtM4LORes", "Rules, strategy and tips", "Play-In Games"],
        ["FwoqgumJw1A", "Bidding strategy 101", "Trickster Cards"],
      ]) },
    ],
  };

  const rules = (game) => (game === "spades" ? SPADES : HEARTS);

  const api = { SEED, ID, steps, rules };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HSCoach = api;
})(typeof window !== "undefined" ? window : globalThis);
