# Results

The test: start in 1966, sim to today with the mod on, and compare with real history. Sims run in Football GM on a phone, about 30 minutes for 60 seasons. `src/analyze_sim.js` produces every number below from a sim export.

## Latest full sim (sim 8)

### League stats by decade (sim / real)

| Decade | Completion % | Yds/att | INT % | Sack % | Yds/carry | Pass share | Pts/game |
|---|---|---|---|---|---|---|---|
| 1960s | 50.8 / 50.2 | 6.11 / 6.20 | 5.59 / 5.45 | 8.03 / 7.87 | 4.07 / 3.97 | 47.1 / 48.5 | 18.8 / 21.6 |
| 1970s | 51.9 / 52.2 | 5.97 / 5.95 | 5.38 / 5.25 | 7.50 / 7.74 | 4.10 / 3.98 | 43.0 / 43.0 | 17.9 / 19.2 |
| 1980s | 55.6 / 55.5 | 6.46 / 6.43 | 4.04 / 4.17 | 6.40 / 5.96 | 4.08 / 3.99 | 50.1 / 50.7 | 19.9 / 20.7 |
| 1990s | 57.0 / 57.3 | 6.32 / 6.36 | 3.38 / 3.33 | 6.98 / 6.84 | 4.04 / 3.93 | 53.3 / 53.8 | 19.3 / 20.2 |
| 2000s | 59.6 / 59.8 | 6.82 / 6.83 | 3.06 / 3.14 | 6.61 / 6.45 | 4.23 / 4.13 | 53.9 / 54.0 | 21.1 / 21.2 |
| 2010s | 62.5 / 62.2 | 7.10 / 7.16 | 2.62 / 2.55 | 6.34 / 6.34 | 4.31 / 4.22 | 56.1 / 56.6 | 22.3 / 22.6 |
| 2020s | 63.8 / 64.7 | 7.03 / 7.09 | 2.46 / 2.26 | 6.83 / 6.62 | 4.46 / 4.37 | 55.0 / 55.5 | 22.1 / 22.9 |

### Team records

Simmed win % correlates with the real records at **0.66** across 1,770 team-seasons.

### Careers (sim total as % of real; each position's 60 biggest real careers)

| Position | Stat | Median | Middle half |
|---|---|---|---|
| QB | passing yards | **97%** | 85–106% |
| RB | rushing yards | **99%** | 82–110% |
| WR | receiving yards | 85% | 78–94% |
| TE | receiving yards | 91% | 79–108% |
| LB | tackles | 93% | 86–101% |
| CB | interceptions | 91% | 77–109% |
| S | interceptions | 82% | 66–97% |
| DL | sacks | 70% | 60–87% |

Running backs went from 71–86% in the previous sim to 99% after the lead-back change.

## Where it's still off

- **Scoring runs a little low,** most in the 1960s–70s: drives stall into field goals more than they did.
- **Star pass rushers and receivers** get less of their real totals. The overall shares are right, but the sim spreads them more evenly than real stars hogged them.
- **Running backs catch too little:** about 8% of receiving yards against a real 14%.

## Getting closer over time

Every full-history sim gets run through `src/analyze_sim.js`, and the biggest misses get fixed in the next version: era calibration refines itself from each sim, and workload tweaks get checked on a benched season first. Sim 7 to sim 8 took running backs from 71–86% to 99%. Receivers, pass rushers and early-era scoring are next.

A game sim is random, so even rerunning the same season moves these numbers a few points. The goal is history that feels right season after season, not a replay to the yard.
