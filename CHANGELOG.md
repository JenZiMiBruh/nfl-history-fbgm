# What's new

Every fix and feature, newest first. If something below fixed a problem you hit, download the file again and start a new league: existing leagues keep the data they started with.

Found something off? [Open an issue](https://github.com/JenZiMiBruh/nfl-history-fbgm/issues) or comment on the Reddit post.

---

## v1.1 · Nov 2, 2026

### Ratings fixes (thanks, r/Football_GM)

Your reports found real bugs. All fixed:

- **Stars rated around 49** (Chris Olave, Ja'Marr Chase, Jonathan Taylor, most receivers). The stat feed for 2025-26 had wrong "games started" counts, and a rule meant for special-teamers capped stars instead. Starts now come from real snap counts. Olave 77, Chase 76, Taylor 77 and the Colts' RB1, Lamb and Pickens 76.
- **Every quarterback had the same athleticism.** QB speed never actually came from running. Now it does, based on his career: Lamar Jackson 77 speed, Jayden Daniels 72, Jalen Hurts 67, Josh Allen 64; Matthew Stafford, Jared Goff and Kirk Cousins in the low 30s.
- **Backups starting over real starters** (D.J. Uiagalelei over Justin Herbert). The 2025 value scores were missing; they're estimated from real stats now, and every team's real starting QB starts (32 of 32).
- **Players rated at the wrong position**, like Jimmy Smith (Jaguars receiver) as a cornerback, Bob Hayes as a defensive lineman, a punter as a quarterback. Each is rated where he really played.
- **Returners rated as stars at their listed position** (Devin Hester as a CB). Return honors no longer make someone a star cornerback; a fullback's Pro Bowls no longer make him a star running back.
- **Injured stars rated like backups** (Tom Brady 2008). A short season now leans on his previous season, never on later ones.
- A new ratings audit runs before every release, with a check for each of these.

### Phones

- **Building a past season no longer crashes phones.** The history file is 16 MB instead of 88 MB, with nothing lost: leagues come out identical.
- **Phone-friendly option** (on by default on phones): a smaller league that keeps every current player, recent retirees, Hall of Famers and award winners.
- **Phone-friendly live file**: 13 MB instead of 87.

### New

- **Start any season at any week.** Earlier weeks are already played from the real games: standings, results, head-to-head, team stats. From 1999 on, every player's real stats game by game; before 1999, his stats so far are estimated from his real season.
- **Head-to-head records** for every season since 1966, and this season's **box scores** with score by quarter.
- **Real-roster leagues stay real:** AI teams no longer trade real players off their real teams or sign players who weren't really theirs.
- **Real schedules go back to 1966**, all 14,000+ games (they always did; the site said 1978).
- **Logo fixes:** the 2026 Titans Shield and Rams logos now show in the current season; see-through Seahawks, Dolphins, Bengals and Broncos logos filled in.
- **Site:** new look, team search and switcher, redesigned uniform cards, roadmap with every update date, direct downloads, a few Cardinals Easter eggs.

## v1.0 · Nov 1, 2026

- **v1.0 released:** every NFL season since 1966, 28,700+ real players with real ratings, 178 logo and uniform eras, real schedules and drafts, the season selector and the mod.
