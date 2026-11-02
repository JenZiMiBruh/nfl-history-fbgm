/**
 * export_vanilla.js - the live league for stock Football GM: today's real standings, stats, rosters and injuries,
 * with the full history since 1966 and the real 2027-2029 draft classes. No mod needed.
 *
 * Seasons are renamed by the year they end (the current season is 2027), like every other file in this project.
 * Bookkeeping that only the build scripts use (prospect IDs, counted-game lists) is stripped.
 *
 * Output: NFL_2027_Live_FBGM.json.gz
 * Usage: node --max-old-space-size=14000 src/export_vanilla.js ["label for the league name"]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { shiftSeasons } = require('./season_slicer');

const ROOT = path.join(__dirname, '..');
const label = process.argv[2] || 'Live';
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
shiftSeasons(m, 1);
m.meta = Object.assign({}, m.meta, { name: `NFL 2026-27 (${label})` });
delete m.liveCounted;
for (const p of m.players) { delete p.espnId; delete p.prospectRank; }
const out = path.join(ROOT, 'NFL_2027_Live_FBGM.json.gz');
fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify(m)), { level: 9 }));
console.log(`wrote ${path.basename(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
