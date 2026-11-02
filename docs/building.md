# Building from source

Needs Node 18+ and about 14 GB of free memory for the big steps. Raw downloads go in `data_cache/`, which isn't in the repo; the fetch scripts recreate it.

## 1. Fetch

```bash
node src/fetch_wiki_players.js
node src/fetch_pfr_wayback.js
node src/fetch_pfr_pages.js
node src/fetch_logos.js
node src/fetch_logopedia.js
node src/fetch_uniform_pages.js
```

## 2. Build

```bash
node src/build_schedules.js
node src/process_logos.js path/to/jimp
node --max-old-space-size=14000 src/build_master.js
```

## 3. Clean and rate

```bash
node --max-old-space-size=14000 src/fix_namesake_awards.js
node --max-old-space-size=14000 src/fix_player_records.js
node --max-old-space-size=14000 src/rebuild_ratings.js
```

## 4. Calibrate (optional)

```bash
node --max-old-space-size=14000 src/calibrate_eras.js path/to/full-history-export.json
```

## 5. Package

```bash
node src/build_selector.js
node src/build_mod_assets.js
```

To slice one season from the command line (the same code the selector uses):

```bash
node --max-old-space-size=14000 src/season_slicer.js --season 1986 --phase regular
```
