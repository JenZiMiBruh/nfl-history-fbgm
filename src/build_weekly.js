/**
 * build_weekly.js - week-by-week real data for every season since 1999, so a league can start at any week with
 * everything before it already played: each game's score and every player's line, game by game.
 *
 * Writes data_cache/weekly/<season>.json:
 *   { season, games: [[day, homeTid, awayTid, homePts, awayPts]], lines: { pid: [[day, tid, {stat: value}], ...] } }
 * Days are numbered like the real schedules (data_cache/real_schedules.json): consecutive, in week order.
 * Players are matched to the master by name among those with stats that season (same team first), so a line can
 * only land on someone who really played then. Stat lines use the live update's conversion (live_match.js).
 *
 * Usage: node --max-old-space-size=14000 src/build_weekly.js [first=1999] [last=2026]
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const { norm, statLine, num } = require('./live_match');
const { CODE } = require('./team_codes');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data_cache');
const OUT = path.join(CACHE, 'weekly');
const FIRST = +(process.argv[2] || 1999), LAST = +(process.argv[3] || 2026);
fs.mkdirSync(OUT, { recursive: true });

const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
const allGames = [
  ...parseCSVFile(path.join(CACHE, 'games.csv')).filter(g => +g.season < 2026),
  ...parseCSVFile(path.join(CACHE, 'live2026', 'games.csv')).filter(g => +g.season === 2026),
];

for (let y = FIRST; y <= LAST; y++) {
  const file = y === 2026 ? path.join(CACHE, 'live2026', 'stats_player_week_2026.csv') : path.join(CACHE, 'stats_week', `stats_player_week_${y}.csv`);
  if (!fs.existsSync(file)) { console.log(y, 'no weekly file'); continue; }
  const reg = allGames.filter(g => +g.season === y && g.game_type === 'REG' && CODE[g.home_team] !== undefined);
  const weeks = [...new Set(reg.map(g => +g.week))].sort((a, b) => a - b);
  const dayOf = new Map(weeks.map((w, i) => [w, i + 1]));
  const games = reg.filter(g => g.home_score !== '').map(g => [dayOf.get(+g.week), CODE[g.home_team], CODE[g.away_team], num(g.home_score), num(g.away_score)]);

  // Who played this season, by name and by last name
  const byName = new Map(), byLast = new Map();
  for (const p of master.players) {
    const tids = new Set((p.stats || []).filter(s => s.season === y && !s.playoffs).map(s => s.tid));
    if (!tids.size) continue;
    const e = { p, tids };
    for (const [map, key] of [[byName, norm(`${p.firstName} ${p.lastName}`)], [byLast, norm(p.lastName)]]) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
  }
  const pick = (list, tid) => list.length === 1 ? list[0].p : (list.filter(e => e.tids.has(tid)).length === 1 ? list.find(e => e.tids.has(tid)).p : null);
  const find = (r, tid) => {
    const c = byName.get(norm(r.player_display_name)) || [];
    if (c.length) return pick(c, tid);
    const parts = String(r.player_display_name).replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' ');
    const last = (byLast.get(norm(parts.slice(-1)[0])) || []).filter(e => String(e.p.firstName)[0].toLowerCase() === parts[0][0].toLowerCase());
    return pick(last, tid);
  };

  const lines = {};
  let matched = 0, missed = 0;
  for (const r of parseCSVFile(file)) {
    if (r.season_type !== 'REG' || !r.player_display_name) continue;
    const tid = CODE[r.team], day = dayOf.get(+r.week);
    if (tid === undefined || !day) continue;
    const p = find(r, tid);
    if (!p) { missed++; continue; }
    const full = statLine(r), line = {};
    for (const [k, v] of Object.entries(full)) if (v) line[k] = v;
    if (num(r.fg_long)) line.fgLng = num(r.fg_long);
    if (num(r.pt_long)) line.pntLng = num(r.pt_long);
    (lines[p.pid] = lines[p.pid] || []).push([day, tid, line]);
    matched++;
  }
  fs.writeFileSync(path.join(OUT, `${y}.json`), JSON.stringify({ season: y, games, lines }));
  console.log(`${y}: ${games.length} games, ${weeks.length} weeks, ${matched} player-games matched, ${missed} unmatched`);
}
