# What's new

Every fix and feature, newest first. If something below fixed a problem you hit, download the file again and start a new league: existing leagues keep the data they started with.

Found something off? [Open an issue](https://github.com/JenZiMiBruh/nfl-history-fbgm/issues) or comment on the Reddit post.

---

## v1.20.12 · Nov 7, 2026

- **No more "# Division Games and # Conference Games settings were reset" message** when you upload this season's league file. The file asked for 6 division games plus 12 more conference games, 18 in a 17-game season, so Football GM threw both settings out and the schedule stopped favoring division and conference opponents. It's now the real NFL format: 6 division games and 6 other conference games. Leagues built with the season selector or the mod already had this right. A check now stops a release that gets it wrong.

## v1.20.11 · Nov 7, 2026

- **Real kick and punt returners get the job.** Football GM gives returns to its fastest player, so a team's real returner (often a backup cornerback or a fifth receiver) almost never got them: the real kick returner did in about 1 of every 20 team-seasons. Now real returners get the speed and sure hands their return numbers show (a 25-yard kick returner is faster than a 19-yard one), and starters stay off returns unless they're clearly the best at it, like real teams do. The real kick returner now gets the job about 2 of every 3 team-seasons (in his team's top two almost 9 of 10), and the real punt returner about 7 of 10. Devin Hester's 2007 season: speed 95, ball security 92. Nobody's overall changed.
- **Limits:** a starter who really returned too (Tim Brown, Josh Cribbs, Julian Edelman) may still lose the job, since his ratings can't change without moving his overall. Leagues started in 2026 before week 9 use ratings saved before this fix. Existing leagues keep the ratings they started with.

## v1.20.10 · Nov 7, 2026

- **The Browns move to Baltimore like they really did.** After the 1995 season, the Browns players, their contracts and their draft picks now go to the new Baltimore Ravens, instead of every Browns player hitting free agency and Baltimore filling its roster from an expansion draft. Cleveland keeps the Browns name and history and comes back in 1999 with its own expansion draft, as in real life. If you run the Browns, you keep running the team in Baltimore.

## v1.20.9 · Nov 7, 2026

- **Better ratings for 2025 and this season.** Those seasons have no official value scores yet, so they're estimated, and the estimate ignored how good each player's team was. Now it counts team scoring and defense like the real ones do, so players on winning teams are rated like it (the 14-3 Patriots were rated 21st of 32).
- **8 duplicate players removed.** Some 1966-75 players were in the file twice under a nickname or spelling (Charley and Charlie Cowan, Olie and Ollie Cordill). The copy took a roster spot, and Cowan's 1967 All-Pro was on the wrong one.
- **NFL History settings on the New League screen**, with new defaults: real retirements, comebacks (to free agency) and suspensions on; real drafts and historical rosters off. Change them any time in Settings > Real Players.

## v1.20.8 · Nov 7, 2026

- **No more "No player found at position K".** A team with nobody available at a spot (no kicker, or too few healthy players) stopped the whole season. Now it puts its best remaining player there and the game goes on.
- **Running backs back to normal workloads.** The mod's run-game changes were reverted to stock Football GM, which ends the 400-carry, 2,300-yard seasons. The RB1 Workload slider on the Roster page still works.
- **Fewer interceptions** in leagues built from the mod and the season selector: 10% fewer in every era.
- **Right jersey numbers in games.** Players wear their number for this season and team (some showed an old number from another season or team).
- **No backup QB at running back** while the team has healthy backs.

## v1.20.7 · Nov 7, 2026

- **The mod download opens again.** v1.20.4-1.20.6 shipped the mod in the wrong archive format, so it would not open in Windows Explorer or on a Mac, and Mac/Linux updates stayed on v1.20.3. It is a real zip again. Nothing else changed.

## v1.20.6 · Nov 6, 2026

- **"# Conference Games" error fixed in the mod.** Starting a league from the mod's NFL History box could stop with *Can't have more division and conference games than total games* (6 division + 12 conference in a 17-game season). The mod's season builder still had the old count; it now uses 6 from 2002 on, like the season selector and the league files since v1.20.3. Mod players get it automatically the next time they start the mod.
- **The mod always has every season.** If the seasons file is ever missing from the mod folder, the launcher downloads it from the release (about 18 MB) instead of the NFL History box asking you to choose it.
- **Roster updates move to Tuesdays,** the day after Monday Night Football ends each NFL week. See the [roadmap](docs/roadmap.md).

## v1.20.5 · Nov 5, 2026

- **Uninstall in one double-click (mod).** The mod folder now has `Uninstall.bat` (Mac and Linux: `uninstall.sh`). It stops the game if it's running and removes the folder, and asks before touching anything else. Your leagues live in your browser: delete them from the Leagues page first if you want them gone too. Existing installs get the uninstaller with this update.

## v1.20.4 · Nov 5, 2026

- **All-Star History now goes back to the first Pro Bowl in the files (1967).** The 1966–1970 and 1978 Pro Bowl rosters that v1.20.2 had to remove are restored from Pro-Football-Reference: full AFL, NFL, AFC and NFC teams, and each of those players gets his All-Star award. A few players who share a name with someone else that season are left off rather than risk crediting the wrong one. Start a new league to get them.

## v1.20.3 · Nov 5, 2026

- **"# Conference Games" fixed.** It was 12 (the NFL's total including division games), which stock Football GM rejects as more games than the season has. It's 6 now, the way Football GM counts it (other divisions in your conference). Checked against Football GM's scheduler for every season since 1966: no AFL–NFL games before the 1970 merger, the real 3 cross-conference games a team in 1970–77 and 4 in 1978–2001, and the real NFL format from 2002 on.
- **All-Star History starts with the 1971 Pro Bowl (1972)** for now: the earlier seasons with broken rosters were removed in v1.20.2.

## v1.20.2 · Nov 5, 2026

Fixes from your reports on r/Football_GM. Thank you!

- **All-Star History page fixed.** It crashed ("Cannot read properties of undefined") because six seasons of Pro Bowl history (1966–1970 and 1979) had an empty roster on one side. Those seasons are removed from every file. A league started from an older file keeps the bad data: start a new league to fix it there (in the mod, the page now skips those seasons, so existing mod leagues work too).
- **Phone-friendly is no longer forced on phones.** The season selector used to tick it on any phone. Now it's off unless your device reports very little memory, and you can always tick or untick it.
- **Season selector:** the 2020s interception tuning and Rookie Scale from v1.20.1 now apply to selector and website leagues too, not just the mod.

## v1.20.1 · Nov 4, 2026

- **RB1 Workload slider on the Roster page (mod).** Under Play Through Injuries: slide right to give your lead back more carries, left to spread them across the backfield. Every team has its own setting; 1.1 is the default, the same as before.
- **Fewer interceptions in the 2020s (mod).** The sim's interception rate for 2020–2026 is 9% lower, to match the real NFL.
- **Rookie Scale on (mod).** New leagues turn on Football GM's Rookie Scale setting, so draft picks sign set rookie contracts.
- **"What's new" button no longer covers the screen on phones.** It now sits at the bottom of the page instead of floating over the sidebar and roster.

## v1.20 · Nov 4, 2026

- **QB vision raised in every season.** Vision was far too low (Tom Brady never got above 63; he now peaks at 76), and it directly affects interceptions. Overalls unchanged.
- **Running backs in the mod.** Lead backs get fewer carries and a little less stamina, and a runner's ability is capped in the sim, to stop 400-carry, 2,300-yard seasons from generated players.
- **Draft numbers, take two.** Picks are numbered within their round, with the real overall pick stored: Tom Brady is 6-33, the 199th pick.

## v1.19 · Nov 4, 2026

- **Real traded picks, 2002 on.** A new league starts with each pick for the next 3 drafts owned by whoever really had it on that date. Before the 2016 trade the Rams keep their 2017 1st; at the 2016 draft Tennessee has it. Conditional picks stay put.
- **Draft pick numbers fixed.** Picks mixed overall numbers and numbers within the round (Tom Brady showed as 6-199 and the 359th pick, and rounds came out of order). All are now within the round, in order.

## v1.18 · Nov 4, 2026

- **Expansion drafts when starting After Playoffs or at the Draft.** Starting right when one was due dropped it (Panthers and Jaguars, 1995). It now runs at the next step of the offseason. Same for the 1995 Browns folding.

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
