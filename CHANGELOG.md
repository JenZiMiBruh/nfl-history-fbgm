# What's new

Every fix and feature, newest first. If something below fixed a problem you hit, download the file again and start a new league: existing leagues keep the data they started with.

Found something off? [Open an issue](https://github.com/JenZiMiBruh/nfl-history-fbgm/issues) or comment on the Reddit post.

---

## v1.17 · Nov 4, 2026

- **Backup quarterbacks stay quarterbacks.** Real QBs who barely threw in a season were rated as receivers (Scott Mitchell behind Marino in 1992). Fixed in every season.
- **Changelog in the game.** The mod shows its version, pops up what is new after an update, and keeps the full changelog a click away, without opening GitHub.
- **Update alert in the game.** When a new version is out, the mod says so and has an Update now button. (Restart the mod once to get it.)
- **New default settings for new mod leagues.** Real Player Determinism and Real Schedules stay on. Real Draft Picks, Scheduled Retirements, Comebacks and Suspensions, Real Retirements and Historical Rosters start off; turn on any you like in Settings.
- **Real Draft Ratings is a league setting** in Real Players.

## v1.16 · Nov 4, 2026

- **Real draft ratings.** In a league started before a draft, prospects are rated by where they really went (Dak Prescott, pick 135, is a 39, not a top-5 prospect), and with the mod their real ratings take over in their first season. A setting in the picker, on by default.
- **Schedule shows the games already played.** Week and Playoffs starts list the real scores from earlier weeks (no player box scores before 2026).
- **No Super Bowl spoilers.** A Playoffs start no longer shows that season's champion or awards.
- **Updates are every Sunday** for the rest of this season.

## v1.15 · Nov 4, 2026

- **Games ending 0-0 fixed.** Leagues built with the season picker could lose their expanded ratings and stats when written to the file, so every play gained nothing. If you got 0-0 games, build a new league: existing ones keep the bad data.

## v1.14 · Nov 3, 2026

- **Season picker works again.** A typo in v1.11-1.13 left the season list blank.
- **Week starts keep the real rosters.** Teams on a bye no longer lose everyone to free agency, and the roster limit favors who was really on the team that week, in every season.
- **Same-name players sorted out.** Spencer Brown the Bills tackle, the two Michael Carters, Chris Brooks, Audric Estimé and others are on the right teams.
- **Live in the mod no longer crashes.** It starts at the next week to play.
- **2001-02 Jaguars.** A source-data error put their players on opponents at week starts.

## v1.13 · Nov 3, 2026

- **Quarterbacks: accuracy +6, arm strength −7.** Football GM counts accuracy, deep passing and vision equally in a QB's overall, but the ratings leaned on arm strength, so almost no starter in any era rated as accurate. Same overalls, a better mix: more completions, fewer interceptions. In every season.
- **The best pass rushers stand out.** Sack production is long-tailed, so the elite (Donald, Garrett, White) now sit in the high 80s instead of just above the pack, and sacks stop getting spread so thin. Overalls unchanged; their other skills give a little back.
- **Short seasons lean on the better of last year's numbers.** A backup with one game was dragged down twice by a quiet short season before it (Gardner Minshew: one good game, rated 31 after a 43; now 41). A breakout isn't held back either. Applies to every short season since 1966.
- **Past ratings hit their overall exactly.** A coarse search left thousands of past ratings a point off; they match now.
- **Starting 2026 at a week:** every team's real roster and injuries going into that week (Carson Beck is on the Cardinals), the box scores of the weeks already played, and a roster limit that fits the real rosters.

## v1.12 · Nov 3, 2026

- **Browns logo, 1970-95.** Cleveland showed Brownie the Elf all the way to 1995; the elf was their logo through 1969, and from 1970 it was the orange helmet. Fixed in the live file, the season picker, the mod and the site. Thanks for the report!

## v1.11 · Nov 3, 2026

- **Mod download fixed.** The v1.10 mod zip was packed in the wrong format, so it wouldn't open in Windows Explorer or on a Mac, and Mac/Linux auto-updates stopped. It's a real zip again, and a failed update now just starts the version you have.
- **Every season is built in.** The mod now comes with the master file and the week-by-week games: New League → Upload league file shows every season with nothing to pick or unzip.
- **Start at any week, in the mod too.** The mod's picker has a week list like the site (any week of any season; this season up to the next week to play). On the site, this season's week list no longer shows weeks that haven't happened, and the downloaded selector gets the week-by-week games from the site when it can't find them next to it.
- **Seahawks and Buccaneers both join in 1976.** The two expansion teams each had their own expansion draft, and Football GM only ran one, so you couldn't pick Seattle. Same for the Panthers and Jaguars in 1995. They now share one draft.

## v1.10 · Nov 3, 2026

- **Week 8 complete.** Monday night (Bears 34, Seahawks 17) and Sunday night (Commanders 27, Eagles 10) are in: stats, standings, starts and ratings. Starts for Monday's game come from ESPN's box score, since snap counts post a day late.
- **Receivers no longer play running back too.** Football GM puts whoever has the best RB rating at RB, so star receivers (Jaxon Smith-Njigba, Calvin Johnson in 2011) lined up at RB and WR at once and piled up rushing stats. Receivers' RB ratings come down, never their overall, and every team's real back is ahead at RB. In every season since 1966.
- **Contracts end when they really do.** Nearly every contract ran out after this season, so you had to re-sign almost the whole team. Every player now has his real contract from OverTheCap (Trey McBride through 2029, Jeremiyah Love's rookie deal through 2029), in the live file and in any season the picker builds from 2011 on.
- **Kickers and punters rated on kicking.** They were ranked by an estimate that counted volume (a bad offense punts more) and mostly tied, so ratings were close to random. Now kickers are rated on makes over an average kicker, long ones counting extra, and punters on yards per punt and punts inside the 20.
- **Ties no longer decide ratings.** In 2025-26, players with the same value score were ordered arbitrarily. Ties now share a rank, which nudges many ratings a point or two.
- **Season picker: ratings by week.** A 2026 league started at a given week gets the ratings players had going into that week (from Week 9 on; each update adds a week).
- **Season picker fixes.** Building a second league in the same session came out a season off; fixed. Teams squeezed out of a position when a season had many extra players (1987 strike: no quarterbacks) keep a full lineup. Ties in a team's last 10 games no longer break the file.
- **Every draft class in the phone-friendly version.** It kept only the next three; now it has every real class, like the full version.
- **Playing right now.** The site shows how many people have the mod open right now (the mod checks in anonymously every few minutes; no-stats.txt still turns it off).

## v1.9 · Nov 2, 2026

- **Anonymous play count for the mod.** Each start sends one anonymous count (just the mod version) so I can see how many people play and which versions they're on. Nothing about you or your computer is sent. An empty file named no-stats.txt in the mod folder turns it off.

## v1.8 · Nov 2, 2026

- **1966-69 Cardinals logo, done right.** Rebuilt from the original art with traced shapes instead of fills that leaked: the background between the arch and the cardinal and by his head is see-through, the arch is a solid white band all the way around (it was drawn hollow above his arm and at its base), his thigh and shin are whole, his shoe stripes are white again, and the white halo the scan left around every edge is gone.

## v1.7 · Nov 2, 2026

- **1966-69 Cardinals logo, take two.** v1.6 left part of the white background around the cardinal's back leg. The leg is now traced from its outline, so only the leg stays white and the background behind it is see-through.

## v1.6 · Nov 2, 2026

- **1966-69 St. Louis Cardinals logo cleaned up.** A patch of the scan's white background was left between the Gateway Arch and the cardinal (and by its head), so it showed as a white block on colored backgrounds. It's see-through now, like the rest of the logo. Thanks for the report!

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
