/**
 * build_head_to_head.js - every team's real head-to-head record, season by season, regular season and playoffs,
 * in Football GM's headToHeads format, so the Head-to-Head pages are filled in from day one.
 *   1966-1977: spreadspoke_scores.csv   1978-2026: nflverse games.csv (the live season from data_cache/live2026; only games
 *   with a final score)
 * Writes data_cache/head_to_heads.json and puts the records into the master (master.headToHeads).
 *
 * Usage: node --max-old-space-size=14000 src/build_head_to_head.js
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const { FULL, CODE } = require('./team_codes');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data_cache');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');

const bySeason = new Map();
function add(season, playoffs, homeTid, awayTid, homePts, awayPts) {
  if (!bySeason.has(season)) bySeason.set(season, { season, regularSeason: {}, playoffs: {} });
  const h2h = bySeason.get(season)[playoffs ? 'playoffs' : 'regularSeason'];
  // One record per pair, keyed lowest tid first, from that team's point of view
  const [a, b, ptsA, ptsB] = homeTid < awayTid ? [homeTid, awayTid, homePts, awayPts] : [awayTid, homeTid, awayPts, homePts];
  h2h[a] = h2h[a] || {};
  const r = h2h[a][b] = h2h[a][b] || { won: 0, lost: 0, tied: 0, otl: 0, otw: 0, pts: 0, oppPts: 0 };
  if (ptsA > ptsB) r.won++; else if (ptsA < ptsB) r.lost++; else r.tied++;
  r.pts += ptsA;
  r.oppPts += ptsB;
}

let n = 0;
for (const g of parseCSVFile(path.join(CACHE, 'spreadspoke_scores.csv'))) {
  const y = parseInt(g.schedule_season, 10);
  if (!(y >= 1966 && y <= 1977)) continue;
  const h = FULL[g.team_home], a = FULL[g.team_away], hp = parseInt(g.score_home, 10), ap = parseInt(g.score_away, 10);
  if (h === undefined || a === undefined || isNaN(hp) || isNaN(ap)) continue;
  add(y, g.schedule_playoff === 'TRUE', h, a, hp, ap);
  n++;
}
// The live season comes from the copy the live update keeps fresh
const LIVE_GAMES = path.join(CACHE, 'live2026', 'games.csv');
const liveRows = fs.existsSync(LIVE_GAMES) ? parseCSVFile(LIVE_GAMES).filter(g => +g.season === 2026) : [];
for (const g of [...parseCSVFile(path.join(CACHE, 'games.csv')).filter(g => !(liveRows.length && +g.season === 2026)), ...liveRows]) {
  const y = parseInt(g.season, 10);
  if (!(y >= 1978 && y <= 2026)) continue;
  const h = CODE[g.home_team], a = CODE[g.away_team], hp = parseInt(g.home_score, 10), ap = parseInt(g.away_score, 10);
  if (h === undefined || a === undefined || isNaN(hp) || isNaN(ap)) continue;
  add(y, g.game_type !== 'REG', h, a, hp, ap);
  n++;
}

const out = [...bySeason.values()].sort((x, y) => x.season - y.season);
fs.writeFileSync(path.join(CACHE, 'head_to_heads.json'), JSON.stringify(out));
const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
master.headToHeads = out;
fs.writeFileSync(MASTER, JSON.stringify(master));
console.log(`${n} games -> head-to-head records for ${out.length} seasons (${out[0].season}-${out.at(-1).season})`);
