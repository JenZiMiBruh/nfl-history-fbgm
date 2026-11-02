/**
 * build_schedules.js - real regular-season schedules 1966-2026 as Football GM
 * schedule rows, written to data_cache/real_schedules.json and embedded in the
 * season selector.
 *   1966-1977: spreadspoke_scores.csv   1978-2026: nflverse games.csv (complete, including the 1987 replacement games)
 * Usage: node src/build_schedules.js
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');

const CACHE = path.join(__dirname, '..', 'data_cache');
const { FULL, CODE } = require('./team_codes');

const out = {};
const push = (y, week, h, a) => { (out[y] = out[y] || []).push({ homeTid: h, awayTid: a, day: week }); };

for (const g of parseCSVFile(path.join(CACHE, 'spreadspoke_scores.csv'))) {
  const y = parseInt(g.schedule_season, 10);
  if (!(y >= 1966 && y <= 1977) || g.schedule_playoff === 'TRUE') continue;
  const h = FULL[g.team_home], a = FULL[g.team_away], w = parseInt(g.schedule_week, 10);
  if (h === undefined || a === undefined || !w) continue;
  push(y, w, h, a);
}
for (const g of parseCSVFile(path.join(CACHE, 'games.csv'))) {
  const y = parseInt(g.season, 10);
  if (!(y >= 1978 && y <= 2026) || g.game_type !== 'REG') continue;
  const h = CODE[g.home_team], a = CODE[g.away_team], w = parseInt(g.week, 10);
  if (h === undefined || a === undefined || !w) continue;
  push(y, w, h, a);
}
// Re-number days so they are consecutive (strike weeks, gaps).
for (const y of Object.keys(out)) {
  const days = [...new Set(out[y].map(g => g.day))].sort((a, b) => a - b);
  const map = new Map(days.map((d, i) => [d, i + 1]));
  out[y] = out[y].map(g => ({ ...g, day: map.get(g.day) })).sort((a, b) => a.day - b.day);
}
fs.writeFileSync(path.join(CACHE, 'real_schedules.json'), JSON.stringify(out));
console.log(Object.entries(out).map(([y, g]) => `${y}:${g.length}`).join(' '));
