/**
 * fix_player_records.js - repairs player records that a stat head would notice:
 *  - two players merged into one record: a 12+ season gap (a 1980 QB and a 2026 player both named Pete Woods), or
 *    an offensive and a defensive career mixed together (Todd Collins the QB and Todd Collins the LB). The part that
 *    doesn't fit is split off into its own player.
 *  - one player split into two records: same name and birth year, and every season-team of one is also in the
 *    other (Kevin Belcher, Rickey Bolden). The copy is merged in.
 *  - clearly wrong positions: 300+ passes but not listed at QB (Randy Johnson); a "defender" with 150+ carries
 *    (Anthony Thompson, Warren McVea).
 *  - impossible weights (10 lbs) and birth years (playing at 71).
 * Run before rebuild_ratings.js. Usage: node --max-old-space-size=14000 src/fix_player_records.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
fs.mkdirSync(path.join(ROOT, '_old'), { recursive: true });
if (!fs.existsSync(path.join(ROOT, '_old', 'NFL_Master_before_record_fixes.json'))) fs.copyFileSync(FILE, path.join(ROOT, '_old', 'NFL_Master_before_record_fixes.json'));

const OFF = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'K', 'P']);
const DEF = new Set(['DL', 'LB', 'CB', 'S']);
let nextPid = Math.max(...master.players.map(p => p.pid)) + 1;
const log = { gapSplits: [], roleSplits: [], merges: [], positions: [], weights: [], births: [] };
const name = p => `${p.firstName} ${p.lastName}`;
const regRows = p => (p.stats || []).filter(s => !s.playoffs);
const role = s => {
  const off = (s.pss || 0) + (s.rus || 0) + (s.rec || 0);
  const def = (s.defTckSolo || 0) + (s.defTckAst || 0) + (s.defSk || 0) + (s.defInt || 0) + (s.defPssDef || 0);
  return off > 0 && def === 0 ? 'off' : def > 0 && off === 0 ? 'def' : 'none';
};

// Move the given seasons' stats, ratings and season awards from p into a new player
function splitOff(p, seasons, pos) {
  const set = new Set(seasons);
  const first = Math.min(...seasons);
  const q = JSON.parse(JSON.stringify(p));
  q.pid = nextPid++;
  q.stats = (p.stats || []).filter(s => set.has(s.season));
  q.ratings = (p.ratings || []).filter(r => set.has(r.season));
  if (!q.ratings.length) q.ratings = [Object.assign({}, p.ratings[0] || {}, { season: first })];
  for (const r of q.ratings) if (pos) r.pos = pos;
  if (pos) q.pos = pos;
  q.awards = (p.awards || []).filter(a => set.has(a.season) && a.type !== 'Inducted into the Hall of Fame');
  q.transactions = [];
  q.injuries = (p.injuries || []).filter(i => set.has(i.season));
  q.salaries = (p.salaries || []).filter(s => set.has(s.season));
  q.born = Object.assign({}, p.born, { year: first - 23 });
  q.draft = { round: 0, pick: 0, tid: -1, originalTid: -1, year: first - 1 };
  delete q.srID;
  const last = Math.max(...seasons);
  const pLast = Math.max(...(p.stats || []).filter(s => !set.has(s.season)).map(s => s.season), -Infinity);
  // Whoever played the latest season keeps the current team and contract; the other is retired
  if (last > pLast) { p.tid = -3; p.retiredYear = pLast + 1; } else { q.tid = -3; q.retiredYear = last + 1; delete q.contract; }
  p.stats = (p.stats || []).filter(s => !set.has(s.season));
  p.ratings = (p.ratings || []).filter(r => !set.has(r.season));
  if (!p.ratings.length) p.ratings = [Object.assign({}, q.ratings[0], { season: pLast })];
  p.awards = (p.awards || []).filter(a => !(set.has(a.season) && a.type !== 'Inducted into the Hall of Fame'));
  p.injuries = (p.injuries || []).filter(i => !set.has(i.season));
  p.salaries = (p.salaries || []).filter(s => !set.has(s.season));
  master.players.push(q);
  return q;
}

// ---- 1. long gaps: a different person with the same name
for (const p of master.players.slice()) {
  const seasons = [...new Set(regRows(p).map(s => s.season))].sort((a, b) => a - b);
  for (let i = 1; i < seasons.length; i++) {
    if (seasons[i] - seasons[i - 1] >= 12) {
      const later = seasons.slice(i);
      splitOff(p, later, null);
      log.gapSplits.push(`${name(p)}: ${seasons[i - 1]} / ${seasons[i]}+`);
      break;
    }
  }
}

// ---- 2. an offensive and a defensive career in one record: in some season he plays offense for one team and
// defense for another at the same time (Todd Collins: QB for Buffalo and LB for New England in 1996). That season and
// every other purely-other-role season go to a new player.
const solidRole = s => {
  const off = (s.pss || 0) + (s.rus || 0) + (s.rec || 0);
  const def = (s.defTckSolo || 0) + (s.defSk || 0) * 3 + (s.defInt || 0) * 3 + (s.defPssDef || 0);
  return off >= 5 && def === 0 ? 'off' : def >= 5 && off === 0 ? 'def' : 'none';
};
for (const p of master.players.slice()) {
  const pos = p.ratings?.at(-1)?.pos;
  if (!pos || !(OFF.has(pos) || DEF.has(pos)) || ['K', 'P'].includes(pos)) continue;
  const mine = OFF.has(pos) ? 'off' : 'def', other = mine === 'off' ? 'def' : 'off';
  const reg = regRows(p);
  const clash = reg.some(s => solidRole(s) === other && reg.some(t => t.season === s.season && t.tid !== s.tid && solidRole(t) === mine));
  if (!clash) continue;
  const isOther = s => solidRole(s) === other;
  const q = JSON.parse(JSON.stringify(p));
  q.pid = nextPid++;
  q.stats = (p.stats || []).filter(isOther);
  p.stats = (p.stats || []).filter(s => !isOther(s));
  const sum = k => q.stats.reduce((x, s) => x + (s[k] || 0), 0);
  const newPos = other === 'def' ? (sum('defSk') > 5 ? 'DL' : sum('defInt') > 5 ? 'CB' : 'LB') : (sum('pss') > 100 ? 'QB' : sum('rus') > sum('rec') ? 'RB' : 'WR');
  const seasons = [...new Set(q.stats.map(s => s.season))].sort((x, y) => x - y);
  q.ratings = seasons.map(y => Object.assign({}, (p.ratings.find(r => r.season === y) || p.ratings[0]), { season: y, pos: newPos }));
  q.pos = newPos;
  q.awards = []; q.transactions = []; q.injuries = []; q.salaries = [];
  q.born = Object.assign({}, p.born, { year: seasons[0] - 23 });
  q.draft = { round: 0, pick: 0, tid: -1, originalTid: -1, year: seasons[0] - 1 };
  q.tid = -3; q.retiredYear = seasons.at(-1) + 1; delete q.contract; delete q.srID;
  // Low-stat seasons with only the split-off player's teams (and never the original's) go with him too
  const qTeams = new Set(q.stats.map(s => s.tid));
  const pTeams = new Set((p.stats || []).filter(s => solidRole(s) === mine).map(s => s.tid));
  const stray = s => solidRole(s) === 'none' && qTeams.has(s.tid) && !pTeams.has(s.tid);
  q.stats.push(...(p.stats || []).filter(stray));
  p.stats = (p.stats || []).filter(s => !stray(s));
  for (const y of new Set(q.stats.map(s => s.season))) if (!q.ratings.some(r => r.season === y)) q.ratings.push(Object.assign({}, q.ratings[0], { season: y }));
  q.ratings.sort((x, y) => x.season - y.season);
  q.born.year = Math.min(...q.stats.map(s => s.season)) - 23;
    const keep = new Set((p.stats || []).map(s => s.season));
  p.ratings = p.ratings.filter(r => keep.has(r.season) || r.season > Math.max(...keep));
  master.players.push(q);
  log.roleSplits.push(`${name(p)}: ${newPos} seasons ${seasons.join(',')} split from ${pos}`);
}

// ---- 3. one person in two records
const byKey = new Map();
for (const p of master.players) {
  const k = `${name(p)}|${p.born?.year}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}
const removed = new Set();
for (const [, list] of byKey) {
  if (list.length < 2) continue;
  for (const b of list) for (const a of list) {
    if (a === b || removed.has(a.pid) || removed.has(b.pid)) continue;
    const aKeys = new Set(regRows(a).map(s => s.season + '|' + s.tid));
    const bKeys = regRows(b).map(s => s.season + '|' + s.tid);
    if (!bKeys.length || !bKeys.every(k => aKeys.has(k)) || regRows(a).length < bKeys.length) continue;
    // b is a copy of part of a: keep a; take b's awards; fill any missing stat fields from b
    for (const sb of regRows(b)) {
      const sa = regRows(a).find(s => s.season === sb.season && s.tid === sb.tid);
      for (const [k, v] of Object.entries(sb)) if (sa[k] === undefined || sa[k] === 0) sa[k] = v;
    }
    for (const aw of b.awards || []) if (!(a.awards || []).some(x => x.season === aw.season && x.type === aw.type)) (a.awards = a.awards || []).push(aw);
    removed.add(b.pid);
    log.merges.push(`${name(b)} (pid ${b.pid} into ${a.pid})`);
  }
}
master.players = master.players.filter(p => !removed.has(p.pid));
// League award records that named a removed copy
const mergedInto = new Map();
for (const line of log.merges) { const m = line.match(/pid (\d+) into (\d+)/); mergedInto.set(+m[1], +m[2]); }
for (const a of master.awards || []) for (const aw of a.awards || []) for (const w of aw.winner || []) {
  for (const x of Array.isArray(w) ? w : [w]) if (x && mergedInto.has(x.pid)) x.pid = mergedInto.get(x.pid);
}

// ---- 3b. one person under two first names (Jim/Jimbo Covert, Cameron/Cam Cleeland, Derrick L./Derrick Alexander):
// same last name, compatible first names, born within 4 years, and on the same team in the same season
const NICK = { jim: 'james', jimbo: 'james', jimmy: 'james', joe: 'joseph', joey: 'joseph', mike: 'michael', mick: 'michael', bill: 'william', billy: 'william', will: 'william', willie: 'william', bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert', bert: 'robert', dick: 'richard', rich: 'richard', rick: 'richard', ricky: 'richard', chuck: 'charles', charlie: 'charles', tom: 'thomas', tommy: 'thomas', tony: 'anthony', dave: 'david', steve: 'steven', stephen: 'steven', ed: 'edward', eddie: 'edward', ted: 'edward', ron: 'ronald', ronnie: 'ronald', don: 'donald', donnie: 'donald', ken: 'kenneth', kenny: 'kenneth', larry: 'lawrence', jerry: 'gerald', gerry: 'gerald', jeff: 'jeffrey', geoff: 'jeffrey', cam: 'cameron', chris: 'christopher', matt: 'matthew', nick: 'nicholas', pat: 'patrick', sam: 'samuel', ben: 'benjamin', dan: 'daniel', danny: 'daniel', greg: 'gregory', fred: 'frederick', freddie: 'frederick', andy: 'andrew', drew: 'andrew', al: 'albert', gene: 'eugene', frank: 'francis', hank: 'henry', harry: 'henry', jack: 'john', johnny: 'john', jon: 'john', alex: 'alexander', zach: 'zachary', josh: 'joshua', nate: 'nathan', tim: 'timothy', vince: 'vincent', vinny: 'vincent', walt: 'walter', wally: 'walter' };
const firstKey = (n) => { const w = String(n || '').toLowerCase().replace(/[^a-z ]/g, '').trim().split(/s+/)[0] || ''; return NICK[w] || w; };
const sameFirst = (a, b) => { const x = firstKey(a), y = firstKey(b); return x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))); };
log.nickMerges = [];
const byLast = new Map();
for (const p of master.players) { if (!byLast.has(p.lastName)) byLast.set(p.lastName, []); byLast.get(p.lastName).push(p); }
const gone = new Set();
for (const [, list] of byLast) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    let a = list[i], b = list[j];
    if (gone.has(a.pid) || gone.has(b.pid) || a.firstName === b.firstName) continue;
    if (!sameFirst(a.firstName, b.firstName) || Math.abs((a.born?.year ?? 0) - (b.born?.year ?? 0)) > 4) continue;
    const ka = new Set(regRows(a).map(x => x.season + '|' + x.tid));
    if (!regRows(b).some(x => ka.has(x.season + '|' + x.tid))) continue;
    // Two different players on one team in one season would be a clash in another season: require no season where
    // they're on different teams
    const teamOf = (p) => { const m = new Map(); for (const x of regRows(p)) m.set(x.season, (m.get(x.season) || new Set()).add(x.tid)); return m; };
    const ta = teamOf(a), tb = teamOf(b);
    if ([...tb].some(([y, ts]) => ta.has(y) && ![...ts].some(t => ta.get(y).has(t)))) continue;
    if (regRows(b).length > regRows(a).length) [a, b] = [b, a];
    for (const xb of b.stats || []) {
      const xa = (a.stats || []).find(x => x.season === xb.season && x.tid === xb.tid && !!x.playoffs === !!xb.playoffs);
      if (!xa) { a.stats.push(xb); continue; }
      for (const [k, v] of Object.entries(xb)) if (typeof v === 'number' && typeof xa[k] === 'number' ? v > xa[k] : xa[k] === undefined) xa[k] = v;
    }
    a.stats.sort((x, y) => x.season - y.season);
    for (const r of b.ratings || []) if (!a.ratings.some(x => x.season === r.season)) a.ratings.push(r);
    a.ratings.sort((x, y) => x.season - y.season);
    for (const aw of b.awards || []) if (!(a.awards || []).some(x => x.season === aw.season && x.type === aw.type)) (a.awards = a.awards || []).push(aw);
    if (b.draft?.round > 0 && !(a.draft?.round > 0)) a.draft = b.draft;
    gone.add(b.pid);
    mergedInto.set(b.pid, a.pid);
    log.nickMerges.push(`${name(b)} into ${name(a)}`);
  }
}
master.players = master.players.filter(p => !gone.has(p.pid));
for (const aw of (master.awards || []).flatMap(a => a.awards || [])) for (const w of aw.winner || []) for (const x of Array.isArray(w) ? w : [w]) if (x && mergedInto.has(x.pid)) x.pid = mergedInto.get(x.pid);

// ---- 4. positions that contradict the stats
for (const p of master.players) {
  const reg = regRows(p);
  const tot = k => reg.reduce((a, s) => a + (s[k] || 0), 0);
  const pos = p.ratings?.at(-1)?.pos;
  let fix;
  if (tot('pss') > 300 && pos && !['QB', 'P'].includes(pos) && tot('pss') > 3 * tot('rec')) fix = 'QB';
  else if (pos && DEF.has(pos) && tot('rus') > 150 && tot('defTckSolo') + tot('defInt') + tot('defSk') < 20) fix = 'RB';
  if (fix && fix !== pos) {
    for (const r of p.ratings) r.pos = fix;
    if (typeof p.pos === 'string') p.pos = fix;
    log.positions.push(`${name(p)} ${pos} -> ${fix}`);
  }
}

// ---- 5. impossible weights and birth years
const medW = {};
for (const pos of [...OFF, ...DEF]) {
  const ws = master.players.filter(p => p.ratings?.at(-1)?.pos === pos && p.weight > 150).map(p => p.weight).sort((a, b) => a - b);
  medW[pos] = ws[Math.floor(ws.length / 2)] || 220;
}
for (const p of master.players) {
  if (!(p.weight >= 120)) { const w = medW[p.ratings?.at(-1)?.pos] || 220; log.weights.push(`${name(p)} ${p.weight} -> ${w}`); p.weight = w; }
  const seasons = regRows(p).map(s => s.season);
  if (!seasons.length || !p.born) continue;
  const ages = seasons.map(y => y - p.born.year);
  if (Math.min(...ages) < 18 || Math.max(...ages) > 50) {
    const fixed = p.draft?.round > 0 ? p.draft.year - 22 : Math.min(...seasons) - 23;
    log.births.push(`${name(p)} born ${p.born.year} -> ${fixed}`);
    p.born.year = fixed;
  }
}

// ---- 6. draft years: one convention (the season before the draft, as Football GM uses). Older drafts were stored
// under the draft's own year (Elway 1983); each year is converted the way most of its players show it.
const E = require('./nfl_eras');
log.draftYears = [];
const draftVotes = new Map();
for (const p of master.players) {
  const d = p.draft;
  if (!(d?.round > 0)) continue;
  const reg = regRows(p).filter(s => s.gp > 0);
  if (!reg.length) continue;
  const k = Math.min(...reg.map(s => s.season)) - d.year;
  const v = draftVotes.get(d.year) || { same: 0, before: 0 };
  if (k === 0) v.same++; else if (k === 1) v.before++;
  draftVotes.set(d.year, v);
}
const shiftYears = new Set([...draftVotes].filter(([y, v]) => v.same > v.before || y < 1966).map(([y]) => y));
let nShift = 0;
for (const p of master.players) {
  const d = p.draft;
  if (!(d?.round > 0)) continue;
  const reg = regRows(p).filter(s => s.gp > 0);
  const k = reg.length ? Math.min(...reg.map(s => s.season)) - d.year : undefined;
  // Debut in the stored year means it's the draft's own year; debut the next season means it's already converted;
  // later debuts follow their draft year's majority
  const shift = k === 0 || (k === undefined || k < 0 || k >= 2 ? shiftYears.has(d.year) : false);
  if (shift && k !== 1) { d.year -= 1; nShift++; }
}
log.draftYears.push(`moved ${nShift} draft years back one (to the season before the draft)`);

// ---- 7. games played can't exceed the season's length (some 1985-87 rows were added together)
log.games = [];
for (const p of master.players) for (const st of p.stats || []) {
  if (st.playoffs) continue;
  const max = E.getRules(st.season).numGames;
  if ((st.gp || 0) > max) { log.games.push(`${name(p)} ${st.season} gp ${st.gp} -> ${max}`); st.gp = max; }
  if ((st.gs || 0) > st.gp) st.gs = st.gp;
}

// ---- 8. Pro Bowl / All-Pro in a season he didn't play: a year off (move to the next season), or not his (drop)
log.honors = [];
const played = (p, y) => regRows(p).some(s => s.season === y && s.gp > 0);
for (const p of master.players) {
  for (const aw of (p.awards || []).slice()) {
    if (!['All-Star', undefined].includes(aw.type) || played(p, aw.season)) continue;
    if (played(p, aw.season + 1) && !p.awards.some(x => x !== aw && x.type === aw.type && x.season === aw.season + 1)) {
      log.honors.push(`${name(p)} ${aw.type || 'All-League'} ${aw.season} -> ${aw.season + 1}`); aw.season += 1;
    } else if (!played(p, aw.season - 1)) {
      log.honors.push(`${name(p)} ${aw.type || 'All-League'} ${aw.season} dropped`); p.awards.splice(p.awards.indexOf(aw), 1);
    }
  }
}

// ---- 9. league award entries naming players who don't exist
log.awardRefs = [];
const pids = new Set(master.players.map(p => p.pid));
for (const a of master.awards || []) for (const aw of a.awards || []) {
  aw.winner = (aw.winner || []).map(w => Array.isArray(w) ? w.filter(x => pids.has(x.pid) || (log.awardRefs.push(`${a.season} ${aw.name} pid ${x.pid}`), false)) : w)
    .filter(w => Array.isArray(w) || !w || pids.has(w.pid) || (log.awardRefs.push(`${a.season} ${aw.name} pid ${w.pid}`), false));
}

fs.writeFileSync(FILE, JSON.stringify(master));
for (const [k, v] of Object.entries(log)) console.log(k, v.length, v.length ? ' e.g. ' + v.slice(0, 6).join(' | ') : '');
