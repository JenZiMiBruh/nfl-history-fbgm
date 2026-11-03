/**
 * starter_floor.js - in the season being played, keeps each team's real starting quarterback ahead of his backups, and
 * each team's real lead back ahead of everyone else at running back.
 *
 * Football GM starts whoever is rated highest at a position, before every game, for every AI team. A real starter
 * can be rated a point or two below a backup (a slow start, a backup's strong spot duty), and then the backup
 * starts. For the live season only, the healthy quarterback with the most starts (then pass attempts) for his team is
 * raised just enough to sit 1 point above any healthy teammate, by nudging his passing ratings (vision, power,
 * accuracy) evenly. Usually 1-3 points, and only where needed; past seasons are never touched.
 *
 * Usage: node --max-old-space-size=14000 src/starter_floor.js [season=2026]
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const SEASON = +(process.argv[2] || 2026);
const SKILLS = ['thv', 'thp', 'tha'];

const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const nm = p => `${p.firstName} ${p.lastName}`;
const healthy = p => !(p.injury && p.injury.gamesRemaining > 0);
const row = p => (p.ratings || []).find(r => r.season === SEASON);

let raised = 0;
for (const t of master.teams) {
  const qbs = master.players.filter(p => p.tid === t.tid && healthy(p) && row(p)?.pos === 'QB');
  if (qbs.length < 2) continue;
  const att = p => (p.stats || []).filter(s => s.season === SEASON && !s.playoffs && s.tid === t.tid).reduce((a, s) => a + (s.pss || 0), 0);
  const gs = p => (p.stats || []).filter(s => s.season === SEASON && !s.playoffs && s.tid === t.tid).reduce((a, s) => a + (s.gs || 0), 0);
  // The starter has the most starts (a star back from injury keeps his job over the fill-in), then the most passes
  const starter = qbs.slice().sort((a, b) => gs(b) - gs(a) || att(b) - att(a))[0];
  if (att(starter) === 0) continue;
  const r = row(starter);
  const best = Math.max(...qbs.filter(p => p !== starter).map(p => row(p).ovrs.QB));
  if (r.ovrs.QB > best) continue;
  const before = r.ovrs.QB;
  for (let i = 0; i < 30 && R.computeOvr(r, 'QB') <= best; i++) for (const k of SKILLS) r[k] = Math.min(99, r[k] + 1);
  r.ovrs = {};
  for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
  r.ovr = r.ovrs.QB;
  const age = SEASON - (starter.born?.year ?? SEASON - 25);
  r.pots = {};
  for (const q of R.POSITIONS) r.pots[q] = R.computePot(r.ovrs[q], age, q);
  r.pot = Math.max(r.ovr, R.computePot(r.ovr, age, 'QB'));
  r.skills = R.computeSkills({ ...r, pos: 'QB' });
  console.log(`${t.abbrev}: ${nm(starter)} ${before} -> ${r.ovr} (best backup ${best})`);
  raised++;
}
// Running backs: the team's best healthy back sits 1 point above every healthy receiver and tight end at RB (backs among
// themselves are left alone). Football GM fills the RB slot by RB rating alone, so a star receiver with a
// higher RB rating would line up at running back and receiver at once (Jaxon Smith-Njigba over Zach Charbonnet).
const RB_SKILLS = ['elu', 'spd', 'bsc'];
let rbRaised = 0;
for (const t of master.teams) {
  const roster = master.players.filter(p => p.tid === t.tid && healthy(p) && row(p));
  const played = p => (p.stats || []).some(s => s.season === SEASON && !s.playoffs && s.gp > 0);
  const rbs = roster.filter(p => row(p).pos === 'RB' && played(p));
  const lead = rbs.slice().sort((a, b) => row(b).ovrs.RB - row(a).ovrs.RB)[0];
  if (!lead) continue;
  const r = row(lead);
  const best = Math.max(0, ...roster.filter(p => row(p).pos !== 'RB').map(p => row(p).ovrs.RB));
  if (r.ovrs.RB > best) continue;
  const before = r.ovrs.RB;
  for (let i = 0; i < 40 && R.computeOvr(r, 'RB') <= best; i++) for (const k of RB_SKILLS) r[k] = Math.min(99, r[k] + 1);
  r.ovrs = {};
  for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
  r.ovr = r.ovrs.RB;
  const age = SEASON - (lead.born?.year ?? SEASON - 25);
  r.pots = {};
  for (const q of R.POSITIONS) r.pots[q] = R.computePot(r.ovrs[q], age, q);
  r.pot = Math.max(r.ovr, R.computePot(r.ovr, age, 'RB'));
  r.skills = R.computeSkills({ ...r, pos: 'RB' });
  console.log(`${t.abbrev}: ${nm(lead)} RB ${before} -> ${r.ovr} (best other at RB ${best})`);
  rbRaised++;
}
console.log(`raised ${rbRaised} lead running backs`);
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`raised ${raised} starting quarterbacks`);
