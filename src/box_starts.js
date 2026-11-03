/**
 * box_starts.js - games played and starts for finished games whose snap counts aren't posted yet (nflverse posts them
 * about a day after each game, so Monday night's game would otherwise be missing its starts).
 *
 * For each finished regular-season game with no rows in data_cache/snaps/snap_counts_<season>.csv, ESPN's game roster
 * lists who played and who started. Players are matched through
 * nflverse's weekly roster (ESPN id -> name), then to the master by name and team like the snap counts. Writes
 * data_cache/snaps/box_starts_<season>.json: { game_id: [[pid, tid, started], ...] }, which starts_from_snaps.js counts
 * like snap rows. Games that get their snap counts later are left to the snap counts.
 *
 * Usage: node --max-old-space-size=14000 src/box_starts.js [season=2026]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseCSVFile } = require('./csv_parser');
const { CODE } = require('./team_codes');
const { norm } = require('./live_match');

const SEASON = +(process.argv[2] || 2026);
const ROOT = path.join(__dirname, '..');
const SNAPS = path.join(ROOT, 'data_cache', 'snaps', `snap_counts_${SEASON}.csv`);
const OUT = path.join(ROOT, 'data_cache', 'snaps', `box_starts_${SEASON}.json`);
const get = (url) => new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'NFLHistoryFBGM/1.0' } }, (res) => {
  if ([301, 302, 307, 308].includes(res.statusCode)) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString())); }
  if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode + ' ' + url)); }
  const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(JSON.parse(Buffer.concat(c).toString())));
}).on('error', reject));

(async () => {
  const have = new Set(parseCSVFile(SNAPS).map(r => r.game_id));
  const games = parseCSVFile(path.join(ROOT, 'data_cache', 'live2026', 'games.csv'))
    .filter(g => +g.season === SEASON && g.game_type === 'REG' && g.home_score !== '' && g.home_score !== 'NA' && !have.has(g.game_id));
  const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
  const nameOf = new Map(parseCSVFile(path.join(ROOT, 'data_cache', 'live2026', `roster_weekly_${SEASON}.csv`)).filter(r => r.espn_id && r.espn_id !== 'NA').map(r => [String(r.espn_id), r.full_name]));
  const byName = new Map();
  // his teams this season by stat line, and his current team (a lineman can have no stat line)
  for (const p of master.players) {
    for (const st of p.stats || []) if (st.season === SEASON && !st.playoffs) byName.set(norm(`${p.firstName} ${p.lastName}`) + '|' + st.tid, p);
    if (p.tid >= 0 && !byName.has(norm(`${p.firstName} ${p.lastName}`) + '|' + p.tid)) byName.set(norm(`${p.firstName} ${p.lastName}`) + '|' + p.tid, p);
  }
  // nicknames (Olu Oluwatimi is Olusegun, Cam Lewis is Cameron): same team, last name and first initial, if only one
  const byLast = new Map();
  for (const [k, p] of byName) { const [n, tid] = k.split('|'); const k2 = norm(p.lastName) + '|' + norm(p.firstName)[0] + '|' + tid; byLast.set(k2, byLast.has(k2) && byLast.get(k2) !== p ? null : p); }
  const nick = (name, tid) => { const parts = name.split(' '); return byLast.get(norm(parts.slice(1).join(' ')) + '|' + norm(parts[0])[0] + '|' + tid) || null; };
  const out = {};
  for (const g of games) {
    const base = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.espn}/competitions/${g.espn}/competitors`;
    const rows = [];
    let missed = 0;
    for (const c of (await get(base)).items) {
      const tid = CODE[c.homeAway === 'home' ? g.home_team : g.away_team];
      for (const e of (await get(`${base}/${c.id}/roster`)).entries || []) {
        if (e.didNotPlay) continue;
        // not every player has his ESPN id on nflverse's roster: then ESPN's own athlete record gives the name
        const name = nameOf.get(String(e.playerId)) || (await get(e.athlete.$ref.replace('http:', 'https:')).catch(() => ({}))).fullName;
        const p = name && (byName.get(norm(name) + '|' + tid) || nick(name, tid));
        // (practice-squad call-ups are free agents in the master, back on the practice squad after the game: left out)
        if (!p) { missed++; if (process.env.SHOW_MISSED) console.log('  not matched:', e.playerId, name || '(not on the weekly roster)', tid, e.starter ? 'starter' : ''); continue; }
        rows.push([p.pid, tid, e.starter ? 1 : 0]);
      }
    }
    out[g.game_id] = rows;
    console.log(`${g.game_id}: ${rows.length} played (${rows.filter(r => r[2]).length} started) from ESPN's box score, ${missed} not matched`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  if (!games.length) console.log('every finished game has snap counts');
})();
