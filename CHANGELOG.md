# What's new

Every fix and feature, newest first. If something below fixed a problem you hit, download the file again and start a new league: existing leagues keep the data they started with.

Found something off? [Open an issue](https://github.com/JenZiMiBruh/nfl-history-fbgm/issues) or comment on the Reddit post.

---

## v1.5 · Nov 2, 2026

- **The mod updates itself.** Every time you start it, it checks for a new version, downloads it, re-applies the mod and shows what's new before the game opens. No more re-downloading. (If you're on v1.4 or earlier, download the mod one last time to get the updater.)
- **Report a wrong rating or logo in one tap.** Every player card on the site has a "Rating look wrong? Report it" link and every team page a "Logo or uniform wrong?" link; they open a GitHub form already filled in with the player, season and rating. There are forms for mod problems too, which ask for install_log.txt.
- **The Mac/Linux mod zip works.** The zip stored its folders with Windows backslashes, so unzipping on a Mac didn't create the mod folder. Fixed.

## v1.4 · Nov 2, 2026

- **Draft classes restored.** v1.2 and v1.3 accidentally flattened all three real draft classes (2027-2029) to the same 40 overall / 59 potential: a ratings rebuild treated prospects with no NFL games like nobodies. Their real scouting-based ratings are back (top potentials 77-79), and the audit now checks that draft classes keep their spread.
- **The mod installer works with any Node.js.** Newer Node versions (25 and up, including today's LTS) dropped a tool Football GM needs to install, so the mod failed with "Something went wrong". The installer now downloads its own Node 24 into the mod folder, picks up where it stopped if a run fails, and writes install_log.txt to attach to a GitHub issue if anything still goes wrong.

## v1.3 · Nov 2, 2026

- **Elite pass-rush seasons count in full.** A player's peak pass rush comes from his actual best seasons, not averaged with the seasons around them. Aaron Donald's 2018 (20.5 sacks from the interior) now ties Myles Garrett's 2025 at the top, alongside J.J. Watt 2014, Mark Gastineau 1984, Richard Dent, Khalil Mack and T.J. Watt. Maxx Crosby's pass rush is 76.
- **Nose tackles stop the run.** Run defense up front now comes with size as well as tackles: Vita Vea 67 (was 40), Dexter Lawrence 68, Haloti Ngata 2010 78. Lighter edge rushers are rated lower against the run.
- **A new check for missing data** runs before every release: no healthy starter can be missing his current-season games. (Myles Garrett's empty 2026 is real: he's been on injured reserve with the Rams since Week 1, and the file has him injured.)

## v1.2 · Nov 2, 2026

### Pass rushers rush like themselves (thanks for the Maxx Crosby question)

- **Pass rush now comes from each lineman's and linebacker's own career sack rate** (and tackles for loss from 1999), instead of following his overall. Maxx Crosby's pass rush went from 59 to 70: his overall is still 69 because of a quiet start to 2026 (3 sacks in 8 games), but on the field he rushes like Crosby. Myles Garrett 80, Micah Parsons 76, T.J. Watt 74.
- **All of history too:** Reggie White 1987 and Aaron Donald 2018 at 77 pass rush, Bruce Smith 1990 at 74, Lawrence Taylor 1986 and Michael Strahan 2001 at 73. Every historic overall stays exactly the same; only the skill mix changed. (Sacks became official in 1982, so earlier linemen keep the old method.)

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
