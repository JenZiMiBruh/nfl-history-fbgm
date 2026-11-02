/**
 * build_live_games.js - box scores for every finished game of the live season, so a league started today has its
 * game logs, box scores and past results filled in instead of blank.
 *
 * Each game gets both teams' totals and every player's line from nflverse's weekly stats (matched and converted
 * exactly like update_live.js, so box scores add up to the season totals), the final score from games.csv and the
 * score by quarter from ESPN (cached in data_cache/live2026/linescores.json; only new games are fetched).
 * Writes master.games. Run after update_live.js.
 *
 * Usage: node --max-old-space-size=14000 src/build_live_games.js [season=2026]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseCSVFile } = require('./csv_parser');
const { num, makeFinder, statLine } = require('./live_match');
const { CODE } = require('./team_codes');

const SEASON = +(process.argv[2] || 2026);
const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data_cache', 'live2026');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const LINES = path.join(LIVE, 'linescores.json');
const GID0 = 900000; // well clear of the gids Football GM gives scheduled games

const getJson = (url) => new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'NFLHistoryFBGM/1.0' } }, (res) => {
  const c = []; res.on('data', d => c.push(d)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c))); } catch (e) { reject(e); } });
}).on('error', reject));

(async () => {
  const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const games = parseCSVFile(path.join(LIVE, 'games.csv'))
    .filter(g => +g.season === SEASON && g.game_type === 'REG' && g.home_score !== '' && CODE[g.home_team] !== undefined)
    .sort((a, b) => +a.week - +b.week || String(a.gameday).localeCompare(b.gameday));

  // Score by quarter (plus overtime) from ESPN
  const lines = fs.existsSync(LINES) ? JSON.parse(fs.readFileSync(LINES, 'utf8')) : {};
  for (const g of games) {
    if (lines[g.game_id] || !g.espn) continue;
    try {
      const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${g.espn}`);
      const c = j.header.competitions[0].competitors;
      const q = side => (c.find(t => t.homeAway === side)?.linescores || []).map(l => +l.displayValue || 0);
      lines[g.game_id] = { home: q('home'), away: q('away') };
    } catch (e) { console.log('no quarter scores for', g.game_id); }
  }
  fs.writeFileSync(LINES, JSON.stringify(lines));

  const find = makeFinder(m, SEASON);
  const byPid = new Map(m.players.map(p => [p.pid, p]));
  const rows = parseCSVFile(path.join(LIVE, `stats_player_week_${SEASON}.csv`)).filter(r => r.season_type === 'REG');
  const rowsByGame = new Map();
  for (const r of rows) { if (!rowsByGame.has(r.game_id)) rowsByGame.set(r.game_id, []); rowsByGame.get(r.game_id).push(r); }

  // Template: every stat key a Football GM game team / player carries, all zero
  const TEAM_KEYS = ['gp', 'min', 'drives', 'totStartYds', 'timePos', 'fmb', 'fmbLost', 'pssCmp', 'pss', 'pssYds', 'pssTD', 'pssInt', 'pssLng', 'pssSk', 'pssSkYds', 'rus', 'rusYds', 'rusTD', 'rusLng', 'tgt', 'rec', 'recYds', 'recTD', 'recLng', 'pr', 'prYds', 'prTD', 'prLng', 'kr', 'krYds', 'krTD', 'krLng', 'defInt', 'defIntYds', 'defIntTD', 'defIntLng', 'defPssDef', 'defFmbFrc', 'defFmbRec', 'defFmbYds', 'defFmbTD', 'defFmbLng', 'defSk', 'defTckSolo', 'defTckAst', 'defTckLoss', 'defSft', 'fg0', 'fga0', 'fg20', 'fga20', 'fg30', 'fga30', 'fg40', 'fga40', 'fg50', 'fga50', 'fgLng', 'xp', 'xpa', 'tp', 'tpa', 'ko', 'koYds', 'koTB', 'ok', 'okRec', 'pnt', 'pntYds', 'pntLng', 'pntTB', 'pntIn20', 'pntBlk', 'pen', 'penYds', 'pbw', 'pba', 'rbw', 'rba', 'skAlw'];
  const PLAYER_KEYS = TEAM_KEYS.filter(k => !['drives', 'totStartYds', 'timePos', 'tp', 'tpa'].includes(k)).concat('gs');
  const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));

  const record = {}; // tid -> { won, lost, tied } after each game
  const out = [];
  let unmatched = 0;
  games.forEach((g, i) => {
    const sides = [
      { tid: CODE[g.home_team], pts: num(g.home_score), q: lines[g.game_id]?.home },
      { tid: CODE[g.away_team], pts: num(g.away_score), q: lines[g.game_id]?.away },
    ];
    const teams = sides.map(({ tid, pts, q }) => {
      const t = Object.assign({ tid, ovr: 0 }, zero(TEAM_KEYS), { gp: 1, pts, ptsQtrs: q && q.length ? q : [0, 0, 0, pts], players: [] });
      for (const r of rowsByGame.get(g.game_id) || []) {
        if (CODE[r.team] !== tid) continue;
        const p = find(r, tid);
        if (!p) { unmatched++; continue; }
        const line = statLine(r);
        const pl = Object.assign(zero(PLAYER_KEYS), line, { gp: 1, fgLng: num(r.fg_long), pntLng: num(r.pt_long) });
        const latest = p.ratings.at(-1);
        Object.assign(pl, { name: `${p.firstName} ${p.lastName}`, pos: latest.pos, pid: p.pid, skills: latest.skills || [], injury: { type: 'Healthy', gamesRemaining: 0 }, jerseyNumber: p.jerseyNumber });
        t.players.push(pl);
        for (const [k, v] of Object.entries(line)) if (k in t) t[k] += v;
        if (pl.fgLng > t.fgLng) t.fgLng = pl.fgLng;
      }
      // Starting quarterback: the passer with the most attempts
      const qb = t.players.filter(pl => pl.pss > 0).sort((a, b) => b.pss - a.pss)[0];
      if (qb) qb.gs = 1;
      return t;
    });
    const [h, a] = teams;
    for (const [me, opp] of [[h, a], [a, h]]) {
      const r = record[me.tid] = record[me.tid] || { won: 0, lost: 0, tied: 0 };
      if (me.pts > opp.pts) r.won++; else if (me.pts < opp.pts) r.lost++; else r.tied++;
      Object.assign(me, r);
    }
    const win = h.pts >= a.pts ? h : a, lose = win === h ? a : h;
    out.push({
      gid: GID0 + i, day: +g.week, att: 0, clutchPlays: [], season: SEASON, numPeriods: 4,
      overtimes: Math.max(0, (h.ptsQtrs.length || 4) - 4), won: { tid: win.tid, pts: win.pts }, lost: { tid: lose.tid, pts: lose.pts },
      scoringSummary: [], teams: [h, a],
    });
  });

  m.games = out;
  fs.writeFileSync(MASTER, JSON.stringify(m));
  console.log(`box scores: ${out.length} games through week ${games.at(-1)?.week}; ${unmatched} unmatched player lines`);
})();
