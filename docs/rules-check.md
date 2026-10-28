# Rules check: Hearts and Spades (2026-10-19)

Every rule the engines use, checked against two sources each. Where they disagree, the table says
which one we use by default and which Settings switch gives the other one.

**Sources**
- **P-H** Pagat, Hearts: https://www.pagat.com/reverse/hearts.html
- **B-H** Bicycle, How to play Hearts: https://bicyclecards.com/how-to-play/hearts
- **P-S** Pagat, Spades: https://www.pagat.com/auctionwhist/spades.html
- **B-S** Bicycle, How to play Spades: https://bicyclecards.com/how-to-play/spades

Test files: `tests/hearts.test.js`, `tests/spades.test.js` (rules and counts), `tests/odds.test.js`
(the odds maths), `tests/online.test.mjs` (online adapters, secrecy). Each test was seen failing against a
deliberately broken engine before it passed.

## Hearts

| Rule | P-H | B-H | We use | Test |
|---|---|---|---|---|
| 4 players, 52 cards, 13 each | yes | yes | yes | "deck: 52 distinct cards…" + random full games |
| Pass 3 cards: left, right, across, keep, repeat | yes | yes | default; Settings: L·R·A, Left only, None | "pass cycle…", "pass variants…" |
| You pick your pass before seeing what you receive | yes | yes | yes (passes hidden until all 4 are in) | "view() hides other players' passes…" |
| 2♣ leads the first trick | yes | yes | yes | "the 2 of clubs leads…" |
| Follow suit if you can; highest of the suit led wins | yes | yes | yes | "trick winner…" |
| No hearts or Q♠ on the first trick | **variation** | rule | rule on by default; Settings "Points on first trick" turns it off | "first trick: …" (2 tests) |
| First trick, hand of only points: a heart may be played (not the Q♠ unless nothing else) | yes | — | yes | "first trick: a hand of only point cards…" |
| Hearts can't be led until broken, unless you hold only hearts | yes | yes | yes | "hearts can't be led…" (2 tests) |
| Q♠ breaks hearts | **no** (variation) | **yes** | off by default; Settings "Queen breaks hearts" | "queen of spades breaks hearts only with the variant on" |
| Each heart 1, Q♠ 13 (26 a hand) | yes | yes | yes | "points: 13 hearts at 1 + queen at 13 = 26", random games sum to 26 |
| Shoot the moon: others +26 | yes | yes | default | "moon: …" |
| Moon: shooter −26 instead | variation | variation | Settings "Moon −26 me" | "moon: …" |
| Moon: shooter's choice | variation | — | Settings "Choice" (takes −26 when +26 would lose them the game) | "moon 'choice' …" |
| J♦ −10 | variation | variation (Omnibus) | Settings switch | "jack of diamonds variant…" |
| Game ends when someone reaches 100; lowest wins | yes | yes | yes; Settings: 50 / 75 / 150 | "game ends at the target…" |
| Tie for lowest at the end | play on until one is lowest | not stated | play on | same test |
| 3 players: remove 2♦ (17 each) | yes | yes | yes vs computers (start panel "3 players"); offline only | variants: "3 players…" |
| 5 players: remove 2♦ and 2♣ (10 each); 3♣ leads | yes | remove 2♣ only | Pagat; offline only | variants: "5 players…" |
| 3 or 5 players pass left, right, keep (no "across") | yes | — | yes | variants: "pass cycles…" |
| Black Maria: Q♠ 13, K♠ 10, A♠ 7, hearts 1 (43) | yes (Pagat Black Maria) | — | Settings "Point cards" | variants: "Black Maria…" |
| Spot Hearts: hearts at face value (A 14), Q♠ 25 (129) | yes (Pagat Spot Hearts) | — | Settings "Point cards"; moon = all 129 | variants: "Spot Hearts…" |

## Spades

