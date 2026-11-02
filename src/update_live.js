/**
 * update_live.js - brings the live season in the master up to the latest finished games.
 *
 * For every regular-season game with a final score that the master hasn't counted yet:
 *   - standings: wins, losses, ties, points for and against (home/away, division and conference splits too)
 *   - player stats: that week's nflverse stat line added to the player's season row (passing, rushing,
 *     receiving, defense, returns, kicking by distance, punting), games played, QB wins and losses
 *   - team stats: the same lines summed per team, plus points
 *   - schedule: the game is removed from the upcoming games
 * Then rosters, injured reserve and injuries are refreshed from nflverse's latest weekly roster and injury report.
 * Games still to be played (tonight's, Monday's) stay on the schedule.
 *
 * Then rebuild what depends on the new games, and export:
 *   node src/build_head_to_head.js && node src/build_live_games.js && node src/build_weekly.js 2026 2026
 *   node src/export_vanilla.js "Week N"   (and copy data_cache/weekly/2026.json to the site's data/weekly/)
 *
 * Usage: node --max-old-space-size=14000 src/update_live.js [season=2026]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseCSVFile } = require('./csv_parser');
const { norm, num, makeFinder, statLine } = require('./live_match');

const SEASON = +(process.argv[2] || 2026);
const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data_cache', 'live2026');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const CODE = { ARI: 0, ATL: 1, BAL: 2, BUF: 3, CAR: 4, CHI: 5, CIN: 6, CLE: 7, DAL: 8, DEN: 9, DET: 10, GB: 11, HOU: 12, IND: 13, JAX: 14,
  KC: 15, LV: 16, LAC: 17, LA: 18, LAR: 18, MIA: 19, MIN: 20, NE: 21, NO: 22, NYG: 23, NYJ: 24, PHI: 25, PIT: 26, SF: 27, SEA: 28, TB: 29, TEN: 30, WAS: 31 };
const FILES = {
  'games.csv': 'https://github.com/nflverse/nfldata/raw/master/data/games.csv',
  [`stats_player_week_${SEASON}.csv`]: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${SEASON}.csv`,
  [`roster_weekly_${SEASON}.csv`]: `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${SEASON}.csv`,
  [`injuries_${SEASON}.csv`]: `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${SEASON}.csv`,
};
const get = (url) => new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'NFLHistoryFBGM/1.0' } }, (res) => {
  if ([301, 302, 307, 308].includes(res.statusCode)) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString())); }
  if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode + ' ' + url)); }
  const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c)));
}).on('error', reject));

(async () => {
  fs.mkdirSync(LIVE, { recursive: true });
  for (const [f, url] of Object.entries(FILES)) { fs.writeFileSync(path.join(LIVE, f), await get(url)); console.log('downloaded', f); }

  const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const ga = m.gameAttributes;
  m.liveCounted = m.liveCounted || [];
  const counted = new Set(m.liveCounted);

  // Games already in the master: everything not left on the schedule. Newly final = final now and still scheduled.
  const games = parseCSVFile(path.join(LIVE, 'games.csv')).filter(g => +g.season === SEASON && g.game_type === 'REG');
  const scheduled = new Set(m.schedule.map(s => `${s.homeTid}|${s.awayTid}`));
  const fresh = games.filter(g => g.home_score !== '' && g.away_score !== '' && !counted.has(g.game_id) && scheduled.has(`${CODE[g.home_team]}|${CODE[g.away_team]}`));
  console.log(`newly final games: ${fresh.length} (${fresh.map(g => g.game_id).join(', ')})`);
  if (!fresh.length) return console.log('nothing new');
  const freshIds = new Set(fresh.map(g => g.game_id));

  // ---- standings
  const teamSeason = tid => m.teams[tid].seasons.find(s => s.season === SEASON);
  const conf = tid => m.teams[tid].cid, div = tid => m.teams[tid].did;
  for (const g of fresh) {
    const h = CODE[g.home_team], a = CODE[g.away_team], hs = num(g.home_score), as = num(g.away_score);
    for (const [tid, opp, pf, pa, home] of [[h, a, hs, as, true], [a, h, as, hs, false]]) {
      const s = teamSeason(tid);
      const res = pf > pa ? 'won' : pf < pa ? 'lost' : 'tied';
      s[res] = (s[res] || 0) + 1;
      s.pts = (s.pts || 0) + pf; s.oppPts = (s.oppPts || 0) + pa;
      const cap = res[0].toUpperCase() + res.slice(1);
      const bump = k => { if (k in s) s[k]++; };
      bump(res + (home ? 'Home' : 'Away'));
      if (div(tid) === div(opp)) bump(res + 'Div');
      if (conf(tid) === conf(opp)) bump(res + 'Conf');
      if (s.streak !== undefined) s.streak = res === 'won' ? (s.streak > 0 ? s.streak + 1 : 1) : res === 'lost' ? (s.streak < 0 ? s.streak - 1 : -1) : 0;
      if (Array.isArray(s.lastTen)) { s.lastTen.unshift(res === 'won' ? 1 : res === 'lost' ? 0 : -1); s.lastTen = s.lastTen.slice(0, 10); }
      void cap;
    }
  }

  // ---- player lines
  const rows = parseCSVFile(path.join(LIVE, `stats_player_week_${SEASON}.csv`)).filter(r => freshIds.has(r.game_id) && r.season_type === 'REG');
  const find = makeFinder(m, SEASON);
  const blankRow = (tid, jersey) => {
    const tmpl = m.players.find(p => (p.stats || []).some(s => s.season === SEASON)).stats.find(s => s.season === SEASON);
    const r = {}; for (const k of Object.keys(tmpl)) r[k] = typeof tmpl[k] === 'number' ? 0 : tmpl[k];
    return Object.assign(r, { playoffs: false, season: SEASON, tid, jerseyNumber: jersey, yearsWithTeam: 1 });
  };
  const teamAdd = {};
  let matched = 0, unmatched = [];
  const qbOf = {};
  for (const r of rows) {
    const tid = CODE[r.team];
    if (tid === undefined) continue;
    const p = find(r, tid);
    if (!p) { unmatched.push(`${r.player_display_name} (${r.team})`); continue; }
    matched++;
    let row = p.stats.find(s => s.season === SEASON && !s.playoffs && s.tid === tid);
    if (!row) { row = blankRow(tid, p.jerseyNumber); p.stats.push(row); if (!p.statsTids.includes(tid)) p.statsTids.push(tid); }
    const line = statLine(r);
    for (const [k, v] of Object.entries(line)) if (k in row || v) row[k] = (row[k] || 0) + v;
    row.gp = (row.gp || 0) + 1;
    if (num(r.fg_long) > (row.fgLng || 0)) row.fgLng = num(r.fg_long);
    if (num(r.pt_long) > (row.pntLng || 0)) row.pntLng = num(r.pt_long);
    const ta = teamAdd[tid] = teamAdd[tid] || {};
    for (const [k, v] of Object.entries(line)) ta[k] = (ta[k] || 0) + v;
    if (num(r.attempts) > ((qbOf[r.game_id + tid] || {}).att || 0)) qbOf[r.game_id + tid] = { att: num(r.attempts), row };
  }
  // QB wins and losses go to the passer with the most attempts
  for (const g of fresh) for (const [tid, pf, pa] of [[CODE[g.home_team], num(g.home_score), num(g.away_score)], [CODE[g.away_team], num(g.away_score), num(g.home_score)]]) {
    const q = qbOf[g.game_id + tid]; if (!q) continue;
    q.row[pf > pa ? 'qbW' : pf < pa ? 'qbL' : 'qbT']++;
  }
  console.log(`player lines: ${matched} matched, ${unmatched.length} unmatched${unmatched.length ? ': ' + unmatched.slice(0, 15).join(', ') : ''}`);

  // ---- team stats
  for (const g of fresh) for (const [tid, pf, pa] of [[CODE[g.home_team], num(g.home_score), num(g.away_score)], [CODE[g.away_team], num(g.away_score), num(g.home_score)]]) {
    const ts = m.teams[tid].stats.find(s => s.season === SEASON && !s.playoffs);
    ts.gp = (ts.gp || 0) + 1; ts.pts = (ts.pts || 0) + pf; ts.oppPts = (ts.oppPts || 0) + pa;
    for (const [k, v] of Object.entries(teamAdd[tid] || {})) if (k in ts) ts[k] += v;
  }

  // ---- schedule
  const before = m.schedule.length;
  m.schedule = m.schedule.filter(s => !fresh.some(g => CODE[g.home_team] === s.homeTid && CODE[g.away_team] === s.awayTid));
  console.log(`schedule: ${before} -> ${m.schedule.length} upcoming games`);
  m.liveCounted.push(...fresh.map(g => g.game_id));

  // ---- rosters, injured reserve and injuries
  const weekly = parseCSVFile(path.join(LIVE, `roster_weekly_${SEASON}.csv`));
  const lastWeek = {};
  for (const r of weekly) lastWeek[r.team] = Math.max(lastWeek[r.team] || 0, +r.week);
  const current = weekly.filter(r => +r.week === lastWeek[r.team] && CODE[r.team] !== undefined);
  const injRows = parseCSVFile(path.join(LIVE, `injuries_${SEASON}.csv`));
  const injWeek = Math.max(...injRows.map(r => +r.week));
  const latestInj = new Map();
  for (const r of injRows.sort((a, b) => +a.week - +b.week)) latestInj.set(norm(r.full_name) + '|' + r.team, r);
  const severe = /acl|achilles|torn|fractur|broken|surgery|season|lisfranc|patellar/i;
  const onTeam = new Set();
  let moved = 0, injured = 0, missing = 0;
  for (const p of m.players) if (p.tid >= -1) p.injury = { type: 'Healthy', gamesRemaining: 0 };
  const gamesLeft = Math.max(0, 17 - injWeek);
  for (const r of current) {
    if (!['ACT', 'RES', 'INA'].includes(r.status)) continue;
    const tid = CODE[r.team];
    const p = find({ player_display_name: r.full_name }, tid);
    if (!p) { missing++; continue; }
    if (p.tid !== tid) { p.tid = tid; moved++; }
    if (r.jersey_number && r.jersey_number !== '0') p.jerseyNumber = String(r.jersey_number);
    onTeam.add(p.pid);
    const inj = latestInj.get(norm(r.full_name) + '|' + r.team);
    const type = (inj && (inj.report_primary_injury || inj.practice_primary_injury)) || '';
    if (r.status === 'RES') { p.injury = { type: type || 'Injured Reserve', gamesRemaining: severe.test(type) ? gamesLeft : 4 }; injured++; }
    else if (inj && +inj.week === injWeek && /^(Out|Doubtful)$/.test(inj.report_status)) { p.injury = { type: type || 'Undisclosed', gamesRemaining: 1 }; injured++; }
  }
  let released = 0;
  for (const p of m.players) if (p.tid >= 0 && !onTeam.has(p.pid)) { p.tid = -1; released++; }
  const counts = {};
  for (const p of m.players) if (p.tid >= 0) counts[p.tid] = (counts[p.tid] || 0) + 1;
  ga.maxRosterSize = Math.max(53, ...Object.values(counts));
  console.log(`rosters (week ${Math.max(...Object.values(lastWeek))}): ${onTeam.size} on teams, ${moved} moved, ${released} to free agency, ${missing} not found; ${injured} injured (report week ${injWeek})`);

  const { fitPayrolls, buildDepth } = require('./season_slicer');
  fitPayrolls(m.players, require('./nfl_eras').getRules(SEASON));
  for (const team of m.teams) team.depth = buildDepth(m.players.filter(p => p.tid === team.tid));

  fs.writeFileSync(MASTER, JSON.stringify(m));
  console.log('master updated');
})();
