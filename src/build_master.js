/**
 * build_master.js - builds the single all-in-one master league file:
 *   NFL_Master_1966_2026.json
 *
 * Starts from the existing 1978-2026 build (NFL_1978_2026_Week9_FBGM.json), then:
 *   1. Adds the 1966-1977 seasons (nflverse rosters, Kaggle NFL.com stats,
 *      spreadspoke game results, Wikipedia awards, drafts and Hall of Fame).
 *   2. Fixes known data problems (ghost stat rows, duplicate players, negative
 *      sack yards, missing pre-1980 draft info, broken award entries).
 *   3. Re-applies era-accurate branding, divisions and rules from nfl_eras.js
 *      to every team season, and attaches the full scheduledEvents list.
 *
 * The output is a valid Football GM file (2026 Week 9 live) and is also the
 * input for nfl_season_selector.html, which slices it to any season/phase.
 *
 * Usage: node --max-old-space-size=14000 src/build_master.js
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const E = require('./nfl_eras');
const { normalizePos, generateRatingFromBaseOrAV, computeOvr, finalizeRatingObject } = require('./ratings_engine');
const { normalizeName, loadAllAwardsData } = require('./awards_parser');
const { loadWikiDrafts } = require('./wiki_drafts');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data_cache');
const BASE_FILE = path.join(CACHE, 'base', 'NFL_1978_2026_Week9_FBGM.json');
const OUT_FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const NEW_FIRST = 1966;
const OLD_FIRST = 1978;

const log = (...a) => console.log('[master]', ...a);
const norm = (s) => normalizeName(String(s || '').replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, ''));
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

const logoFile = path.join(CACHE, 'logos.json');
const processedFile = path.join(CACHE, 'logos_processed.json');
if (fs.existsSync(logoFile)) E.setLogos(JSON.parse(fs.readFileSync(logoFile, 'utf8')), fs.existsSync(processedFile) ? JSON.parse(fs.readFileSync(processedFile, 'utf8')) : {},
  fs.existsSync(path.join(CACHE, 'logos_eras_final.json')) ? JSON.parse(fs.readFileSync(path.join(CACHE, 'logos_eras_final.json'), 'utf8')) : null);

// ---------------------------------------------------------------------------
// Team name / code lookups for the 1966-1998 sources
// ---------------------------------------------------------------------------
const FULLNAME_TID = {
  'Arizona Cardinals': 0, 'Phoenix Cardinals': 0, 'St. Louis Cardinals': 0, 'Atlanta Falcons': 1, 'Baltimore Ravens': 2,
  'Buffalo Bills': 3, 'Carolina Panthers': 4, 'Chicago Bears': 5, 'Cincinnati Bengals': 6, 'Cleveland Browns': 7, 'Dallas Cowboys': 8,
  'Denver Broncos': 9, 'Detroit Lions': 10, 'Green Bay Packers': 11, 'Houston Texans': 12, 'Baltimore Colts': 13, 'Indianapolis Colts': 13,
  'Jacksonville Jaguars': 14, 'Kansas City Chiefs': 15, 'Oakland Raiders': 16, 'Los Angeles Raiders': 16, 'Las Vegas Raiders': 16,
  'San Diego Chargers': 17, 'Los Angeles Chargers': 17, 'Los Angeles Rams': 18, 'St. Louis Rams': 18, 'Miami Dolphins': 19,
  'Minnesota Vikings': 20, 'New England Patriots': 21, 'Boston Patriots': 21, 'New Orleans Saints': 22, 'New York Giants': 23,
  'New York Jets': 24, 'Philadelphia Eagles': 25, 'Pittsburgh Steelers': 26, 'San Francisco 49ers': 27, 'Seattle Seahawks': 28,
  'Tampa Bay Buccaneers': 29, 'Houston Oilers': 30, 'Tennessee Oilers': 30, 'Tennessee Titans': 30, 'Washington Redskins': 31,
  'Washington Football Team': 31, 'Washington Commanders': 31
};
const ROSTER_CODE_TID = { ATL: 1, BAL: 13, BOS: 21, NE: 21, BUF: 3, CHI: 5, CIN: 6, CLE: 7, DAL: 8, DEN: 9, DET: 10, GB: 11, HOU: 30,
  KC: 15, LA: 18, MIA: 19, MIN: 20, NO: 22, NYG: 23, NYJ: 24, OAK: 16, PHI: 25, PIT: 26, SD: 17, SF: 27, STL: 0, WAS: 31, SEA: 28, TB: 29 };
const tidFromFullName = (s) => {
  if (!s) return -1;
  const t = String(s).replace(/\(.*?\)/g, '').trim();
  if (FULLNAME_TID[t] !== undefined) return FULLNAME_TID[t];
  for (const [k, v] of Object.entries(FULLNAME_TID)) if (t.endsWith(k.split(' ').pop()) && t.includes(k.split(' ')[0])) return v;
  return -1;
};

// ---------------------------------------------------------------------------
function zeroStatRow(template) {
  const z = {};
  for (const [k, v] of Object.entries(template)) z[k] = typeof v === 'number' ? 0 : v;
  return z;
}
const ACTIVITY_KEYS = ['pss', 'rus', 'tgt', 'rec', 'defTckSolo', 'defTckAst', 'defSk', 'defInt', 'defPssDef', 'defFmbFrc', 'defFmbRec',
  'kr', 'pr', 'pnt', 'xpa', 'fga0', 'fga20', 'fga30', 'fga40', 'fga50', 'ko', 'gs', 'pbw', 'pba', 'rbw', 'rba'];
const hasActivity = (s) => ACTIVITY_KEYS.some(k => (s[k] || 0) !== 0);

// Pro Football Hall of Fame inductees (Wikipedia list) -> normalized name -> induction year.
function loadHofYears() {
  const f = path.join(CACHE, 'awards', 'wiki_HOF_inductees.json');
  const m = new Map();
  if (!fs.existsSync(f)) return m;
  const wt = JSON.parse(fs.readFileSync(f, 'utf8')).parse.wikitext['*'];
  const yearCell = String.raw`\|\|\s*(?:rowspan="?\d+"?\s*\|\s*)?(\d{4})\s*\|\|`;
  const re = new RegExp(String.raw`\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}[^\n]*?` + yearCell, 'g');
  let x;
  while ((x = re.exec(wt))) m.set(norm(`${x[1].trim()} ${x[2].trim()}`), parseInt(x[3], 10));
  const re2 = new RegExp(String.raw`^\|[^\n]*?\[\[([^\]|]+)(?:\|([^\]]+))?\]\][^\n]*?` + yearCell, 'gm');
  while ((x = re2.exec(wt))) { const n = norm((x[2] || x[1]).replace(/\s*\(.*?\)/, '')); if (!m.has(n)) m.set(n, parseInt(x[3], 10)); }
  return m;
}

// Football GM OVR implied by a Pro-Football-Reference style Approximate Value.
function avToOvr(av) {
  if (av >= 18) return 84 + Math.min(8, Math.round((av - 18) * 1.2));
  if (av >= 12) return 70 + Math.round(((av - 12) / 6) * 14);
  if (av >= 6) return 54 + Math.round(((av - 6) / 6) * 16);
  if (av >= 2) return 44 + Math.round(((av - 2) / 4) * 10);
  return 38 + av * 2;
}
const RATING_KEYS = ['hgt', 'stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];
const PRIMARY = { QB: ['tha', 'thp', 'thv', 'bsc'], RB: ['elu', 'bsc', 'spd', 'stre'], WR: ['hnd', 'rtr', 'spd'], TE: ['hnd', 'rtr', 'pbk', 'rbk'],
  OL: ['pbk', 'rbk', 'stre'], DL: ['prs', 'rns', 'tck', 'stre'], LB: ['tck', 'rns', 'prs', 'pcv'], CB: ['pcv', 'spd'], S: ['pcv', 'tck'], K: ['kpw', 'kac'], P: ['ppw', 'pac'] };
// Keep a player's attribute profile but move his position attributes until OVR hits target.
function retarget(base, pos, target, season, age) {
  const raw = {};
  for (const k of RATING_KEYS) raw[k] = base[k];
  const keys = PRIMARY[pos] || ['stre', 'spd'];
  for (let i = 0; i < 20; i++) {
    const diff = target - computeOvr({ ...raw, pos }, pos);
    if (Math.abs(diff) <= 1) break;
    const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.5));
    for (const k of keys) raw[k] = Math.max(10, Math.min(99, raw[k] + step));
  }
  return finalizeRatingObject(raw, pos, season, age);
}

function main() {
  log('Loading base league', path.basename(BASE_FILE));
  const L = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
  const players = L.players;
  let maxPid = Math.max(...players.map(p => p.pid));
  const template = players.find(p => p.stats && p.stats.length).stats[0];
  const awardTemplate = L.awards.find(a => a.season === 1979);

  // =========================================================================
  // 1. Fix existing data
  // =========================================================================
  // 1a. Sack yards must be positive yardage lost.
  let fixedSk = 0;
  for (const p of players) for (const s of p.stats || []) if (s.pssSkYds < 0) { s.pssSkYds = -s.pssSkYds; fixedSk++; }
  log('Fixed negative sack-yard values:', fixedSk);

  // 1b. Ghost stat rows: no recorded activity and the player does not appear in
  //     Pro-Football-Reference's Approximate Value list for that season.
  const pfrBySeason = {};
  for (let y = 2000; y <= 2025; y++) {
    const f = path.join(CACHE, 'pfr_av', `pfr_av_${y}.csv`);
    if (!fs.existsSync(f)) continue;
    const m = new Map();
    for (const r of parseCSVFile(f)) m.set(norm(r.name), num(r.approximate_value));
    pfrBySeason[y] = m;
  }
  let ghosts = 0, avFilled = 0;
  for (const p of players) {
    const key = norm(`${p.firstName} ${p.lastName}`);
    p.stats = (p.stats || []).filter(s => {
      if (s.playoffs || s.season < 2000 || s.season > 2025 || !pfrBySeason[s.season]) return true;
      if (hasActivity(s) || pfrBySeason[s.season].has(key)) return true;
      ghosts++;
      return false;
    });
    // 2025 Approximate Value was never merged.
    const rows25 = p.stats.filter(s => s.season === 2025 && !s.playoffs);
    if (rows25.length === 1 && !rows25[0].av && pfrBySeason[2025] && pfrBySeason[2025].has(key)) { rows25[0].av = pfrBySeason[2025].get(key); avFilled++; }
  }
  log('Removed ghost stat rows:', ghosts, '| 2025 AV filled:', avFilled);

  // 1c. Broken award entries (keep both FBGM forms: {season,type} and {season,name,shortName,index,rank}).
  for (const p of players) p.awards = (p.awards || []).filter(a => a && (a.type || (a.name && a.shortName)));

  // 1e. 1982 strike tournament had 16 teams and no byes; drop the phantom bye slots.
  for (const ps of L.playoffSeries || []) ps.series = ps.series.map(r => r.filter(m => m.home && m.home.tid !== undefined));

  // 1d. Exact duplicate players (same name, birth year, college and position).
  const dupKey = (p) => `${norm(p.firstName + ' ' + p.lastName)}|${p.born && p.born.year}|${p.college}|${p.pos}`;
  const seenDup = new Map();
  const removePids = new Set();
  for (const p of players) {
    const k = dupKey(p);
    if (!seenDup.has(k)) { seenDup.set(k, p); continue; }
    const keep = seenDup.get(k);
    const seasons = new Set((keep.stats || []).map(s => `${s.season}|${s.tid}|${s.playoffs}`));
    for (const s of p.stats || []) if (!seasons.has(`${s.season}|${s.tid}|${s.playoffs}`)) keep.stats.push(s);
    const rs = new Set(keep.ratings.map(r => r.season));
    for (const r of p.ratings || []) if (!rs.has(r.season)) keep.ratings.push(r);
    keep.ratings.sort((a, b) => a.season - b.season);
    keep.awards.push(...(p.awards || []));
    if (keep.tid < 0 && p.tid >= 0) keep.tid = p.tid;
    removePids.add(p.pid);
    log('  merged duplicate player', p.firstName, p.lastName, p.pid, '->', keep.pid);
  }

  // =========================================================================
  // 2. Add 1966-1977
  // =========================================================================
  const byName = new Map();
  const index = (p) => { const k = norm(`${p.firstName} ${p.lastName}`); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); };
  for (const p of players) if (!removePids.has(p.pid)) index(p);

  // Kaggle NFL.com career stats (per player-season-team).
  const kag = new Map();
  const kKey = (n, y, t) => `${n}|${y}|${t}`;
  const kaggleName = (s) => { const [last, first] = String(s).split(',').map(x => x.trim()); return first ? `${first} ${last}` : last; };
  const kget = (n, y, t) => { const k = kKey(n, y, t); if (!kag.has(k)) kag.set(k, { gp: 0 }); return kag.get(k); };
  const addKaggle = (file, fn) => {
    for (const r of parseCSVFile(path.join(CACHE, 'pre1999', file))) {
      const y = parseInt(r.Year, 10);
      if (!(y >= NEW_FIRST && y < OLD_FIRST)) continue;
      const tid = tidFromFullName(r.Team);
      if (tid < 0) continue;
      const o = kget(norm(kaggleName(r.Name)), y, tid);
      o.gp = Math.max(o.gp, num(r['Games Played']));
      fn(o, r);
    }
  };
  addKaggle('Career_Stats_Passing.csv', (o, r) => {
    o.pss = num(r['Passes Attempted']); o.pssCmp = num(r['Passes Completed']); o.pssYds = num(r['Passing Yards']);
    o.pssTD = num(r['TD Passes']); o.pssInt = num(r.Ints); o.pssLng = num(r['Longest Pass']); o.pssSk = num(r.Sacks); o.pssSkYds = Math.abs(num(r['Sacked Yards Lost']));
  });
  addKaggle('Career_Stats_Rushing.csv', (o, r) => {
    o.rus = num(r['Rushing Attempts']); o.rusYds = num(r['Rushing Yards']); o.rusTD = num(r['Rushing TDs']); o.rusLng = num(r['Longest Rushing Run']); o.fmb = (o.fmb || 0) + num(r.Fumbles);
  });
  addKaggle('Career_Stats_Receiving.csv', (o, r) => {
    o.rec = num(r.Receptions); o.recYds = num(r['Receiving Yards']); o.recTD = num(r['Receiving TDs']); o.recLng = num(r['Longest Reception']);
  });
  addKaggle('Career_Stats_Defensive.csv', (o, r) => {
    o.defInt = num(r.Ints); o.defIntYds = num(r['Int Yards']); o.defIntTD = num(r['Ints for TDs']); o.defSk = num(r.Sacks);
    o.defTckSolo = num(r['Solo Tackles']); o.defTckAst = num(r['Assisted Tackles']); o.defPssDef = num(r['Passes Defended']);
  });
  log('Kaggle 1966-77 player-season-team rows:', kag.size);

  // Wikipedia drafts (1950-1979).
  const drafts = loadWikiDrafts();
  const draftByName = new Map();
  for (const d of drafts) { const k = norm(d.name); if (!draftByName.has(k)) draftByName.set(k, []); draftByName.get(k).push(d); }
  const roundGroups = new Map();
  for (const d of drafts) { const k = `${d.year}|${d.league}|${d.round}`; if (!roundGroups.has(k)) roundGroups.set(k, []); roundGroups.get(k).push(d); }
  for (const g of roundGroups.values()) { g.sort((a, b) => (a.pick || 0) - (b.pick || 0)); g.forEach((d, i) => { d.roundPick = i + 1; }); }
  log('Wikipedia draft rows:', drafts.length);

  // Rosters 1966-1977.
  const newPlayers = [];
  let matched = 0;
  const playerSeasonTeams = new Map(); // pid -> Map(season -> Map(tid -> info))
  for (let y = NEW_FIRST; y < OLD_FIRST; y++) {
    const rows = parseCSVFile(path.join(CACHE, 'rosters', `roster_${y}.csv`));
    for (const r of rows) {
      const tid = ROSTER_CODE_TID[r.team];
      if (tid === undefined || !r.full_name) continue;
      const k = norm(r.full_name);
      const birthYear = r.birth_date ? parseInt(r.birth_date.slice(0, 4), 10) : 0;
      let p = null;
      for (const c of byName.get(k) || []) {
        const cb = c.born && c.born.year;
        const firstSeason = Math.min(...(c.stats || []).map(s => s.season).concat([9999]));
        if (birthYear && cb && Math.abs(cb - birthYear) <= 1) { p = c; break; }
        if ((!birthYear || !cb) && firstSeason >= y && firstSeason <= y + 15) { p = c; break; }
        if (c._new && firstSeason <= y && (!birthYear || !cb)) { p = c; break; }
      }
      if (p) matched++;
      else {
        const last = r.last_name || r.full_name.split(' ').slice(-1)[0];
        const first = r.full_name.endsWith(last) ? r.full_name.slice(0, r.full_name.length - last.length).trim() : (r.first_name || '');
        p = {
          pid: ++maxPid, firstName: first, lastName: last, tid: -3, pos: normalizePos(r.position || r.depth_chart_position || 'OL'),
          hgt: num(r.height) || 73, weight: num(r.weight) || 220,
          born: { year: birthYear || (y - 23), loc: '' }, college: r.college || '', imgURL: r.headshot_url || '',
          jerseyNumber: r.jersey_number && r.jersey_number !== '0' ? String(r.jersey_number) : undefined,
          moodTraits: ['L'], hof: false, contract: { amount: 0, exp: y }, salaries: [],
          draft: { round: 0, pick: 0, tid: -1, originalTid: -1, year: y - 1 },
          ratings: [], stats: [], statsTids: [], awards: [], transactions: [], injury: { type: 'Healthy', gamesRemaining: 0 },
          _new: true
        };
        if (p.jerseyNumber === undefined) delete p.jerseyNumber;
        newPlayers.push(p);
        index(p);
      }
      if (!playerSeasonTeams.has(p.pid)) playerSeasonTeams.set(p.pid, new Map());
      const m = playerSeasonTeams.get(p.pid);
      if (!m.has(y)) m.set(y, new Map());
      m.get(y).set(tid, { jersey: r.jersey_number });
      if (!p._rosterPos) p._rosterPos = {};
      p._rosterPos[y] = r.position;
    }
  }
  log('1966-77 roster rows matched to existing players:', matched, '| new players:', newPlayers.length);

  // A new 1966-77 record whose career ends right where a same-named existing player's
  // begins is the same person (birth dates disagree between sources): merge them.
  let mergedCareers = 0;
  for (const np of newPlayers) {
    const nSeasons = [...(playerSeasonTeams.get(np.pid) || new Map()).keys()];
    if (!nSeasons.length) continue;
    const nLast = Math.max(...nSeasons);
    const cand = (byName.get(norm(`${np.firstName} ${np.lastName}`)) || []).find(c => {
      if (c === np || c._new || removePids.has(c.pid)) return false;
      const cs = (c.stats || []).filter(s => !s.playoffs).map(s => s.season);
      if (!cs.length) return false;
      const cFirst = Math.min(...cs);
      return cFirst >= nLast && cFirst <= nLast + 2 && !nSeasons.some(y => cs.includes(y));
    });
    if (!cand) continue;
    const m = playerSeasonTeams.get(np.pid);
    if (!playerSeasonTeams.has(cand.pid)) playerSeasonTeams.set(cand.pid, new Map());
    for (const [y, teams] of m) playerSeasonTeams.get(cand.pid).set(y, teams);
    cand._rosterPos = Object.assign({}, np._rosterPos, cand._rosterPos);
    playerSeasonTeams.delete(np.pid);
    np._mergedInto = cand.pid;
    const same = byName.get(norm(`${np.firstName} ${np.lastName}`));
    same.splice(same.indexOf(np), 1);
    mergedCareers++;
  }
  for (let i = newPlayers.length - 1; i >= 0; i--) if (newPlayers[i]._mergedInto) newPlayers.splice(i, 1);
  log('Merged split careers:', mergedCareers);
  const allPlayers = players.filter(p => !removePids.has(p.pid)).concat(newPlayers);
  const pidMap = new Map(allPlayers.map(p => [p.pid, p]));

  // Kaggle rows for players not on an nflverse roster that season/team.
  for (const k of kag.keys()) {
    const [n, y, t] = k.split('|');
    const cands = byName.get(n) || [];
    let p = cands.find(c => playerSeasonTeams.get(c.pid) && playerSeasonTeams.get(c.pid).has(+y));
    if (!p) p = cands.find(c => (c.stats || []).some(s => Math.abs(s.season - +y) <= 3));
    if (!p) continue;
    if (!playerSeasonTeams.has(p.pid)) playerSeasonTeams.set(p.pid, new Map());
    const m = playerSeasonTeams.get(p.pid);
    if (!m.has(+y)) m.set(+y, new Map());
    if (!m.get(+y).has(+t)) m.get(+y).set(+t, { jersey: '' });
  }

  // Build stat rows.
  let statRows = 0;
  for (const [pid, seasons] of playerSeasonTeams) {
    const p = pidMap.get(pid);
    const n = norm(`${p.firstName} ${p.lastName}`);
    for (const [y, teams] of seasons) {
      for (const [tid, info] of teams) {
        if ((p.stats || []).some(s => s.season === y && s.tid === tid && !s.playoffs)) continue;
        const row = zeroStatRow(template);
        row.playoffs = false; row.season = y; row.tid = tid;
        row.jerseyNumber = info.jersey && info.jersey !== '0' ? String(info.jersey) : (p.jerseyNumber || '');
        const k = kag.get(kKey(n, y, tid));
        if (k) for (const [kk, v] of Object.entries(k)) if (row[kk] !== undefined) row[kk] = v;
        p.stats.push(row);
        statRows++;
      }
    }
    p.stats.sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0));
  }
  log('Added 1966-77 stat rows:', statRows);

  // Wikipedia "career statistics" tables (data_cache/wiki_players) fill stats that are
  // still empty for 1966-1998: kicking, punting, returns, defense, and missing stars.
  const WIKI_CODE = { ARI: [0], PHO: [0], STL: [0, 18], ATL: [1], BAL: [13, 2], BUF: [3], CAR: [4], CHI: [5], CIN: [6], CLE: [7], DAL: [8], DEN: [9],
    DET: [10], GB: [11], GNB: [11], HOU: [30, 12], IND: [13], JAX: [14], JAC: [14], KC: [15], KAN: [15], OAK: [16], RAI: [16], LV: [16], LVR: [16],
    SD: [17], SDG: [17], LAC: [17], LA: [18, 16], LAR: [18], RAM: [18], LARM: [18], LARD: [16], MIA: [19], MIN: [20], NE: [21], NWE: [21], BOS: [21],
    NO: [22], NOR: [22], NYG: [23], NYJ: [24], PHI: [25], PIT: [26], SF: [27], SFO: [27], SEA: [28], TB: [29], TAM: [29], TEN: [30], WAS: [31], WSH: [31] };
  const { parseCareerStats } = require('./wiki_player_stats');
  const wikiDir = path.join(CACHE, 'wiki_players');
  let wikiRows = 0, wikiFields = 0, wikiPlayers = 0;
  if (fs.existsSync(wikiDir)) {
    for (const f of fs.readdirSync(wikiDir)) {
      const w = JSON.parse(fs.readFileSync(path.join(wikiDir, f), 'utf8'));
      if (w.missing || !w.wikitext) continue;
      const p = (byName.get(norm(w.name)) || []).find(c => !c._mergedInto && c.born && Math.abs(c.born.year - w.born) <= 1);
      if (!p) continue;
      let touched = false;
      for (const r of parseCareerStats(w.wikitext)) {
        if (r.season < NEW_FIRST || r.season > 1998) continue;
        const code = String(r.team).toUpperCase().replace(/[^A-Z]/g, '');
        let cands = WIKI_CODE[code] || [tidFromFullName(r.team)].filter(t => t >= 0);
        if (!cands.length) continue; // college / other-league rows
        const ps = playerSeasonTeams.get(p.pid);
        const onRoster = (t) => (p.stats || []).some(s => s.season === r.season && s.tid === t && !s.playoffs) || (ps && ps.get(r.season) && ps.get(r.season).has(t));
        const tid = cands.find(onRoster) ?? cands.find(t => E.isActive(t, r.season));
        if (tid === undefined) continue;
        let row = p.stats.find(s => s.season === r.season && s.tid === tid && !s.playoffs);
        if (!row) {
          row = zeroStatRow(template);
          Object.assign(row, { playoffs: false, season: r.season, tid, jerseyNumber: p.jerseyNumber || '' });
          p.stats.push(row);
          wikiRows++;
        }
        for (const [k, v] of Object.entries(r.stats)) {
          if (row[k] === undefined || typeof v !== 'number') continue;
          if (!row[k]) { row[k] = k === 'pssSkYds' ? Math.abs(v) : v; wikiFields++; touched = true; }
        }
      }
      if (touched) { wikiPlayers++; p.stats.sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0)); }
    }
  }
  log('Wikipedia stat tables merged:', wikiPlayers, 'players |', wikiFields, 'fields |', wikiRows, 'new rows');

  // Pro-Football-Reference season pages (Internet Archive snapshots, data_cache/pfr_wayback)
  // are the most complete 1966-1998 source: they overwrite the patchier stats above.
  const pfrTid = (code, season) => {
    const c = String(code).toUpperCase();
    if (c === 'BAL') return season <= 1983 ? 13 : 2;
    if (c === 'HOU') return season <= 1996 ? 30 : 12;
    if (c === 'STL') return season <= 1987 ? 0 : 18;
    if (c === 'LAR' || c === 'RAM' || c === 'LA') return 18;
    const m = { ATL: 1, BOS: 21, NWE: 21, NE: 21, BUF: 3, CAR: 4, CHI: 5, CIN: 6, CLE: 7, DAL: 8, DEN: 9, DET: 10, GNB: 11, GB: 11, IND: 13, JAX: 14,
      KAN: 15, KC: 15, OAK: 16, RAI: 16, LVR: 16, SDG: 17, SD: 17, LAC: 17, PHO: 0, ARI: 0, MIA: 19, MIN: 20, NOR: 22, NO: 22, NYG: 23, NYJ: 24,
      PHI: 25, PIT: 26, SFO: 27, SF: 27, SEA: 28, TAM: 29, TB: 29, TEN: 30, OTI: 30, WAS: 31 };
    return m[c] === undefined ? -1 : m[c];
  };
  const { loadPfrSeasons } = require('./pfr_wayback_stats');
  const pfr = loadPfrSeasons();
  let pfrRows = 0, pfrNewRows = 0, pfrNewPlayers = 0, pfrUnknownTeam = 0;
  const pfrPlayer = new Map(); // pfrId -> player (same person across seasons)
  const pfrEntries = [...pfr.values()].sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0));
  for (const e of pfrEntries) {
    if (e.season < NEW_FIRST || e.season > 1998) continue;
    const tid = pfrTid(e.team, e.season);
    if (tid < 0) { pfrUnknownTeam++; continue; }
    const bornGuess = e.age ? e.season - e.age : null;
    let p = pfrPlayer.get(e.pfrId);
    if (!p) {
      const cands = (byName.get(norm(e.name)) || []).filter(c => !c._mergedInto && (!bornGuess || !c.born || Math.abs(c.born.year - bornGuess) <= 1));
      const has = (c, fn) => (c.stats || []).some(s => !s.playoffs && s.season === e.season && fn(s)) || (playerSeasonTeams.get(c.pid) && playerSeasonTeams.get(c.pid).has(e.season));
      p = cands.find(c => has(c, s => s.tid === tid)) || cands.find(c => has(c, () => true)) || cands[0];
      if (!p) {
        const parts = e.name.split(' ');
        p = {
          pid: ++maxPid, firstName: parts.slice(0, -1).join(' ') || e.name, lastName: parts.length > 1 ? parts[parts.length - 1] : '', tid: -3,
          pos: normalizePos(e.pos || 'OL'), hgt: 73, weight: 220, born: { year: bornGuess || e.season - 24, loc: '' }, college: '', imgURL: '',
          moodTraits: ['L'], hof: false, contract: { amount: 0, exp: e.season }, salaries: [],
          draft: { round: 0, pick: 0, tid: -1, originalTid: -1, year: e.season - 1 },
          ratings: [], stats: [], statsTids: [], awards: [], transactions: [], injury: { type: 'Healthy', gamesRemaining: 0 }, _new: true
        };
        allPlayers.push(p); pidMap.set(p.pid, p); index(p);
        pfrNewPlayers++;
      }
      pfrPlayer.set(e.pfrId, p);
    }
    let row = p.stats.find(s => s.season === e.season && s.tid === tid && !!s.playoffs === e.playoffs);
    if (!row) {
      row = zeroStatRow(template);
      Object.assign(row, { playoffs: e.playoffs, season: e.season, tid, jerseyNumber: p.jerseyNumber || '' });
      p.stats.push(row);
      pfrNewRows++;
    }
    for (const [k, v] of Object.entries(e.stats)) if (row[k] !== undefined) row[k] = v;
    if (!e.playoffs && e.season < OLD_FIRST) {
      if (!playerSeasonTeams.has(p.pid)) playerSeasonTeams.set(p.pid, new Map());
      const m = playerSeasonTeams.get(p.pid);
      if (!m.has(e.season)) m.set(e.season, new Map());
      if (!m.get(e.season).has(tid)) m.get(e.season).set(tid, { jersey: '' });
    }
    if (!e.playoffs && p._new) {
      if (!p._rosterPos) p._rosterPos = {};
      p._rosterPos[e.season] = e.pos;
      // Players new to the league from 1978 on still need ratings for those seasons.
      if (!playerSeasonTeams.has(p.pid)) playerSeasonTeams.set(p.pid, new Map());
      const m = playerSeasonTeams.get(p.pid);
      if (!m.has(e.season)) m.set(e.season, new Map([[tid, { jersey: '' }]]));
    }
    pfrRows++;
  }
  for (const p of allPlayers) if (p.stats) p.stats.sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0));
  log('Pro-Football-Reference rows merged:', pfrRows, '| new rows:', pfrNewRows, '| new players:', pfrNewPlayers, '| unknown team codes:', pfrUnknownTeam);

  // Pro-Football-Reference team roster pages: games played/started, jersey numbers,
  // exact birth years, size, college and Approximate Value for every 1966-1998 player.
  const { loadRosters, loadDrafts, loadTeamStats } = require('./pfr_pages');
  const FRANCHISE = ['crd', 'atl', 'rav', 'buf', 'car', 'chi', 'cin', 'cle', 'dal', 'den', 'det', 'gnb', 'htx', 'clt', 'jax', 'kan', 'rai', 'sdg', 'ram',
    'mia', 'min', 'nwe', 'nor', 'nyg', 'nyj', 'phi', 'pit', 'sfo', 'sea', 'tam', 'oti', 'was'];
  const avBySeason = new Map(); // `${pid}|${season}` -> Approximate Value
  let rosterRows = 0, rosterNew = 0;
  for (const r of loadRosters().sort((a, b) => a.season - b.season)) {
    if (r.season > 1998) continue;
    const tid = FRANCHISE.indexOf(r.code);
    if (tid < 0) continue;
    let p = pfrPlayer.get(r.pfrId);
    if (!p) {
      const cands = (byName.get(norm(r.name)) || []).filter(c => !c._mergedInto && (!r.born || !c.born || Math.abs(c.born.year - r.born) <= 1));
      const has = (c) => (c.stats || []).some(s => !s.playoffs && s.season === r.season && s.tid === tid);
      p = cands.filter(has).sort((x, y) => Math.abs(x.born.year - r.born) - Math.abs(y.born.year - r.born))[0]
        || cands.sort((x, y) => Math.abs(x.born.year - r.born) - Math.abs(y.born.year - r.born))[0];
    }
    if (!p) {
      const parts = r.name.split(' ');
      p = {
        pid: ++maxPid, firstName: parts.slice(0, -1).join(' ') || r.name, lastName: parts.length > 1 ? parts[parts.length - 1] : '', tid: -3,
        pos: normalizePos(r.pos || 'OL'), hgt: r.hgt || 73, weight: r.weight || 220, born: { year: r.born || r.season - (r.age || 24), loc: '' },
        college: r.college || '', imgURL: '', moodTraits: ['L'], hof: false, contract: { amount: 0, exp: r.season }, salaries: [],
        draft: { round: 0, pick: 0, tid: -1, originalTid: -1, year: r.season - 1 },
        ratings: [], stats: [], statsTids: [], awards: [], transactions: [], injury: { type: 'Healthy', gamesRemaining: 0 }, _new: true, _rosterPos: {}
      };
      allPlayers.push(p); pidMap.set(p.pid, p); index(p);
      rosterNew++;
    }
    pfrPlayer.set(r.pfrId, p);
    let row = p.stats.find(s => s.season === r.season && s.tid === tid && !s.playoffs);
    if (!row) {
      row = zeroStatRow(template);
      Object.assign(row, { playoffs: false, season: r.season, tid, jerseyNumber: '' });
      p.stats.push(row);
    }
    if (r.g !== undefined) row.gp = r.g;
    if (r.gs !== undefined) row.gs = r.gs;
    if (r.av !== undefined) { row.av = r.av; avBySeason.set(`${p.pid}|${r.season}`, (avBySeason.get(`${p.pid}|${r.season}`) || 0) + r.av); }
    if (/^\d+$/.test(r.number)) { row.jerseyNumber = r.number; p.jerseyNumber = r.number; }
    if (r.born) p.born.year = r.born;
    if (r.hgt && (!p.hgt || p.hgt === 73 || p._new)) p.hgt = r.hgt;
    if (r.weight && (!p.weight || p.weight === 220 || p._new)) p.weight = r.weight;
    if (r.college && !p.college) p.college = r.college;
    if (p._new) { p._rosterPos = p._rosterPos || {}; p._rosterPos[r.season] = r.pos; }
    if (r.season < OLD_FIRST || p._new) {
      if (!playerSeasonTeams.has(p.pid)) playerSeasonTeams.set(p.pid, new Map());
      const m = playerSeasonTeams.get(p.pid);
      if (!m.has(r.season)) m.set(r.season, new Map());
      if (!m.get(r.season).has(tid)) m.get(r.season).set(tid, { jersey: r.number });
    }
    rosterRows++;
  }
  for (const p of allPlayers) if (p.stats) p.stats.sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0));
  log('Roster pages merged:', rosterRows, 'player-seasons |', rosterNew, 'players added');

  // Pro-Football-Reference draft pages are the authoritative 1966-1998 draft record.
  const draftRows = loadDrafts();
  const roundSeq = new Map();
  for (const d of draftRows.slice().sort((a, b) => a.overall - b.overall)) {
    const k = `${d.year}|${d.league}|${d.round}`;
    roundSeq.set(k, (roundSeq.get(k) || 0) + 1);
    d.roundPick = roundSeq.get(k);
  }
  let pfrDrafts = 0;
  for (const d of draftRows) {
    if (d.year > 1998) continue;
    let p = pfrPlayer.get(d.pfrId);
    if (!p) {
      const cands = (byName.get(norm(d.name)) || []).filter(c => (c.stats || []).some(s => s.season >= d.year && s.season <= d.year + 3));
      if (cands.length === 1) p = cands[0];
    }
    if (!p) continue;
    const tid = pfrTid(d.code, d.year);
    if (tid < 0) continue;
    // A player picked in both the 1966 AFL and NFL drafts keeps the pick of the team he played for.
    if (p.draft && p.draft.round > 0 && p.draft.year === d.year && p.draft._pfr && !(p.stats || []).some(s => s.tid === tid)) continue;
    p.draft = { round: d.round, pick: d.roundPick, tid, originalTid: tid, year: d.year, _pfr: true };
    pfrDrafts++;
  }
  for (const p of allPlayers) if (p.draft) delete p.draft._pfr;
  log('Draft pages applied:', pfrDrafts);

  // Awards maps (1966+).
  const AW = loadAllAwardsData();
  const findPlayer = (name, season) => {
    const cands = byName.get(norm(name)) || [];
    return cands.find(c => (c.stats || []).some(s => s.season === season)) || null;
  };
  const tidIn = (p, season) => { const s = (p.stats || []).find(x => x.season === season && !x.playoffs); return s ? s.tid : -1; };

  // Ratings for 1966-1977 seasons (from production, honours, career length).
  const hofYears = loadHofYears();
  const honours = new Map(); // pid|season -> 'mvp'|'ap1'|'ap2'|'pb'
  const rank = { mvp: 4, ap1: 3, ap2: 2, pb: 1 };
  const markHonour = (name, season, h) => { const p = findPlayer(name, season); if (p) { const k = `${p.pid}|${season}`; const cur = honours.get(k); if (!cur || rank[h] > rank[cur]) honours.set(k, h); } };
  for (let y = NEW_FIRST; y < OLD_FIRST; y++) {
    for (const n of AW.mvpMap.get(y) || []) markHonour(n, y, 'mvp');
    for (const o of AW.allProFirst.get(y) || []) markHonour(o.name, y, 'ap1');
    for (const o of AW.allProSecond.get(y) || []) markHonour(o.name, y, 'ap2');
    for (const o of AW.proBowlBySeason.get(y) || []) markHonour(o.name, y, 'pb');
  }
  const proxyAV = (s, honour, careerLen, isHof) => {
    let av = 0;
    av += (s.pssYds || 0) / 260 + (s.pssTD || 0) * 0.45 - (s.pssInt || 0) * 0.35;
    av += ((s.rusYds || 0) + (s.recYds || 0)) / 110 + ((s.rusTD || 0) + (s.recTD || 0)) * 0.45;
    av += (s.defInt || 0) * 0.9 + (s.defSk || 0) * 0.6;
    if (av < 1) av = careerLen >= 10 ? 7 : careerLen >= 6 ? 5 : careerLen >= 3 ? 3 : 1.5;
    if (honour === 'pb') av = Math.max(av, 12);
    if (honour === 'ap2') av = Math.max(av, 13.5);
    if (honour === 'ap1') av = Math.max(av, 16);
    if (honour === 'mvp') av = Math.max(av, 19);
    if (isHof) av = Math.max(av + 2, 9);
    return Math.max(0, Math.min(22, Math.round(av * 10) / 10));
  };
  let ratingsAdded = 0;
  for (const [pid, seasons] of playerSeasonTeams) {
    const p = pidMap.get(pid);
    const careerLen = new Set((p.stats || []).filter(s => !s.playoffs).map(s => s.season)).size;
    const isHof = hofYears.has(norm(`${p.firstName} ${p.lastName}`));
    const years = [...seasons.keys()].sort((a, b) => b - a); // newest first
    let base = (p.ratings || []).slice().sort((a, b) => a.season - b.season)[0] || null;
    const order = base ? years : years.slice().reverse();
    const generated = [];
    for (const y of order) {
      if ((p.ratings || []).some(r => r.season === y)) continue;
      const rowsY = p.stats.filter(s => s.season === y && !s.playoffs);
      const agg = {};
      for (const s of rowsY) for (const k of ['pssYds', 'pssTD', 'pssInt', 'rusYds', 'recYds', 'rusTD', 'recTD', 'defInt', 'defSk']) agg[k] = (agg[k] || 0) + (s[k] || 0);
      const pos = base ? base.pos : normalizePos((p._rosterPos && p._rosterPos[y]) || p.pos);
      const honour = honours.get(`${pid}|${y}`);
      // Real Pro-Football-Reference Approximate Value when the roster pages have it.
      const realAV = avBySeason.get(`${pid}|${y}`);
      const produced = realAV !== undefined || (agg.pssYds || 0) + (agg.rusYds || 0) + (agg.recYds || 0) > 150 || (agg.defInt || 0) + (agg.defSk || 0) > 1;
      const av = realAV !== undefined ? Math.max(realAV, { mvp: 19, ap1: 16, ap2: 13.5, pb: 12 }[honour] || 0, isHof ? 9 : 0) : proxyAV(agg, honour, careerLen, isHof);
      const age = y - p.born.year;
      // Typical aging: young players improve, veterans decline.
      const growth = (a) => (a <= 24 ? 3 : a <= 26 ? 2 : a <= 29 ? 1 : a <= 31 ? 0 : a <= 33 ? -2 : -4);
      const backward = base && base.season > y;
      let r;
      if (base) {
        // Walking back in time from a known rating: production/honours set the level,
        // otherwise the player is a slightly less developed version of his later self.
        const aged = backward ? base.ovr - growth(age) : base.ovr + growth(age);
        let target = (produced || honour) ? Math.round(0.75 * avToOvr(av) + 0.25 * aged) : aged;
        if (pos === 'K' || pos === 'P') target = Math.min(target, 75);
        r = retarget(base, pos, Math.max(35, Math.min(95, target)), y, age);
      } else {
        r = generateRatingFromBaseOrAV(null, pos, p.hgt, y, age, av, 0, 0, p.draft.round);
      }
      generated.push(r);
      base = r;
      ratingsAdded++;
    }
    p.ratings = (p.ratings || []).concat(generated).sort((a, b) => a.season - b.season);
    if (p._new) p.pos = p.ratings[p.ratings.length - 1].pos;
  }
  log('Generated 1966-77 ratings:', ratingsAdded);

  // Draft info from Wikipedia for anyone whose career began before 1981 without real draft data.
  let draftFixed = 0;
  for (const p of allPlayers) {
    const first = Math.min(...(p.stats || []).map(s => s.season).concat([9999]));
    if (first > 1980 || (p.draft && p.draft.round > 0)) continue;
    // Careers already under way in 1966 can have been drafted any time before; others within six years (military service).
    const cands = (draftByName.get(norm(`${p.firstName} ${p.lastName}`)) || []).filter(d => d.year <= first && d.year >= (first === NEW_FIRST ? 1936 : first - 6));
    if (!cands.length) { if (p.draft) p.draft.year = first - 1; continue; }
    const playedFor = new Set((p.stats || []).map(s => s.tid));
    const college = norm(p.college);
    const score = (d) => (playedFor.has(tidFromFullName(d.team)) ? 2 : 0) + (college && norm(d.college).includes(college) ? 1 : 0);
    cands.sort((a, b) => score(b) - score(a) || b.year - a.year);
    const d = cands[0];
    const tid = tidFromFullName(d.team);
    p.draft = Object.assign({}, p.draft, { round: d.round, pick: d.roundPick, tid, originalTid: tid, year: d.year });
    if (!p.college && d.college) p.college = d.college;
    draftFixed++;
  }
  log('Draft info filled from Wikipedia:', draftFixed);

  // Player awards 1966-1977 + league award objects.
  // Same shapes Football GM writes itself.
  const AWARD_INDEX = { MVP: 0, OPOY: 1, DPOY: 2, OROY: 3, DROY: 4, FMVP: 5, ALL: 6 };
  const giveAward = (p, season, shortName, name, extra = {}) => { p.awards.push(Object.assign({ season, index: AWARD_INDEX[shortName], name, shortName, rank: 1 }, extra)); };
  const newLeagueAwards = [];
  for (let y = NEW_FIRST; y < OLD_FIRST; y++) {
    const a = JSON.parse(JSON.stringify(awardTemplate));
    a.season = y;
    const set = (short, list, label) => {
      const aw = a.awards.find(x => x.shortName === short);
      if (!aw) return;
      const ps = list.map(n => findPlayer(n, y)).filter(Boolean).slice(0, 1);
      aw.winner = ps.map(p => ({ pid: p.pid, tid: tidIn(p, y) }));
      if (short === 'FMVP' && aw.winner[0]) { aw.winner[0].statOverrides = { score: 0, keyStats: '' }; aw.group = { type: 'playoffSeries', tids: [-3, aw.winner[0].tid] }; }
      for (const p of ps) giveAward(p, y, short, label, short === 'MVP' ? { actAs: 'mvp' } : (short.endsWith('ROY') ? { actAs: 'roy' } : {}));
    };
    set('MVP', AW.mvpMap.get(y) || [], 'Most Valuable Player');
    set('OPOY', AW.opoyMap.get(y) || [], 'Offensive Player of the Year');
    set('DPOY', AW.dpoyMap.get(y) || [], 'Defensive Player of the Year');
    set('OROY', AW.oroyMap.get(y) || [], 'Offensive Rookie of the Year');
    set('DROY', AW.droyMap.get(y) || [], 'Defensive Rookie of the Year');
    set('FMVP', AW.fmvpMap.get(y) || [], 'Finals MVP');
    const all = a.awards.find(x => x.shortName === 'ALL');
    const t1 = (AW.allProFirst.get(y) || []).map(o => findPlayer(o.name, y)).filter(Boolean);
    const t2 = (AW.allProSecond.get(y) || []).map(o => findPlayer(o.name, y)).filter(Boolean);
    const entry = (p) => ({ pid: p.pid, tid: tidIn(p, y), pos: (p.ratings.find(r => r.season === y) || p).pos });
    if (all) all.winner = [t1.map(entry), t2.map(entry)];
    for (const p of t1) giveAward(p, y, 'ALL', 'All-League', { rank: 1, numTeams: 2 });
    for (const p of t2) giveAward(p, y, 'ALL', 'All-League', { rank: 2, numTeams: 2 });
    a.awards = a.awards.filter(x => x.shortName !== 'ALR' && Array.isArray(x.winner) && x.winner.length && (!Array.isArray(x.winner[0]) || x.winner[0].length));
    for (const o of AW.proBowlBySeason.get(y) || []) { const p = findPlayer(o.name, y); if (p && !p.awards.some(w => w.season === y && w.type === 'All-Star')) p.awards.push({ season: y, type: 'All-Star' }); }
    newLeagueAwards.push(a);
  }
  L.awards = newLeagueAwards.concat(L.awards).sort((a, b) => a.season - b.season);

  // Finalize new players: tid, retiredYear, contract, jersey, statsTids.
  for (const p of allPlayers) {
    p.statsTids = [...new Set((p.stats || []).map(s => s.tid))];
    if (p._new) {
      const regSeasons = (p.stats || []).filter(s => !s.playoffs);
      const last = Math.max(...(regSeasons.length ? regSeasons : p.stats).map(s => s.season));
      p.retiredYear = last + 1;
      p.tid = -3;
      const lastRow = regSeasons.filter(s => s.season === last).pop();
      if (!p.jerseyNumber && lastRow && lastRow.jerseyNumber) p.jerseyNumber = lastRow.jerseyNumber;
      p.contract = { amount: E.getRules(last).minContract, exp: last };
    }
    delete p._new; delete p._rosterPos;
  }

  // Same person entered twice: same name, same team in the same season, and either one
  // record's birth year is impossible (younger than 19 in his first season) or both list
  // the same college. Merge into the record with the believable birth year.
  const firstSeasonOf = (p) => Math.min(...(p.stats || []).filter(s => !s.playoffs).map(s => s.season).concat([9999]));
  const groups = new Map();
  for (const p of allPlayers) {
    if (!(p.stats || []).length) continue;
    const k = norm(`${p.firstName} ${p.lastName}`);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const gone = new Set();
  let personMerges = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (i === j || gone.has(a.pid) || gone.has(b.pid)) continue;
      const teamSeasons = new Set(a.stats.filter(s => !s.playoffs).map(s => `${s.season}|${s.tid}`));
      if (!b.stats.some(s => !s.playoffs && teamSeasons.has(`${s.season}|${s.tid}`))) continue;
      const bImpossible = firstSeasonOf(b) - b.born.year < 19, aImpossible = firstSeasonOf(a) - a.born.year < 19;
      const sameCollege = a.college && b.college && norm(a.college) === norm(b.college) && Math.abs(a.born.year - b.born.year) <= 1;
      if (!(bImpossible && !aImpossible) && !(sameCollege && a.pid < b.pid)) continue;
      // Merge b into a.
      for (const s of b.stats) {
        const t = a.stats.find(x => x.season === s.season && x.tid === s.tid && !!x.playoffs === !!s.playoffs);
        if (!t) { a.stats.push(s); continue; }
        for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && typeof t[k] === 'number' && !['season', 'tid'].includes(k) && v > t[k]) t[k] = v;
      }
      a.stats.sort((x, y) => x.season - y.season || (x.playoffs ? 1 : 0) - (y.playoffs ? 1 : 0));
      const rs = new Set(a.ratings.map(r => r.season));
      for (const r of b.ratings || []) if (!rs.has(r.season)) a.ratings.push(r);
      a.ratings.sort((x, y) => x.season - y.season);
      const aw = new Set(a.awards.map(w => `${w.season}|${w.shortName || w.type}|${w.rank || ''}`));
      for (const w of b.awards || []) if (!aw.has(`${w.season}|${w.shortName || w.type}|${w.rank || ''}`)) a.awards.push(w);
      const sal = new Set((a.salaries || []).map(s => s.season));
      for (const s of b.salaries || []) if (!sal.has(s.season)) (a.salaries = a.salaries || []).push(s);
      if (b.injuries) a.injuries = (a.injuries || []).concat(b.injuries);
      if ((!a.draft || !a.draft.round) && b.draft && b.draft.round) a.draft = b.draft;
      for (const k of ['college', 'jerseyNumber', 'imgURL']) if (!a[k] && b[k]) a[k] = b[k];
      if (!a.born.loc && b.born.loc) a.born.loc = b.born.loc;
      a.hof = a.hof || b.hof;
      if (b.tid >= -1 && a.tid < -1) a.tid = b.tid;
      gone.add(b.pid);
      personMerges++;
    }
  }
  for (let i = allPlayers.length - 1; i >= 0; i--) if (gone.has(allPlayers[i].pid)) allPlayers.splice(i, 1);
  for (const [k, arr] of byName) byName.set(k, arr.filter(p => !gone.has(p.pid)));
  log('Duplicate people merged:', personMerges);

  // =========================================================================
  // Era-consistent ratings for 1966-2000 (no Madden data): rank each player within his
  // position and season by Approximate Value + games started, then map that percentile
  // onto the 2001-2025 (Madden-based) OVR distribution for the same position. Smoothed
  // season to season, with honours as floors.
  // =========================================================================
  {
    const MADDEN_FROM = 2001, REBUILD_TO = 2000;
    const regBy = (p, y) => (p.stats || []).filter(s => !s.playoffs && s.season === y);
    const ratingAt = (p, y) => (p.ratings || []).find(r => r.season === y);
    // Modern OVR distribution per position (players who actually played).
    const modern = {};
    for (const p of allPlayers) for (const r of p.ratings || []) {
      if (r.season < MADDEN_FROM || r.season > 2025) continue;
      if (!regBy(p, r.season).some(s => s.gp > 0)) continue;
      (modern[r.pos] = modern[r.pos] || []).push(r.ovr);
    }
    for (const k of Object.keys(modern)) modern[k].sort((a, b) => a - b);
    const quantile = (pos, q) => { const a = modern[pos] || modern.OL; return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };
    const floorFor = (p, y) => {
      let f = 0;
      for (const a of p.awards || []) {
        if (a.season !== y) continue;
        if (a.shortName === 'MVP') f = Math.max(f, 88);
        else if (a.shortName === 'OPOY' || a.shortName === 'DPOY') f = Math.max(f, 85);
        else if (a.shortName === 'OROY' || a.shortName === 'DROY') f = Math.max(f, 72);
        else if (a.shortName === 'ALL') f = Math.max(f, a.rank === 1 ? 82 : 77);
        else if (a.type === 'All-Star') f = Math.max(f, 74);
      }
      return f;
    };
    // Production score per player-season, grouped by position.
    const groupsBy = new Map(); // `${season}|${pos}` -> [{p, score}]
    for (const p of allPlayers) {
      for (const r of p.ratings || []) {
        if (r.season > REBUILD_TO) continue;
        const rows = regBy(p, r.season);
        if (!rows.length) continue;
        const av = rows.reduce((a, s) => a + (s.av || 0), 0), gs = rows.reduce((a, s) => a + (s.gs || 0), 0), gp = rows.reduce((a, s) => a + (s.gp || 0), 0);
        const score = av + 0.25 * gs + 0.05 * gp;
        const k = `${r.season}|${r.pos}`;
        if (!groupsBy.has(k)) groupsBy.set(k, []);
        groupsBy.get(k).push({ p, r, score });
      }
    }
    const target = new Map(); // `${pid}|${season}` -> ovr
    for (const [k, arr] of groupsBy) {
      const pos = k.split('|')[1];
      arr.sort((a, b) => a.score - b.score);
      arr.forEach((x, i) => {
        // Mid-rank percentile among peers; non-contributors sit at the bottom of the scale.
        const q = arr.length > 1 ? i / (arr.length - 1) : 0.5;
        target.set(`${x.p.pid}|${x.r.season}`, x.score > 0 ? quantile(pos, q) : quantile(pos, 0.05));
      });
    }
    let rebuilt = 0;
    for (const p of allPlayers) {
      const rs = (p.ratings || []).slice().sort((a, b) => a.season - b.season);
      let prev = null;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (r.season > REBUILD_TO) { prev = r.ovr; continue; }
        const t = target.get(`${p.pid}|${r.season}`);
        if (t === undefined) { prev = r.ovr; continue; }
        let ovr = prev === null ? t : Math.round(0.65 * t + 0.35 * prev);
        ovr = Math.max(ovr, floorFor(p, r.season));
        if (p.hof) ovr = Math.max(ovr, Math.min(80, t + 4));
        if (r.pos === 'K' || r.pos === 'P') ovr = Math.min(ovr, 80);
        ovr = Math.max(25, Math.min(97, ovr));
        if (Math.abs(ovr - r.ovr) >= 1) {
          const nr = retarget(r, r.pos, ovr, r.season, r.season - p.born.year);
          const idx = p.ratings.indexOf(r);
          p.ratings[idx] = nr;
          rebuilt++;
        }
        prev = ovr;
      }
    }
    log('Ratings rebuilt on the modern scale (1966-2000):', rebuilt);
  }

  // =========================================================================
  // Position-appropriate ratings. Football GM's AI plays anyone wherever his position
  // OVR is highest, so off-position skills (a receiver's throwing power, a running back's
  // tackling) must be low or players drift to the wrong position. Then widen the OVR scale
  // so stars stand apart from starters and starters from backups.
  // =========================================================================
  {
    // Skills each position actually uses (from the position OVR formulas).
    const USES = {
      QB: ['tha', 'thp', 'thv', 'elu', 'bsc'], RB: ['elu', 'bsc', 'hnd', 'rtr', 'pbk', 'rbk'], WR: ['hnd', 'rtr', 'elu', 'bsc'],
      TE: ['hnd', 'rtr', 'pbk', 'rbk'], OL: ['pbk', 'rbk'], DL: ['prs', 'rns', 'tck'], LB: ['prs', 'rns', 'pcv', 'tck'],
      CB: ['pcv', 'tck', 'hnd'], S: ['pcv', 'tck', 'rns', 'hnd'], K: ['kpw', 'kac'], P: ['ppw', 'pac']
    };
    // Ceiling range for a skill a position does not use.
    const OFF = { tha: [5, 20], thp: [5, 20], thv: [5, 20], elu: [10, 30], bsc: [10, 30], hnd: [10, 30], rtr: [5, 20], pbk: [5, 20], rbk: [5, 20],
      prs: [5, 20], rns: [5, 22], pcv: [5, 22], tck: [10, 25], kpw: [5, 15], kac: [5, 15], ppw: [5, 15], pac: [5, 15] };
    // Receivers and tight ends block a little; defensive backs catch a little.
    const SPECIAL = { WR: { pbk: [10, 25], rbk: [10, 25] }, CB: { hnd: [25, 45] }, S: { hnd: [25, 45] }, LB: { hnd: [15, 35] }, TE: { elu: [15, 35], bsc: [20, 40] } };
    const ceil = (pid, k, [lo, hi]) => lo + ((pid * 7919 + k.charCodeAt(0) * 104729 + k.charCodeAt(2 % k.length) * 131) % (hi - lo + 1));
    const spread = (o) => Math.max(20, Math.min(99, Math.round(o >= 70 ? 70 + (o - 70) * 1.4 : 70 - (70 - o) * 1.15)));
    let capped = 0;
    for (const p of allPlayers) {
      p.ratings = (p.ratings || []).map(r => {
        const pos = r.pos;
        const uses = new Set(USES[pos] || []);
        const raw = {};
        for (const k of RATING_KEYS) raw[k] = r[k];
        let changed = false;
        for (const k of Object.keys(OFF)) {
          if (uses.has(k) && !(pos === 'WR' && (k === 'elu' || k === 'bsc'))) continue;
          const range = (SPECIAL[pos] && SPECIAL[pos][k]) || (pos === 'WR' && (k === 'elu' || k === 'bsc') ? [40, 55] : OFF[k]);
          const c = ceil(p.pid, k, range);
          if (raw[k] > c) { raw[k] = c; changed = true; }
        }
        const target = spread(r.ovr);
        if (!changed && target === r.ovr && !['WR', 'TE', 'QB', 'DL', 'CB', 'S'].includes(pos)) return r;
        capped++;
        let out = finalizeRatingObject(raw, pos, r.season, r.season - p.born.year);
        if (out.ovr !== target) out = retarget(out, pos, target, r.season, r.season - p.born.year);
        // Receivers, tight ends and quarterbacks must not rate as better running backs
        // (or the AI hands them the ball): trim elusiveness/ball security until they don't.
        // Same idea for neighbouring positions: trim the skills only the other position uses.
        const AWAY = { WR: { RB: ['elu', 'bsc'], TE: ['pbk', 'rbk'] }, TE: { RB: ['elu', 'bsc'] }, QB: { RB: ['elu', 'bsc'] },
          DL: { LB: ['pcv'] }, CB: { S: ['tck', 'rns'] }, S: { LB: ['prs', 'rns'] } }[pos] || {};
        for (const [other, keys] of Object.entries(AWAY)) {
          for (let guard = 0; guard < 15 && out.ovrs[other] > out.ovr - 3 && keys.some(k => out[k] > 8); guard++) {
            const nr = {};
            for (const k of RATING_KEYS) nr[k] = out[k];
            for (const k of keys) nr[k] = Math.max(8, nr[k] - 4);
            out = finalizeRatingObject(nr, pos, r.season, r.season - p.born.year);
            if (out.ovr < target) out = retarget(out, pos, target, r.season, r.season - p.born.year);
          }
        }
        return out;
      });
    }
    log('Ratings made position-appropriate and spread:', capped);
  }

  // Every player must have ratings (Football GM reads ratings[last].ovrs on load). Players
  // known only from a playoff table get a rating for their first season.
  let fallbackRatings = 0;
  for (const p of allPlayers) {
    if (p.ratings && p.ratings.length) continue;
    const first = Math.min(...(p.stats || []).map(s => s.season).concat([p.draft ? p.draft.year + 1 : 2026]));
    p.ratings = [generateRatingFromBaseOrAV(null, normalizePos(p.pos || 'OL'), p.hgt, first, first - p.born.year, 2, 0, 0, 0)];
    p.pos = p.ratings[0].pos;
    fallbackRatings++;
  }
  log('Fallback ratings for players without any:', fallbackRatings);

  // Hall of Fame: flag inductees and record induction years for the season selector.
  const hofOut = {};
  for (const p of allPlayers) {
    const regs = (p.stats || []).filter(s => !s.playoffs);
    if (!regs.length) continue;
    const first = Math.min(...regs.map(s => s.season)), last = Math.max(...regs.map(s => s.season));
    const yr = hofYears.get(norm(`${p.firstName} ${p.lastName}`));
    if (yr && yr >= last + 3 && first <= yr) { hofOut[p.pid] = yr; p.hof = true; }
    else if (yr) p.hof = false; // same name, different player
    else if (p.hof && last < 2021) hofOut[p.pid] = Math.min(2026, last + 6); // modern inductee missing from the list parse
  }
  fs.writeFileSync(path.join(CACHE, 'hof_years.json'), JSON.stringify(hofOut));
  log('Hall of Famers matched:', Object.keys(hofOut).length, '| list size:', hofYears.size);

  // Major historical injuries (and deaths during careers) into player injury history.
  let injuriesAdded = 0;
  for (const [name, born, season, games, type, died] of E.HISTORICAL_INJURIES) {
    const p = (byName.get(norm(name)) || []).filter(c => !c._mergedInto && c.born && Math.abs(c.born.year - born) <= 1)
      .sort((x, y) => Math.abs(x.born.year - born) - Math.abs(y.born.year - born))[0];
    if (!p) { log('  injury: player not found', name); continue; }
    p.injuries = (p.injuries || []).filter(i => !(i.season === season && i.type === type));
    p.injuries.push({ season, games, type });
    p.injuries.sort((a, b) => a.season - b.season);
    if (died) p.diedYear = season;
    injuriesAdded++;
  }
  log('Historical injuries added:', injuriesAdded);

  // Bios for players added from 1966-1998 sources: birthplace, birth date, college, size,
  // jersey number from the NFL.com bio export (Kaggle Basic_Stats.csv).
  const bios = new Map();
  for (const r of parseCSVFile(path.join(CACHE, 'pre1999', 'Basic_Stats.csv'))) {
    const n = norm(kaggleName(r.Name));
    const by = parseInt(String(r.Birthday || '').split('/').pop(), 10);
    if (!bios.has(n)) bios.set(n, []);
    bios.get(n).push({ by, loc: String(r['Birth Place'] || '').replace(/\s+,/g, ',').trim(), college: r.College, hgt: num(r['Height (inches)']),
      weight: num(r['Weight (lbs)']), number: String(r.Number || '').trim(), years: String(r['Years Played'] || '') });
  }
  let bioFilled = 0;
  for (const p of allPlayers) {
    const first = Math.min(...(p.stats || []).map(s => s.season).concat([9999]));
    if (first > 1998) continue;
    const b = (bios.get(norm(`${p.firstName} ${p.lastName}`)) || []).find(x => (x.by && Math.abs(x.by - p.born.year) <= 1) || (!x.by && x.years.startsWith(String(first))));
    if (!b) continue;
    let did = false;
    if (!p.born.loc && b.loc) { p.born.loc = b.loc; did = true; }
    if ((!p.college || p.college === '') && b.college) { p.college = b.college; did = true; }
    if (b.hgt && (!p.hgt || (p.hgt === 73 && !p.imgURL))) { p.hgt = b.hgt; did = true; }
    if (b.weight && (!p.weight || p.weight === 220)) { p.weight = b.weight; did = true; }
    if (!p.jerseyNumber && /^\d+$/.test(b.number)) { p.jerseyNumber = b.number; did = true; }
    if (did) bioFilled++;
  }
  log('Bios filled from NFL.com export:', bioFilled);

  // Remaining impossible birth years: use the NFL.com birth date when it matches the career, else estimate.
  let bornFixed = 0;
  for (const p of allPlayers) {
    const first = firstSeasonOf(p);
    if (first === 9999 || first - p.born.year >= 19) continue;
    const bio = (bios.get(norm(`${p.firstName} ${p.lastName}`)) || []).find(x => x.by && first - x.by >= 19 && first - x.by <= 30);
    p.born.year = bio ? bio.by : first - 22;
    bornFixed++;
  }
  log('Impossible birth years fixed:', bornFixed);

  // Salary history: real figures where we have them (OverTheCap 2000+), otherwise an
  // era-scaled estimate from that season's rating so every season has a salary.
  let salariesAdded = 0;
  for (const p of allPlayers) {
    const have = new Set((p.salaries || []).map(s => s.season));
    const seasons = [...new Set((p.stats || []).filter(s => !s.playoffs).map(s => s.season))];
    for (const y of seasons) {
      if (have.has(y)) continue;
      const r = (p.ratings || []).filter(x => x.season <= y).pop() || (p.ratings || [])[0];
      if (!r) continue;
      const rules = E.getRules(y);
      const amount = Math.round(Math.max(rules.minContract, Math.min(rules.maxContract,
        rules.minContract + Math.max(0, r.ovr - 45) / 45 * (rules.maxContract - rules.minContract) * 0.6)));
      (p.salaries = p.salaries || []).push({ season: y, amount });
      salariesAdded++;
    }
    if (p.salaries) p.salaries.sort((a, b) => a.season - b.season);
    if (p.tid === -3 && p.salaries && p.salaries.length) {
      const lastSal = p.salaries[p.salaries.length - 1];
      p.contract = { amount: lastSal.amount, exp: lastSal.season };
    }
  }
  log('Estimated salary-history entries added:', salariesAdded);

  // Draft entries in league history (and player transactions) for drafts before 1977,
  // matching how the existing 1977+ entries are stored (season = draft year - 1).
  const draftedPids = new Set((L.events || []).filter(e => e.type === 'draft').flatMap(e => e.pids || []));
  let maxEid = Math.max(0, ...(L.events || []).map(e => e.eid || 0));
  let draftEvents = 0;
  for (const p of allPlayers) {
    const d = p.draft;
    if (!d || !d.round || d.tid < 0 || d.year >= 1977 || draftedPids.has(p.pid)) continue;
    const season = d.year - 1;
    const b = E.getTeamBranding(d.tid, Math.max(d.year, NEW_FIRST));
    const pickNum = (d.round - 1) * 26 + d.pick;
    const eid = ++maxEid;
    L.events.push({ eid, season, type: 'draft', pids: [p.pid], tids: [d.tid],
      text: `The <a href="/l/1/roster/${d.tid}/${season}">${b.name}</a> selected <a href="/l/1/player/${p.pid}">${p.firstName} ${p.lastName}</a> in round ${d.round} (pick ${pickNum}) of the ${d.year} draft.` });
    if (!(p.transactions || []).some(t => t.type === 'draft')) (p.transactions = p.transactions || []).unshift({ season, phase: 5, tid: d.tid, type: 'draft', pickNum, eid });
    draftEvents++;
  }
  log('Draft history entries added:', draftEvents);

  // Playoff rows wear the same number as that season's regular-season row for the team.
  for (const p of allPlayers) for (const s of p.stats || []) {
    if (!s.playoffs) continue;
    const reg = p.stats.find(x => !x.playoffs && x.season === s.season && x.tid === s.tid);
    if (reg && reg.jerseyNumber) s.jerseyNumber = reg.jerseyNumber;
  }

  // yearsWithTeam for all regular-season rows.
  for (const p of allPlayers) {
    const rows = (p.stats || []).filter(s => !s.playoffs).sort((a, b) => a.season - b.season);
    let prevTid = null, streak = 0, prevSeason = null;
    for (const s of rows) {
      if (s.tid === prevTid && prevSeason !== null && s.season - prevSeason <= 1) streak += (s.season === prevSeason ? 0 : 1); else streak = 1;
      s.yearsWithTeam = streak; prevTid = s.tid; prevSeason = s.season;
    }
  }
  L.players = allPlayers;

  // =========================================================================
  // 3. Team seasons 1966-1977 from game results, and branding for all seasons
  // =========================================================================
  const games = parseCSVFile(path.join(CACHE, 'spreadspoke_scores.csv'));
  const tsNew = new Map();
  const blankSeason = (tid, y) => {
    const b = E.getTeamBranding(tid, y); const a = E.getAlignment(y).teamDiv[tid];
    return { tid, cid: a.cid, did: a.did, region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall,
      colors: b.colors, jersey: b.jersey, pop: b.pop, stadiumCapacity: b.stadiumCapacity, season: y, gp: 0, gpHome: 0, att: 0, cash: 25000,
      won: 0, lost: 0, tied: 0, otl: 0, wonHome: 0, lostHome: 0, tiedHome: 0, otlHome: 0, wonAway: 0, lostAway: 0, tiedAway: 0, otlAway: 0,
      wonDiv: 0, lostDiv: 0, tiedDiv: 0, otlDiv: 0, wonConf: 0, lostConf: 0, tiedConf: 0, otlConf: 0, pts: 0, oppPts: 0, lastTen: [], streak: 0, playoffRoundsWon: -1 };
  };
  const playoffGames = [];
  for (const g of games) {
    const y = parseInt(g.schedule_season, 10);
    if (!(y >= NEW_FIRST && y < OLD_FIRST)) continue;
    const h = tidFromFullName(g.team_home), a = tidFromFullName(g.team_away);
    if (h < 0 || a < 0 || g.score_home === '') continue;
    const hs = num(g.score_home), as = num(g.score_away);
    if (g.schedule_playoff === 'TRUE') { playoffGames.push({ y, h, a, hs, as, week: g.schedule_week }); continue; }
    const align = E.getAlignment(y).teamDiv;
    for (const [tid, opp, pf, pa, home] of [[h, a, hs, as, true], [a, h, as, hs, false]]) {
      const k = `${tid}|${y}`;
      if (!tsNew.has(k)) tsNew.set(k, blankSeason(tid, y));
      const s = tsNew.get(k);
      const res = pf > pa ? 'won' : pf < pa ? 'lost' : 'tied';
      s.gp++; if (home) { s.gpHome++; s.att += Math.round(s.stadiumCapacity * 0.9); }
      s[res]++; s[res + (home ? 'Home' : 'Away')]++;
      if (align[tid].did === align[opp].did) s[res + 'Div']++;
      if (align[tid].cid === align[opp].cid) s[res + 'Conf']++;
      s.pts += pf; s.oppPts += pa;
      s.lastTen.push(res === 'won' ? 1 : res === 'lost' ? 0 : -1); if (s.lastTen.length > 10) s.lastTen.shift();
      s.streak = res === 'won' ? (s.streak > 0 ? s.streak + 1 : 1) : res === 'lost' ? (s.streak < 0 ? s.streak - 1 : -1) : 0;
    }
  }
  for (const g of playoffGames) {
    const R = E.getRules(g.y).numGamesPlayoffSeries.length;
    const round = g.week === 'Superbowl' ? R - 1 : g.week === 'Conference' ? R - 2 : R - 3;
    for (const [tid, won] of [[g.h, g.hs > g.as], [g.a, g.as > g.hs]]) {
      const s = tsNew.get(`${tid}|${g.y}`);
      if (s) s.playoffRoundsWon = Math.max(s.playoffRoundsWon, round + (won ? 1 : 0));
    }
  }
  for (const s of tsNew.values()) {
    const team = L.teams[s.tid];
    team.seasons = (team.seasons || []).filter(x => x.season !== s.season);
    team.seasons.push(s);
  }
  log('Team seasons added for 1966-77:', tsNew.size);

  // Super Bowl champions 1966-77: "Won Championship" for everyone on the roster.
  for (let y = NEW_FIRST; y < OLD_FIRST; y++) {
    const R = E.getRules(y).numGamesPlayoffSeries.length;
    const champ = [...tsNew.values()].find(s => s.season === y && s.playoffRoundsWon === R);
    if (!champ) continue;
    for (const p of allPlayers) if ((p.stats || []).some(s => s.season === y && s.tid === champ.tid && !s.playoffs) && !p.awards.some(a => a.season === y && a.type === 'Won Championship')) p.awards.push({ season: y, type: 'Won Championship' });
  }

  // Era branding + alignment for every stored team season and the 2026 team rows.
  for (const team of L.teams) {
    team.seasons.sort((a, b) => a.season - b.season);
    for (const s of team.seasons) {
      const b = E.getTeamBranding(team.tid, s.season); const a = E.getAlignment(s.season).teamDiv[team.tid];
      Object.assign(s, { region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall, colors: b.colors, jersey: b.jersey, cid: a.cid, did: a.did });
      if (!s.stadiumCapacity) s.stadiumCapacity = b.stadiumCapacity;
    }
    const b = E.getTeamBranding(team.tid, 2026); const a = E.getAlignment(2026).teamDiv[team.tid];
    Object.assign(team, { region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall, colors: b.colors, jersey: b.jersey, cid: a.cid, did: a.did, disabled: false });
    // srID would make Football GM replace this branding with its own built-in team info.
    delete team.srID;
  }

  // Team stat totals for seasons without them (1966-1977), summed from player stats.
  const teamStatTemplate = L.teams.find(t => (t.stats || []).length).stats[0];
  const aggTeam = new Map();
  for (const p of allPlayers) {
    for (const s of p.stats || []) {
      if (s.season >= OLD_FIRST || s.tid < 0) continue;
      const k = `${s.tid}|${s.season}|${!!s.playoffs}`;
      if (!aggTeam.has(k)) aggTeam.set(k, Object.assign(zeroStatRow(teamStatTemplate), { playoffs: !!s.playoffs, season: s.season, tid: s.tid }));
      const t = aggTeam.get(k);
      for (const [kk, v] of Object.entries(s)) {
        if (typeof v !== 'number' || t[kk] === undefined || ['season', 'tid', 'gp', 'min', 'pts', 'jerseyNumber', 'yearsWithTeam'].includes(kk)) continue;
        if (/Lng$/.test(kk)) t[kk] = Math.max(t[kk], v); else t[kk] += v;
      }
    }
  }
  let teamStatRows = 0;
  for (const t of aggTeam.values()) {
    const team = L.teams[t.tid];
    const ts = team.seasons.find(x => x.season === t.season);
    if (!ts || (team.stats || []).some(x => x.season === t.season && !!x.playoffs === t.playoffs)) continue;
    if (t.playoffs) {
      const pg = playoffGames.filter(g => g.y === t.season).filter(g => g.h === t.tid || g.a === t.tid);
      t.gp = pg.length; t.pts = pg.reduce((a, g) => a + (g.h === t.tid ? g.hs : g.as), 0); t.oppPts = pg.reduce((a, g) => a + (g.h === t.tid ? g.as : g.hs), 0);
    } else { t.gp = ts.gp; t.pts = ts.pts; t.oppPts = ts.oppPts; }
    t.min = t.gp * 60;
    team.stats.push(t);
    teamStatRows++;
  }
  for (const team of L.teams) team.stats.sort((a, b) => a.season - b.season || (a.playoffs ? 1 : 0) - (b.playoffs ? 1 : 0));
  log('Team stat rows added for 1966-77:', teamStatRows);

  // Official team and opponent totals from Pro-Football-Reference team pages (1966-1998).
  const teamPages = loadTeamStats();
  let teamPageRows = 0;
  for (const team of L.teams) {
    for (const row of team.stats || []) {
      if (row.playoffs || row.season > 1998) continue;
      const tp = teamPages.get(`${row.season}|${FRANCHISE[team.tid]}`);
      if (!tp) continue;
      for (const [k, v] of Object.entries(tp.team || {})) if (row[k] !== undefined) row[k] = v;
      for (const [k, v] of Object.entries(tp.opp || {})) { const ok = 'opp' + k[0].toUpperCase() + k.slice(1); if (row[ok] !== undefined) row[ok] = v; }
      teamPageRows++;
    }
  }
  log('Team pages applied (team + opponent totals):', teamPageRows);

  // Playoff brackets for every completed season, rebuilt from real game results.
  const seasonRow = new Map();
  for (const team of L.teams) for (const s of team.seasons) seasonRow.set(`${team.tid}|${s.season}`, s);
  const pgBySeason = new Map();
  for (const g of games) {
    if (g.schedule_playoff !== 'TRUE' || g.score_home === '') continue;
    const y = parseInt(g.schedule_season, 10);
    const h = tidFromFullName(g.team_home), a = tidFromFullName(g.team_away);
    if (!(y >= NEW_FIRST && y <= 2025) || h < 0 || a < 0) continue;
    if (!pgBySeason.has(y)) pgBySeason.set(y, []);
    pgBySeason.get(y).push({ h, a, hs: num(g.score_home), as: num(g.score_away), week: g.schedule_week });
  }
  const winp = (s) => (s.won + 0.5 * s.tied) / Math.max(1, s.won + s.lost + s.tied);
  const newSeries = [];
  for (const [y, pgs] of pgBySeason) {
    const R = E.getRules(y).numGamesPlayoffSeries.length;
    const align = E.getAlignment(y).teamDiv;
    const roundOf = (w) => (w === 'Superbowl' ? R - 1 : w === 'Conference' ? R - 2 : w === 'Wildcard' ? R - 4 : R - 3);
    for (const g of pgs) g.round = roundOf(g.week);
    if (pgs.some(g => g.round < 0)) continue;
    const firstRound = new Map();
    for (const g of pgs) for (const t of [g.h, g.a]) firstRound.set(t, Math.min(firstRound.has(t) ? firstRound.get(t) : 99, g.round));
    // Seeds per conference: division winners first, then wild cards, by record.
    const seed = new Map();
    for (const cid of [0, 1]) {
      const teams = [...firstRound.keys()].filter(t => align[t].cid === cid).map(t => ({ t, s: seasonRow.get(`${t}|${y}`) })).filter(x => x.s);
      const divBest = new Map();
      for (const x of teams) { const d = align[x.t].did; if (!divBest.has(d) || winp(x.s) > winp(divBest.get(d).s)) divBest.set(d, x); }
      const winners = new Set([...divBest.values()].map(x => x.t));
      teams.sort((p, q) => (winners.has(q.t) - winners.has(p.t)) || (winp(q.s) - winp(p.s)));
      teams.forEach((x, i) => seed.set(x.t, i + 1));
    }
    const side = (t, pts, won) => Object.assign({ tid: t, cid: align[t].cid, seed: seed.get(t) || 9, won: won ? 1 : 0 }, pts === undefined ? {} : { pts });
    const matchup = (t, r) => {
      const g = pgs.find(x => x.round === r && (x.h === t || x.a === t));
      if (g) return { home: side(g.h, g.hs, g.hs > g.as), away: side(g.a, g.as, g.as > g.hs) };
      if (r === 0 && firstRound.get(t) > 0) return { home: side(t, undefined, false) };
      return null;
    };
    const series = Array.from({ length: R }, () => []);
    const final = pgs.find(g => g.round === R - 1);
    if (!final) continue;
    series[R - 1] = [matchup(final.h, R - 1)];
    for (let r = R - 2; r >= 0; r--) {
      for (const m of series[r + 1]) {
        for (const t of [m.home.tid, m.away && m.away.tid]) {
          if (t === undefined) continue;
          const prev = matchup(t, r);
          if (prev) series[r].push(prev);
        }
      }
    }
    newSeries.push({ season: y, currentRound: R - 1, byConf: 2, series });
  }
  L.playoffSeries = newSeries.sort((a, b) => a.season - b.season);
  log('Playoff brackets rebuilt:', newSeries.length);

  // Playoff rounds won for every team season, taken from the brackets (a bye counts as a round).
  for (const ps of L.playoffSeries) {
    const prw = new Map();
    ps.series.forEach((round, r) => {
      for (const m of round) {
        if (!m.away) { prw.set(m.home.tid, Math.max(prw.get(m.home.tid) ?? -1, r + 1)); continue; }
        const homeWon = m.home.won > m.away.won;
        prw.set(m.home.tid, Math.max(prw.get(m.home.tid) ?? -1, r + (homeWon ? 1 : 0)));
        prw.set(m.away.tid, Math.max(prw.get(m.away.tid) ?? -1, r + (homeWon ? 0 : 1)));
      }
    });
    for (const team of L.teams) {
      const s = seasonRow.get(`${team.tid}|${ps.season}`);
      if (s) s.playoffRoundsWon = prw.has(team.tid) ? prw.get(team.tid) : -1;
    }
  }

  // 1985-1987 Cardinals/Rams records were crossed in the original build: rebuild them from
  // game results (1987's three replacement-player games are missing from that source, so
  // the official full-season totals are applied on top).
  for (const y of [1985, 1986, 1987]) {
    const align = E.getAlignment(y).teamDiv;
    for (const tid of [0, 18]) {
      const s = seasonRow.get(`${tid}|${y}`);
      if (!s) continue;
      for (const k of Object.keys(s)) if (/^(won|lost|tied|otl)(Home|Away|Div|Conf)?$/.test(k) || ['gp', 'gpHome', 'pts', 'oppPts', 'att'].includes(k)) s[k] = 0;
      s.lastTen = []; s.streak = 0;
      for (const g of games) {
        if (+g.schedule_season !== y || g.schedule_playoff === 'TRUE' || g.score_home === '') continue;
        const h = tidFromFullName(g.team_home), a = tidFromFullName(g.team_away);
        if (h !== tid && a !== tid) continue;
        const home = h === tid, opp = home ? a : h;
        const pf = num(home ? g.score_home : g.score_away), pa = num(home ? g.score_away : g.score_home);
        const res = pf > pa ? 'won' : pf < pa ? 'lost' : 'tied';
        s.gp++; s[res]++; s[res + (home ? 'Home' : 'Away')]++;
        if (home) { s.gpHome++; s.att += Math.round(s.stadiumCapacity * 0.9); }
        if (align[tid].did === align[opp].did) s[res + 'Div']++;
        if (align[tid].cid === align[opp].cid) s[res + 'Conf']++;
        s.pts += pf; s.oppPts += pa;
        s.lastTen.push(res === 'won' ? 1 : res === 'lost' ? 0 : -1); if (s.lastTen.length > 10) s.lastTen.shift();
      }
    }
  }
  const official1987 = { 0: { won: 7, lost: 8, pts: 362, oppPts: 368 }, 18: { won: 6, lost: 9, pts: 317, oppPts: 361 } };
  for (const [tid, o] of Object.entries(official1987)) { const s = seasonRow.get(`${tid}|1987`); if (s) Object.assign(s, o, { gp: 15 }); }

  // Pro Bowl rosters 1966-77 (Pro Bowl / AFL All-Star selections), split by conference.
  for (let y = NEW_FIRST; y < OLD_FIRST; y++) {
    const align = E.getAlignment(y);
    const teams = [[], []];
    for (const o of AW.proBowlBySeason.get(y) || []) {
      const p = findPlayer(o.name, y);
      if (!p) continue;
      const tid = tidIn(p, y);
      if (tid < 0) continue;
      teams[align.teamDiv[tid].cid].push({ pid: p.pid, tid, name: `${p.firstName} ${p.lastName}` });
    }
    if (teams[0].length + teams[1].length === 0) continue;
    L.allStars = (L.allStars || []).filter(a => a.season !== y);
    L.allStars.push({ season: y, teamNames: align.confs.map(c => c.name), teams, remaining: [], finalized: true, type: 'byConf' });
  }
  L.allStars.sort((a, b) => a.season - b.season);

  // Retired jersey numbers from Wikipedia's current list (replaces the older team lists).
  {
    const f = path.join(CACHE, 'awards', 'wiki_retired_numbers.json');
    if (fs.existsSync(f)) {
      const wt = JSON.parse(fs.readFileSync(f, 'utf8')).parse.wikitext['*'];
      const clean = (c) => c.replace(/^[^|]*?style="[^"]*"\s*\|/, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/g, '$1 $2')
        .replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/rowspan="?\d+"?\s*\|/, '').trim();
      const byTeam = new Map();
      let team = null, teamLeft = 0;
      for (const row of wt.split(/\n\|-/)) {
        const lines = row.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|}'));
        if (!lines.length) continue;
        const cells = lines.join('||').replace(/^\|/, '').split('||').map(s => s.trim());
        if (cells.length < 4) continue;
        const name = clean(cells[0]), number = clean(cells[1]);
        let i = 2;
        const tcell = cells[2];
        const rs = (tcell.match(/rowspan="?(\d+)/) || [])[1];
        if (rs || teamLeft <= 0 || /\[\[/.test(tcell)) {
          const tid = tidFromFullName(clean(tcell));
          if (tid >= 0) { team = tid; teamLeft = rs ? +rs : 1; i = 3; }
        }
        if (team === null || !/^\d+$/.test(number)) { teamLeft--; continue; }
        const tenure = clean(cells[i] || ''), year = parseInt(clean(cells[i + 1] || ''), 10);
        const lastYear = parseInt((tenure.match(/(\d{4})\D*$/) || [])[1], 10);
        if (!byTeam.has(team)) byTeam.set(team, []);
        const p = (byName.get(norm(name)) || []).find(c => (c.stats || []).some(s => s.tid === team));
        byTeam.get(team).push(Object.assign({ number, seasonRetired: year || lastYear || 2026, seasonTeamInfo: lastYear || year || 2026, name, text: name }, p ? { pid: p.pid } : {}));
        teamLeft--;
      }
      let n = 0;
      // Rows whose footnotes break the table parse.
      if (byTeam.has(0) && !byTeam.get(0).some(r => r.number === '99')) byTeam.get(0).push({ number: '99', seasonRetired: 1949, seasonTeamInfo: 1948, name: 'Marshall Goldberg', text: 'Marshall Goldberg' });
      for (const [tid, list] of byTeam) { L.teams[tid].retiredJerseyNumbers = list; n += list.length; }
      // The Cowboys and Raiders do not retire numbers.
      for (const tid of [8, 16]) if (!byTeam.has(tid)) L.teams[tid].retiredJerseyNumbers = [];
      log('Retired numbers from the current list:', n, 'across', byTeam.size, 'teams');
    }
  }

  // =========================================================================
  // 4. Game attributes (season-dependent history), events, metadata
  // =========================================================================
  const timeline = (fn) => {
    const out = [];
    let prev;
    for (let y = NEW_FIRST; y <= 2026; y++) {
      const v = fn(y);
      if (JSON.stringify(v) !== JSON.stringify(prev)) out.push({ start: out.length ? y : null, value: v });
      prev = v;
    }
    return out;
  };
  const ga = L.gameAttributes;
  ga.startingSeason = NEW_FIRST;
  ga.numGames = timeline(y => E.getRules(y).numGames);
  ga.numGamesPlayoffSeries = timeline(y => E.getRules(y).numGamesPlayoffSeries);
  ga.numPlayoffByes = timeline(y => E.getRules(y).numPlayoffByes);
  ga.confs = timeline(y => E.getAlignment(y).confs);
  ga.divs = timeline(y => E.getAlignment(y).divs);
  ga.numDraftRounds = 7;
  ga.maxRosterSize = 53;
  ga.minRosterSize = 45;
  const r26 = E.getRules(2026);
  Object.assign(ga, { salaryCap: r26.salaryCap, minPayroll: r26.minPayroll, minContract: r26.minContract, maxContract: r26.maxContract, salaryCapType: 'hard' });
  for (const k of E.RULE_KEYS) if (!['numGames', 'numGamesPlayoffSeries', 'numPlayoffByes', 'maxOvertimes', 'numDraftRounds', 'maxRosterSize', 'minRosterSize'].includes(k)) ga[k] = r26[k];
  ga.maxOvertimes = timeline(y => E.getRules(y).maxOvertimes);
  ga.overtimeLengthPlayoffs = 15;
  ga.leagueName = 'NFL 1966-2026';
  L.meta = { name: 'NFL 1966-2026 Master (2026 Week 9 Live)' };
  L.startingSeason = NEW_FIRST;

  const pidByNameBorn = (name, born) => {
    const c = (byName.get(norm(name)) || []).filter(p => !born || !p.born || Math.abs(p.born.year - born) <= 1)
      .sort((x, y) => Math.abs((x.born ? x.born.year : born) - born) - Math.abs((y.born ? y.born.year : born) - born));
    return c.length ? c[0].pid : undefined;
  };
  // Every scheduled event from the first season of the master, so the file carries
  // the whole history. Football GM drops events that are already in the past when
  // this file is loaded as 2026; the season selector regenerates them per start point.
  L.scheduledEvents = E.buildScheduledEvents(NEW_FIRST, -1, pidByNameBorn);

  // =========================================================================
  // 5. Live 2026 state: rosters, injured reserve and injuries from nflverse's latest
  //    weekly rosters and injury report (data_cache/live2026).
  // =========================================================================
  const liveDir = path.join(CACHE, 'live2026');
  if (fs.existsSync(path.join(liveDir, 'roster_weekly_2026.csv'))) {
    const CODE26 = { ARI: 0, ATL: 1, BAL: 2, BUF: 3, CAR: 4, CHI: 5, CIN: 6, CLE: 7, DAL: 8, DEN: 9, DET: 10, GB: 11, HOU: 12, IND: 13, JAX: 14,
      KC: 15, LV: 16, LAC: 17, LA: 18, LAR: 18, MIA: 19, MIN: 20, NE: 21, NO: 22, NYG: 23, NYJ: 24, PHI: 25, PIT: 26, SF: 27, SEA: 28, TB: 29, TEN: 30, WAS: 31 };
    const weekly = parseCSVFile(path.join(liveDir, 'roster_weekly_2026.csv'));
    const lastWeek = {};
    for (const r of weekly) lastWeek[r.team] = Math.max(lastWeek[r.team] || 0, +r.week);
    const current = weekly.filter(r => +r.week === lastWeek[r.team] && CODE26[r.team] !== undefined);
    const injRows = parseCSVFile(path.join(liveDir, 'injuries_2026.csv'));
    const injWeek = Math.max(...injRows.map(r => +r.week));
    const latestInj = new Map();
    for (const r of injRows.sort((a, b) => +a.week - +b.week)) latestInj.set(norm(r.full_name) + '|' + r.team, r);
    const byLast = new Map();
    for (const p of allPlayers) { const k = norm(String(p.lastName).replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')); if (!byLast.has(k)) byLast.set(k, []); byLast.get(k).push(p); }
    const find26 = (r) => {
      const by = r.birth_date ? +r.birth_date.slice(0, 4) : 0;
      const c = (byName.get(norm(r.full_name)) || []).filter(p => !by || !p.born || Math.abs(p.born.year - by) <= 1);
      if (c.length) return c.sort((x, y) => (y.tid >= -1) - (x.tid >= -1) || Math.abs(x.born.year - by) - Math.abs(y.born.year - by))[0];
      // Nicknames ("Cam" Ward, "Sauce" Gardner, "Pat" Surtain II): same last name, same birth year, active now.
      const last = norm(r.last_name || r.full_name.split(' ').slice(-1)[0]);
      return byLast.get(last) && byLast.get(last).filter(p => p.born && Math.abs(p.born.year - by) <= 1 && p.tid >= -1 && (p.stats || []).some(s => s.season >= 2024))
        .sort((x, y) => (y.tid === CODE26[r.team]) - (x.tid === CODE26[r.team]))[0];
    };
    const severe = /acl|achilles|torn|fractur|broken|surgery|season|lisfranc|patellar/i;
    const onTeam = new Set();
    let moved = 0, injured = 0, unmatched = 0;
    for (const p of allPlayers) if (p.tid >= 0 || p.tid === -1) p.injury = { type: 'Healthy', gamesRemaining: 0 };
    for (const r of current) {
      if (!['ACT', 'RES', 'INA'].includes(r.status)) continue;
      const p = find26(r);
      if (!p) { unmatched++; continue; }
      const tid = CODE26[r.team];
      if (p.tid !== tid) { p.tid = tid; moved++; }
      if (r.jersey_number && r.jersey_number !== '0') p.jerseyNumber = String(r.jersey_number);
      onTeam.add(p.pid);
      const inj = latestInj.get(norm(r.full_name) + '|' + r.team);
      const type = (inj && (inj.report_primary_injury || inj.practice_primary_injury)) || '';
      if (r.status === 'RES') {
        p.injury = { type: type || 'Injured Reserve', gamesRemaining: severe.test(type) ? 17 - injWeek : 4 };
        injured++;
      } else if (inj && +inj.week === injWeek && /^(Out|Doubtful)$/.test(inj.report_status)) {
        p.injury = { type: type || 'Undisclosed', gamesRemaining: 1 };
        injured++;
      }
    }
    // Anyone still listed on a 2026 team but not on its current roster is a free agent.
    let released = 0;
    for (const p of allPlayers) if (p.tid >= 0 && !onTeam.has(p.pid)) { p.tid = -1; released++; }
    const counts = {};
    for (const p of allPlayers) if (p.tid >= 0) counts[p.tid] = (counts[p.tid] || 0) + 1;
    const biggest = Math.max(...Object.values(counts));
    // NFL rosters are 53 active plus injured reserve; Football GM counts everyone, so the
    // live season allows the larger roster and the limit returns to 53 next preseason.
    ga.maxRosterSize = Math.max(53, biggest);
    L.scheduledEvents.push({ id: L.scheduledEvents.length + 1, season: 2027, phase: 0, type: 'gameAttributes', info: { maxRosterSize: 53, minRosterSize: 45 } });
    log(`Live 2026 rosters (week ${Math.max(...Object.values(lastWeek))}): ${onTeam.size} on teams, ${moved} moved, ${released} to free agency, ${unmatched} unmatched; ${injured} injured (report week ${injWeek}); largest roster ${biggest}`);
  }

  // Fit 2026 payrolls under the hard cap so free agents can be signed.
  require('./season_slicer').fitPayrolls(allPlayers, E.getRules(2026));

  // Depth charts for the live season, best first at every position.
  const { buildDepth } = require('./season_slicer');
  for (const team of L.teams) team.depth = buildDepth(allPlayers.filter(p => p.tid === team.tid));

  log('Writing', path.basename(OUT_FILE));
  const out = fs.openSync(OUT_FILE, 'w');
  fs.writeSync(out, '{');
  Object.keys(L).forEach((k, i) => {
    if (i) fs.writeSync(out, ',');
    fs.writeSync(out, JSON.stringify(k) + ':');
    if (Array.isArray(L[k]) && L[k].length > 1000) {
      fs.writeSync(out, '[');
      L[k].forEach((x, j) => fs.writeSync(out, (j ? ',' : '') + JSON.stringify(x)));
      fs.writeSync(out, ']');
    } else fs.writeSync(out, JSON.stringify(L[k]));
  });
  fs.writeSync(out, '}');
  fs.closeSync(out);
  log('Players:', L.players.length, '| scheduledEvents:', L.scheduledEvents.length, '| done.');
}

main();
