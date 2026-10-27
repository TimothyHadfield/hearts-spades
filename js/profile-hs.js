/* profile-hs.js — Hearts & Spades' part of the player profile (shared kit: js/profile.js, never edit that one here):
 * each game's computer ratings, achievements, Daily game and turning a finished game into a result.
 * Hearts and Spades keep separate stats ("profile:hearts", "profile:spades"); use(game) switches the kit over.
 *
 * What counts as one game: a whole game to the target score. Leaving a game before the end (New game)
 * counts as a loss. A game where you used Hint, Undo or Replay counts as "with help" and isn't rated. */
(function (root) {
  "use strict";
  // Elo of each level from whole games between the levels (tools/sim-hearts-games.js and tools/sim-spades.js,
  // 2026-10-27): difference = 400·log10(p / (1 − p)), rounded to 10. Easy anchored at 1200.
  //   Hearts, 4 players, 2 v 2 seats: Medium 98.3% of games vs Easy (+700), Hard 71.5% vs Medium (+160).
  //   Spades, team v team: Medium 87.5% vs Easy (+340), Hard 90.2% vs Medium (+390).
  const LEVELS = {
    hearts: [{ id: "easy", name: "Easy", rating: 1200 }, { id: "medium", name: "Medium", rating: 1900 }, { id: "hard", name: "Hard", rating: 2060 }],
    spades: [{ id: "easy", name: "Easy", rating: 1200 }, { id: "medium", name: "Medium", rating: 1540 }, { id: "hard", name: "Hard", rating: 1930 }],
  };
  const RANK = { easy: 0, medium: 1, hard: 2 };
  const won = (c) => !!(c.last && c.last.won);
  const ex = (c) => (c.last && c.last.extra) || {};
  const ACH = {
    hearts: [
      { id: "first", title: "First win", desc: "Win a game of Hearts", test: (c) => c.stats.wins >= 1 },
      { id: "medium", title: "Getting good", desc: "Win against Medium", test: (c) => won(c) && RANK[c.last.level] >= 1 },
      { id: "hard", title: "Shark", desc: "Win against Hard", test: (c) => won(c) && c.last.level === "hard" },
      { id: "moon", title: "Shoot the moon", desc: "Take every point card in one hand", test: (c) => ex(c).moons >= 1 },
      { id: "clean", title: "Clean sheet", desc: "Win a game with under 20 points", test: (c) => won(c) && ex(c).score < 20 },
      { id: "three", title: "Three at the table", desc: "Win a 3-player game", test: (c) => won(c) && ex(c).players === 3 },
      { id: "five", title: "Full table", desc: "Win a 5-player game", test: (c) => won(c) && ex(c).players === 5 },
      { id: "maria", title: "Black Maria", desc: "Win with Black Maria or Spot Hearts points", test: (c) => won(c) && ex(c).points && ex(c).points !== "standard" },
      { id: "streak", title: "Hat trick", desc: "Win 3 in a row", test: (c) => c.stats.bestStreak >= 3 },
      { id: "daily", title: "Daily player", desc: "3-day Daily streak", test: (c) => c.daily.streak >= 3 },
    ],
    spades: [
      { id: "first", title: "First win", desc: "Win a game of Spades", test: (c) => c.stats.wins >= 1 },
      { id: "medium", title: "Getting good", desc: "Win against Medium", test: (c) => won(c) && RANK[c.last.level] >= 1 },
      { id: "hard", title: "Shark", desc: "Win against Hard", test: (c) => won(c) && c.last.level === "hard" },
      { id: "nil", title: "Nil made", desc: "Bid nil and take no tricks", test: (c) => ex(c).nils >= 1 },
      { id: "blind", title: "Blind nil", desc: "Make a blind nil", test: (c) => ex(c).blindNils >= 1 },
      { id: "rout", title: "Rout", desc: "Win by 200 or more", test: (c) => won(c) && ex(c).margin >= 200 },
      { id: "variant", title: "Odd bids", desc: "Win with Whiz, Mirror or Suicide bidding", test: (c) => won(c) && ex(c).bidding && ex(c).bidding !== "standard" },
      { id: "streak", title: "Hat trick", desc: "Win 3 in a row", test: (c) => c.stats.bestStreak >= 3 },
      { id: "daily", title: "Daily player", desc: "3-day Daily streak", test: (c) => c.daily.streak >= 3 },
    ],
  };

  // Today's Daily game: the same deals for everyone that day. Standard rules, Medium computers, a short game.
  const DAILY = {
    hearts: { level: "medium", opts: { target: 50, moon: "add", jack: false, queenBreaks: false, bleed: false, passing: "cycle4", players: 4, points: "standard" } },
    spades: { level: "medium", opts: { target: 200 } },
  };

  let active = null;
  /** Point the profile kit at this game's stats (Hearts and Spades are kept apart). */
  function use(game, onPlay) {
    if (!root.Profile) return false;
    if (active === game) return true;
    active = game;
    root.Profile.init({
      game, levels: LEVELS[game], achievements: ACH[game],
      modes: { computer: { name: "vs computer" }, help: { name: "With help" } },
      daily: { title: "Daily game", onPlay: () => onPlay && onPlay() },
    });
    return true;
  }

  /** The finished (or abandoned) game -> Profile.recordResult input.
   *  Hearts g: { game: "hearts", over, winners, me, scores, level, helped, daily, players, points, moons }
   *  Spades g: { game: "spades", over, winner, us, scores, level, helped, daily, nils, blindNils, bidding } */
  function result(g) {
    const mode = g.helped ? "help" : "computer";
    let w = false, draw = false, score = 0, extra = {};
    if (g.game === "hearts") {
      const mine = g.scores[g.me];
      if (g.over) {
        w = g.winners.includes(g.me);
        if (w && g.winners.length > 1) { draw = true; w = false; }
      }
      score = mine;
      extra = { players: g.players, points: g.points || "standard", moons: g.moons || 0, score: mine };
    } else {
      const them = 1 - g.us;
      if (g.over) w = g.winner === g.us;
      score = g.scores[g.us];
      extra = { margin: g.scores[g.us] - g.scores[them], nils: g.nils || 0, blindNils: g.blindNils || 0, bidding: g.bidding || "standard" };
    }
    if (!g.over) extra.quit = true;
    return { mode, level: mode === "computer" ? g.level : null, won: w, draw, score, daily: !!g.daily, extra };
  }

  const api = { LEVELS, ACH, DAILY, RANK, use, result };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HSProfile = api;
})(typeof window !== "undefined" ? window : globalThis);
