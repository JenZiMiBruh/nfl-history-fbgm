# The mod

A patch against Football GM's open source code ([zengm](https://github.com/zengm-games/zengm)). It touches 39 files, about 2,300 lines.

The roster file works in stock Football GM. The mod is what makes history *behave* like history: real schedules, real drafts, real retirements, ratings that follow real careers, and settings for all of it.

## Install

**Windows:** double-click `Install_and_Play.bat`. It downloads its own copy of Node.js 24 into the folder (whatever Node you have doesn't matter), installs Git if you don't have it, downloads Football GM's source, applies the mod and opens the game. The first run takes 5–10 minutes; after that it starts in seconds. If something fails, run it again (it picks up where it stopped); if it still fails, open an issue and attach `install_log.txt` from the folder.

**Mac / Linux:** run `./install_and_play.sh` (needs git; it also uses its own Node.js 24).

**Updates are automatic.** Every time you start it, it checks for a new version. If there is one, it downloads it, re-applies the mod and shows what's new (in the window, and the release notes in your browser) before the game opens. Offline? It just starts what you have. Your leagues are never touched: they live in your browser. Each start, and a check-in every few minutes while it runs, send an anonymous count (just the mod version) so the site can show how many people play right now; an empty file named `no-stats.txt` in the folder turns it off.

**Phone:** run the installer on your computer, then open the address it shows (`http://<your-PC>:3000`) on your phone on the same Wi-Fi. Your phone saves its own leagues. Football GM's license doesn't allow hosting a modded copy online, so a computer on your network is required.

### Manual install

You need Node 24 (not newer: Node 25+ dropped corepack, which installs Football GM's packages), pnpm 11 and git.

```bash
git clone https://github.com/zengm-games/zengm.git
```

```bash
cd zengm
git checkout bda1fa5
git apply ../nfl-history-fbgm/mod/nfl-history-mod.patch
```

Copy `mod/public/nfl/` (from the release zip) into `public/football/nfl/`, then:

```bash
pnpm install
SPORT=football node --run dev
```

Open http://localhost:3000, choose **New League → Upload league file**, and the NFL History picker appears: pick a season, a phase and which events you want.

To play on a phone, add `-- --host` to the dev command and open the PC's address from the phone, or plug the phone in and run `adb reverse tcp:3000 tcp:3000`.

## What it changes

| Area | Files | What it does |
|---|---|---|
| New league | `LeagueFileUpload.tsx`, `NewLeague/index.tsx`, `newLeague.ts` | Season and phase picker, event checklist, build stamp |
| Settings | `Settings/settings.tsx`, `defaultGameAttributes.ts`, `types.ts` | One section for every mod option |
| Team colors | `Controller/TeamTheme.tsx`, `loadGameAttributes.ts` | The whole UI takes your team's colors |
| Schedules | `newSchedule.ts`, `createGameAttributes.ts` | Plays the real schedule each season, then generates after the data ends |
| Ratings | `develop.ts` | Real player determinism (RPD): blends progression toward the real ratings |
| Drafts | `runPicks.ts` | Real draft order and picks |
| Rosters | `newPhasePreseason.ts`, `checkRosterSizes.ts`, `newPhaseResignPlayers.ts` | Historical rosters, real jersey numbers, real players kept over the roster limit |
| Moves | `game/play.ts`, `game/nflRealMoves.ts` | Mid-season trades and signings on the real game |
| Events | `processScheduledEvents.ts`, `shouldRetire.ts` | Retirements, comebacks to the real team, suspensions, all with reasons |
| Game sim | `GameSim.football/index.ts`, `genDepth.football.ts` | Era calibration and accuracy tuning (see [docs/calibration.md](../docs/calibration.md)) |
| Native | `api/native.ts`, `tools/native/` | Runs the engine without a browser (personal Android build) |

## License

Football GM's code is source-available, not open source. You may share modifications as source and run them yourself; you may not host it publicly or distribute builds. This patch is shared on that basis. It's an unofficial fan mod, not made or endorsed by Football GM.
