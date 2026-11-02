# Ratings

The hardest problem in the project. Basketball GM has an algorithm that turns real stats into ratings, so every real player has believable ratings, even a bench guy who played 40 minutes. Football GM had nothing like it, and football is harder: a guard has no stats at all, a 1970s quarterback completing 50% was good, and some players have five career tackles.

The approach splits the question in two.

## 1. How good was he? (overall)

1. **Approximate Value per game**, ranked against everyone at his position that season. Per game, so an injured star isn't rated like a backup.
2. **Smoothed** with the seasons around it, so one fluke year doesn't swing a career.
3. **Honors set a minimum:** MVP puts a player at the 99.8th percentile or higher, Player of the Year 99.5th, first-team All-Pro 99th, second team 97.5th, Pro Bowl 95th.
4. **The percentile goes through a curve** that leaves room at the top:

| Percentile | 0 | 20 | 50 | 75 | 90 | 96 | 98.5 | 99.5 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| Overall | 28 | 38 | 47 | 56 | 65 | 72 | 78 | 83 | 88 |

Stars land in the 80s, like Football GM's own leagues. Nobody is a 99.

## 2. What kind of player was he? (skills)

Each skill comes from the stats that show it, measured against his era, not today:

| Position | Stats → skills |
|---|---|
| QB | completion % → accuracy, yards per attempt → arm, TD/INT rate → vision |
| RB | yards per carry → speed and elusiveness, fumbles → ball security |
| WR / TE | catch rate and catches per game → hands and route running, yards per catch → speed |
| DB | interceptions and passes defended → coverage |
| Front 7 | sacks → pass rush, tackles → tackling and run stopping |

Each stat becomes a z-score within its era and position, then **9 rating points per standard deviation** around the position's typical player. Heights are real, and strength follows real weight.

## 3. Make them agree

The skills shift together until the player's Football GM overall equals the target from step 1. The shape (a fast back who fumbles) comes from his stats; the level comes from AV.

## Players with thin stats

Linemen and short careers fall back on AV rank alone, with skills in their position's typical shape. A player who was on rosters but never played gets a low rating, not a missing one.

## Why not Madden ratings?

They only go back to 2001, they rate a different game, and stitching two systems together leaves a seam at 2001. One method for every season keeps 1975 and 2015 comparable.

## In the game

With the mod, ratings keep following real careers after you start: Real Player Determinism (RPD) blends each year's development toward the player's real ratings for that season, from 0 (Football GM's own random development) to 1 (exactly real).

Code: [`src/rebuild_ratings.js`](../src/rebuild_ratings.js)