| Rule | P-S | B-S | We use | Test |
|---|---|---|---|---|
| 4 players, partners across, 13 cards each | yes | yes | yes | random full games |
| Deal and bidding move left; left of dealer bids first and leads | yes | yes | yes | "bidding starts left of the dealer…" |
| First lead: any card except a spade | yes | yes (spades not yet broken) | yes (follows from the broken rule); Settings "First lead 2♣" as a house variant | "spades can't be led until broken…" |
| Bids 0 (nil) to 13, one round | yes | yes | yes | "nil can be switched off…" |
| Spades are always trump | yes | yes | yes | "trick winner: any spade beats…" |
| Must follow suit; void may trump or discard | yes | yes | yes | "must follow suit; void may trump" |
| Spades can't be led until broken (or only spades left) | yes | yes | default; Settings "Any time" | "spades can't be led until broken…" |
| Made bid: 10 a trick bid + 1 a bag | yes | yes | yes | "score: bid 4+3=7…" |
| Set: −10 a trick bid | yes | **0** for the hand (−10 a trick in some groups) | Pagat | "score: set…" |
| 10 bags = −100, extra bags carry | yes | listed as a variant | default; Settings "None" | "bags: reaching 10…" |
| Nil: +100 made, −100 failed | yes | yes | yes | "score: nil made…", "nil failed…" |
| Nil bidder's tricks don't count for partner; they're bags | yes | not stated | default; Settings "Nil tricks help partner" | "nil bidder's tricks don't rescue…", "variant…" |
| Blind nil ±200, only when 100+ behind | yes | yes (no exchange stated) | Settings switch, off by default; "only when behind" switch | "nil can be switched off; blind nil only when…" |
| Blind nil swap: bidder gives partner 2, partner gives 2 back | yes (bidder first) | — | yes | "blind nil: bidder gives partner 2…" |
| Game to 500; both over → higher wins; tie plays on | yes | yes | yes; Settings 200 / 300 | "game end: both teams past 500…" |
| Lose at −200 / −500 | variation | — | Settings "Lose at" | "lose-at variant…" |

| Whiz: bid your number of spades, or nil | yes (Pagat variant) | — | Settings "Bidding" | variants: "Spades Whiz…" |
| Mirror: bid exactly your number of spades (no blind nil) | yes (Pagat variant) | — | Settings "Bidding" | variants: "Spades Mirror…", "blind nil follows…" |
| Suicide: one partner bids nil, the other 4+ | yes (Pagat variant) | — | Settings "Bidding" | variants: "Spades Suicide…", "blind nil follows…" |

| Jokers: 2♣ and 2♥ out, Big Joker > Little Joker as top spades (count as spades) | yes (Barmore's rules; NYC drops 2♣/2♥ too) | — | Settings "Jokers", off | house: "jokers: …" (3 tests) |
| Deuces high: 2♠ above the A♠ (below jokers) | yes (Barmore: BJ, LJ, 2♠, A♠) | — | Settings "2♠ high", off | house: "deuces high…" |
| Team minimum 4: second partner makes up the rest; nil only over a partner's 4+ | yes ("some play") | — | Settings "Team minimum", off; standard bidding only | house: "minimum team bid…" (2 tests) |

Cards 52 / 53 / 54 stand for Little Joker / Big Joker / the high 2♠ (ranks 14 / 15 / 13), so every
"higher rank wins" comparison works unchanged; `Spades.deckFor(opts)` gives the 52 cards in play.

Not built (listed by Pagat as regional variants): 10-for-200 bids, Boston (13 tricks = 200 or 500),
NYC jokers with the 2♦ high, a 5-bag penalty (not on Pagat), 2- and 3-player Spades, Cutthroat (3 players, no partners).
Online rooms stay standard (net-games passes only the known option keys, so jokers/2♠ high/team minimum stay offline).
Online rooms stay 4-player standard Hearts (net-games passes only the known option keys).

## Status
All rows above with a test name pass: `node tests/hearts.test.js` (20), `node tests/spades.test.js` (22),
`node tests/odds.test.js` (7), `node tests/variants.test.js` (14), `node tests/online.test.mjs` (6), run 2026-10-27;
`node tests/house.test.js` (9) added 2026-10-28.
