# How strong are the computer players? (measured 2026-10-19)

## Hearts — average points per hand against three Medium players (lower is better)
Seats rotate every hand; passing direction cycles. `node tools/sim-hearts.js <hands> <levels> <seed> <workers>`.

| Level | Avg pts/hand | Hands | Command |
|---|---|---|---|
| Easy | 12.51 | 8,000 | `sim-hearts.js 8000 easy,medium,medium,medium 11 10` |
| Medium | 6.69 | 32,000 seat-hands | `sim-hearts.js 8000 medium,medium,medium,medium 12 10` |
| Hard (40 samples/move) | 5.62 | 2,002 | `sim-hearts.js 2000 hard,medium,medium,medium 13 11` (88 s) |

6.5 would be an even share; all-Medium averages 6.69 because a moon puts 78 points on the table.
In the Hard run its Medium opponents averaged 7.38.

## Spades — games to 500 won by a team of this level vs a Medium team
Teams swap seats every game. `node tools/sim-spades.js <games> <A> <B> <seed> <workers>`.

| Level | Games won | Games | Avg pts/hand (vs opp) | Set rate |
|---|---|---|---|---|
| Easy | 11.0% | 2,000 | 30.1 vs 51.3 | 16.8% |
| Medium | 50.2% | 2,000 | 52.7 vs 52.8 | 5.1% |
| Hard (30 samples/move, 120 bid sims) | 90.9% | 308 | 69.7 vs 40.4 | 9.2% |

Raw output: `docs/strength-raw.txt`.
