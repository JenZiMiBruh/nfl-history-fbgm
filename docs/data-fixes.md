# Fixing the data

Combining sources means combining their mistakes. Stat heads *will* notice, so [`fix_player_records.js`](../src/fix_player_records.js) and [`fix_namesake_awards.js`](../src/fix_namesake_awards.js) fix them before ratings are built.

| Problem | Example | Fix |
|---|---|---|
| Name variants create a fake player | "Vincent Testacerde" at QB for the Cardinals | Merge players with the same name and birth year when one career fits inside the other, plus a nickname list (Vinny / Vincent) on the same team and season |
| Two players merged into one | Two men with one name, playing different positions the same year | Split, but only when the seasons really clash, so special-teams tackles don't cause false splits |
| Long gaps in a career | Years missing, then stats again under the same name | Split into separate players |
| Awards on the wrong namesake | Reggie White honors landing on the other Reggie White | Match awards by team and season; Hall of Fame years fixed too |
| Impossible ages | Players younger than 18 or older than 50 | Checked against debut year (George Blanda really did play at 48) |
| Wrong jersey numbers | Carson Beck wearing #6 | Real numbers per season from rosters; the real owner keeps his number in a clash |
| Draft years | Undrafted players listed as drafted in their debut year | Normalized per player |
| Positions and weights | One source's typo | Taken from the source with the most games |

Left alone on purpose: supplemental draft picks, namesakes who really were two people, real gaps in the sources, and Taysom Hill being whatever position Taysom Hill is.
