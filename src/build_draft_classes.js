/**
 * build_draft_classes.js - the real 2027, 2028 and 2029 NFL draft classes, added to the master league.
 *
 * Who: every FBS player from fetch_prospects.js. Juniors and older go in the 2027 draft, sophomores 2028,
 * freshmen 2029 (stored the league's way: a draft's year is the season before the player's debut, so the
 * April 2027 draft is draft.year 2026).
 *
 * Order: college production against his position and class (both seasons, this one weighted more),
 * playing time, and conference strength. ESPN's big board, where it has a player, sets the top of the
 * 2027 order outright.
 *
 * Ratings: each prospect's place in his class maps onto how real players drafted at that slot have rated in
 * this league (rookie overall and career peak, 2008-2024 drafts), so a top-10 prospect lands where real top-10
 * picks do. His skill mix starts from a real rookie at his position with a similar rating; height is his real
 * height, strength follows his real weight, and the skills shift together until the league's own overall
 * formula (ratings_engine.js) gives the target - the same solve the historical ratings use.
 *
 * Usage: node --max-old-space-size=14000 src/build_draft_classes.js [collegeSeason=2026] [--dry]
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const SEASON = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 2026);
const DRY = process.argv.includes('--dry');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data_cache', 'prospects');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const PER_CLASS = 340;               // 224 draft slots plus room for undrafted free agents
const POWER = /^(SEC|Big Ten|ACC|Big 12|FBS Indep.)$/;
// Skills that define each position (same lists as rebuild_ratings.js); only these shift when solving for the overall
const POS_SKILLS = {
  QB: ['tha', 'thp', 'thv', 'elu', 'spd', 'stre', 'bsc'], RB: ['spd', 'elu', 'stre', 'bsc', 'hnd', 'rtr', 'pbk', 'rbk'],
  WR: ['hnd', 'rtr', 'spd', 'elu', 'stre', 'bsc'], TE: ['hnd', 'rtr', 'pbk', 'rbk', 'stre', 'spd'], OL: ['pbk', 'rbk', 'stre', 'spd'],
  DL: ['prs', 'rns', 'tck', 'stre', 'spd'], LB: ['prs', 'rns', 'pcv', 'tck', 'stre', 'spd'], CB: ['pcv', 'spd'],
  S: ['pcv', 'tck', 'spd', 'stre'], K: ['kpw', 'kac'], P: ['ppw', 'pac']
};

// Seeded randomness so a rebuild gives the same classes
let seed = 20262027;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const noise = (sd) => (rand() + rand() + rand() - 1.5) * sd * 1.15;

const POS = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', T: 'OL', G: 'OL', OG: 'OL', C: 'OL', OL: 'OL', IOL: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', LB: 'LB', OLB: 'LB', ILB: 'LB', MLB: 'LB', CB: 'CB', DB: 'CB', S: 'S', SAF: 'S', FS: 'S', SS: 'S',
  PK: 'K', K: 'K', P: 'P' };

const players = JSON.parse(fs.readFileSync(path.join(DIR, `players_${SEASON}.json`), 'utf8'));
const teams = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DIR, `teams_${SEASON}.json`), 'utf8')).map(t => [t.id, t]));
const boardFile = path.join(DIR, `board_${SEASON + 1}.json`);
const board = fs.existsSync(boardFile) ? JSON.parse(fs.readFileSync(boardFile, 'utf8')) : [];
const boardRank = new Map(board.filter(b => b.collegeId).map(b => [b.collegeId, b.overall || 999]));
// ESPN recruiting grade (pedigree), best grade if a player shows up in more than one class
const recruit = new Map();
for (const f of fs.readdirSync(DIR).filter(f => /^recruits_\d+\.json$/.test(f))) for (const r of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))) if (r.collegeId && r.grade) recruit.set(String(r.collegeId), Math.max(r.grade, recruit.get(String(r.collegeId)) || 0));
// Hand-set slots for players the formula misjudges: { espnId: { name, pick, why } }
const ovFile = path.join(DIR, 'overrides.json');
const OVERRIDES = fs.existsSync(ovFile) ? JSON.parse(fs.readFileSync(ovFile, 'utf8')) : {};
const stat = (id, s) => { const f = path.join(DIR, 'stats', `${id}_${s}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };

// Production per game for a position, from one season's flat stats
function production(pos, st) {
  const gp = st['general.gamesPlayed'] || 0;
  if (!gp) return null;
  const g = k => (st[k] || 0) / gp;
  switch (pos) {
    case 'QB': {
      // volume plus efficiency, so a QB in a run-heavy offense isn't buried
      const att = st['passing.passingAttempts'] || 0;
      const eff = att >= 40 ? 18 * ((st['passing.passingYards'] || 0) / att) + 1.5 * (st['passing.completionPct'] || 0) + 400 * (((st['passing.passingTouchdowns'] || 0) - 2 * (st['passing.interceptions'] || 0)) / att) : 0;
      return 0.5 * (g('passing.passingYards') + 20 * g('passing.passingTouchdowns') - 25 * g('passing.interceptions') + 0.6 * g('rushing.rushingYards')) + eff;
    }
    case 'RB': return g('rushing.rushingYards') + 0.8 * g('receiving.receivingYards') + 15 * (g('rushing.rushingTouchdowns') + g('receiving.receivingTouchdowns'));
    case 'WR': case 'TE': return g('receiving.receivingYards') + 15 * g('receiving.receivingTouchdowns') + 2 * g('receiving.receptions');
    case 'OL': return gp;
    case 'DL': case 'LB': return g('defensive.totalTackles') + 8 * g('defensive.sacks') + 3 * g('defensive.tacklesForLoss') + 6 * g('defensive.passesDefended');
    case 'CB': case 'S': return 0.6 * g('defensive.totalTackles') + 15 * g('defensiveInterceptions.interceptions') + 6 * g('defensive.passesDefended');
    case 'K': return 3 * g('kicking.fieldGoalsMade') + g('kicking.extraPointsMade');
    case 'P': return (st['punting.grossAvgPuntYards'] || 0);
  }
  return null;
}

// ---- pools
const DRAFT_YEAR = cls => (cls >= 3 ? SEASON : cls === 2 ? SEASON + 1 : cls === 1 ? SEASON + 2 : null);
const pool = [];
for (const p of players) {
  const pos = POS[p.pos];
  const year = DRAFT_YEAR(p.cls);
  if (!pos || !year || !p.first || !p.last || !(teams[p.team] || {}).conf) continue; // all-star rosters have no conference
  const now = production(pos, stat(p.id, SEASON)), last = p.cls >= 2 ? production(pos, stat(p.id, SEASON - 1)) : null;
  const gpNow = stat(p.id, SEASON)['general.gamesPlayed'] || 0, gpLast = p.cls >= 2 ? stat(p.id, SEASON - 1)['general.gamesPlayed'] || 0 : 0;
  const prod = now === null && last === null ? 0 : (now ?? 0) * (last === null ? 1 : 0.6) + (last ?? 0) * (now === null ? 1 : 0.4);
  const t = teams[p.team] || {};
  pool.push({ ...p, pos, year, prod, gp: gpNow + gpLast, grade: recruit.get(String(p.id)) || 60, power: POWER.test(t.conf || ''), college: t.name || '' });
}

// z-scores within draft year + position, then the class order
const groups = {};
for (const x of pool) (groups[`${x.year}|${x.pos}`] = groups[`${x.year}|${x.pos}`] || []).push(x);
for (const list of Object.values(groups)) {
  const z = (k) => { const v = list.map(x => x[k]); const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; for (const x of list) x['z_' + k] = (x[k] - m) / sd; };
  z('prod'); z('gp'); z('grade');
}
const POS_WEIGHT = { QB: 1.1, RB: 0.9, WR: 1, TE: 0.9, OL: 1, DL: 1.05, LB: 0.95, CB: 1, S: 0.9, K: 0.35, P: 0.3 };
for (const x of pool) {
  x.score = (0.55 * x.z_prod + 0.25 * x.z_gp + 0.6 * x.z_grade) * POS_WEIGHT[x.pos] + (x.power ? 0.4 : -0.3) + noise(0.2);
  const br = x.year === SEASON ? boardRank.get(x.id) : undefined;
  if (br !== undefined && br < 999) x.score = 100 - br; // ESPN big board sets the top of the 2027 order
  const ov = OVERRIDES[x.id];
  if (ov && ov.pick) x.score = 100 - ov.pick + 0.5; // hand-set draft slot, documented in overrides.json
}

// ---- slot curves from real drafts in this league
const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
const KEYS = ['stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];
const slotRows = [], rookies = {};
for (const p of master.players) {
  const d = p.draft;
  if (!d || d.year < 2008 || d.year > 2024) continue;
  const r0 = p.ratings.find(r => r.season === d.year + 1);
  if (!r0) continue;
  const peak = Math.max(...p.ratings.map(r => r.ovr));
  const slot = d.round > 0 && d.pick > 0 ? d.pick : 260; // pick is the overall pick; undrafted sit past the draft
  slotRows.push([slot, r0.ovr, peak]);
  (rookies[r0.pos] = rookies[r0.pos] || []).push(r0);
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const curveAt = (slot, idx) => {
  const w = Math.max(6, slot * 0.25);
  const near = slotRows.filter(r => Math.abs(r[0] - slot) <= w).map(r => r[idx]);
  return median(near.length ? near : slotRows.filter(r => r[0] >= 225).map(r => r[idx]));
};
const curve = { ovr: [], peak: [] };
for (let s = 1; s <= 260; s++) { curve.ovr[s] = curveAt(s, 1); curve.peak[s] = curveAt(s, 2); }
// keep the curves monotonic (a higher pick is never expected to be worse)
for (const k of ['ovr', 'peak']) for (let s = 2; s <= 260; s++) curve[k][s] = Math.min(curve[k][s], curve[k][s - 1]);

// Position mix of real drafts, and how early each position tends to go (median pick -> value)
const POS_SHARE = {}, POS_VALUE = {};
{
  const rows = master.players.filter(p => p.draft && p.draft.year >= 2010 && p.draft.year <= 2024 && p.draft.round > 0 && p.draft.pick > 0 && p.draft.pick <= 260);
  const by = {};
  for (const p of rows) { const pos = (p.ratings.find(r => r.season === p.draft.year + 1) || p.ratings[0]).pos; (by[pos] = by[pos] || []).push(p.draft.pick); }
  const total = rows.length;
  for (const [pos, picks] of Object.entries(by)) if (POS_SKILLS[pos]) { POS_SHARE[pos] = picks.length / total; POS_VALUE[pos] = 1.2 - median(picks) / 260; }
}

// For each position, the median overall pick of the 1st, 2nd, 3rd... player taken at it in a draft (2010-2024)
const POS_RANK_PICK = {};
{
  const byYearPos = {};
  for (const p of master.players) {
    const d = p.draft;
    if (!d || d.year < 2010 || d.year > 2024 || !(d.round > 0) || !(d.pick > 0) || d.pick > 260) continue;
    const pos = (p.ratings.find(r => r.season === d.year + 1) || p.ratings[0]).pos;
    (byYearPos[pos + '|' + d.year] = byYearPos[pos + '|' + d.year] || []).push(d.pick);
  }
  const ranks = {};
  for (const [k, picks] of Object.entries(byYearPos)) { const pos = k.split('|')[0]; picks.sort((a, b) => a - b).forEach((pk, j) => { ((ranks[pos] = ranks[pos] || [])[j] = ranks[pos][j] || []).push(pk); }); }
  for (const [pos, arr] of Object.entries(ranks)) POS_RANK_PICK[pos] = arr.map(a => (a.length >= 5 ? median(a) : undefined));
}

// ---- build players
const clamp = v => Math.max(1, Math.min(99, Math.round(v)));
const weightMean = {};
for (const [pos, list] of Object.entries(rookies)) weightMean[pos] = 0;
let nextPid = Math.max(...master.players.map(p => p.pid)) + 1;
const added = [];
const minContract = master.gameAttributes.minContract || 750;
for (const year of [SEASON, SEASON + 1, SEASON + 2]) {
  // Each class gets the position mix real drafts have had (2010-2024 drafts in this league), and players are
  // ordered by how they rank within their own position, weighted by how highly that position tends to go.
  const all = pool.filter(x => x.year === year);
  const picked = [];
  for (const [pos, share] of Object.entries(POS_SHARE)) {
    const list = all.filter(x => x.pos === pos).sort((a, b) => b.score - a.score);
    const n = Math.max(2, Math.round(share * PER_CLASS));
    // expected pick: where the (j+1)-th best player at this position has really gone in this league's drafts
    list.slice(0, n).forEach((x, j) => { x.order = x.score > 50 ? -x.score : (POS_RANK_PICK[pos][j] ?? 300 + j) + noise(4); picked.push(x); });
  }
  const cls = picked.sort((a, b) => a.order - b.order).slice(0, PER_CLASS);
  cls.forEach((x, i) => {
    const slot = Math.min(260, i + 1);
    const target = clamp(curve.ovr[slot] + noise(slot <= 32 ? 1.2 : 2.5));
    // elite recruits carry more upside: what scouts pay for in the real draft
    const peak = Math.max(target + 2, clamp(curve.peak[slot] + noise(slot <= 32 ? 2.5 : 4) + Math.max(0, x.grade - 82) * 0.7));
    // skill mix: a real rookie at his position near the target
    const pool2 = (rookies[x.pos] || rookies.WR).filter(r => Math.abs(r.ovr - target) <= 4);
    const tmpl = pool2.length ? pool2[Math.floor(rand() * pool2.length)] : (rookies[x.pos] || rookies.WR)[0];
    const base = {};
    for (const k of KEYS) base[k] = tmpl[k];
    base.hgt = x.hgt ? R.inchesToHgtRating(x.hgt) : tmpl.hgt;
    const posW = rookies[x.pos].map(r => r.stre); const stMean = median(posW);
    if (x.wgt) base.stre = clamp(stMean + (x.wgt - ({ QB: 220, RB: 210, WR: 195, TE: 245, OL: 310, DL: 285, LB: 235, CB: 190, S: 205, K: 195, P: 210 })[x.pos]) * 0.4);
    const skills = POS_SKILLS[x.pos];
    const build = (shift) => { const out = { ...base }; for (const k of KEYS) if (!skills || skills.includes(k)) out[k] = clamp(base[k] + shift); return out; };
    let lo = -60, hi = 60;
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (R.computeOvr(build(mid), x.pos) < target) lo = mid; else hi = mid; }
    const r = build((lo + hi) / 2);
    r.season = year; r.pos = x.pos; r.fuzz = 0;
    r.ovrs = {}; for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
    r.ovr = r.ovrs[x.pos];
    const age = 21 + (year - SEASON === 0 ? 1 : 0);
    r.pots = {}; for (const q of R.POSITIONS) r.pots[q] = Math.max(r.ovrs[q], R.computePot(r.ovrs[q], age, q));
    r.pot = Math.max(r.ovr, peak);
    r.pots[x.pos] = r.pot;
    r.skills = R.computeSkills({ ...r, pos: x.pos });
    // A placeholder: src/prospect_ages.js (run after this) sets each prospect's real age from his high-school class
    const bornYear = year + 1 - 22;
    added.push({
      pid: nextPid++, firstName: x.first, lastName: x.last, tid: -2, pos: x.pos, hgt: x.hgt || 72, weight: x.wgt || 200,
      born: { year: bornYear, loc: x.home || '' }, college: x.college,
      imgURL: x.headshot ? `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(x.headshot).pathname)}&w=240&h=175` : undefined,
      ratings: [r], stats: [], awards: [], injuries: [], salaries: [], transactions: [], statsTids: [],
      injury: { type: 'Healthy', gamesRemaining: 0 },
      draft: { round: 0, pick: 0, tid: -1, originalTid: -1, year, ovr: r.ovr, pot: r.pot, skills: r.skills },
      contract: { amount: minContract, exp: year + 3 },
      moodTraits: [], hof: false, espnId: x.id, prospectRank: i + 1,
    });
  });
}

const summary = [SEASON, SEASON + 1, SEASON + 2].map(y => {
  const c = added.filter(p => p.draft.year === y);
  return `${y + 1} draft: ${c.length} prospects, top 5: ${c.slice(0, 5).map(p => `${p.firstName} ${p.lastName} (${p.pos}, ${p.college}) ${p.ratings[0].ovr}/${p.ratings[0].pot}`).join('; ')}`;
}).join('\n');
console.log(summary);
fs.writeFileSync(path.join(DIR, 'classes_summary.txt'), summary + '\n\n' + added.map(p => `${p.draft.year + 1}\t${p.prospectRank}\t${p.firstName} ${p.lastName}\t${p.pos}\t${p.college}\t${p.ratings[0].ovr}\t${p.ratings[0].pot}`).join('\n'));
if (DRY) return;

// Replace any earlier run's prospects, then add
master.players = master.players.filter(p => p.espnId === undefined).concat(added);
fs.writeFileSync(MASTER, JSON.stringify(master));
console.log(`master: +${added.length} draft prospects`);
