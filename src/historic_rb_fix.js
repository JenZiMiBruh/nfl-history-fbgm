/**
 * historic_rb_fix.js - in past seasons, keeps each team's best back ahead of its receivers, tight ends and
 * quarterbacks at running back, without changing anyone's overall.
 *
 * Football GM fills the RB slot by RB rating alone, so a receiver with a higher RB rating than the team's backs lines
 * up at running back and receiver at once (Calvin Johnson over Jahvid Best in 2011), and his rushing stats pile up.
 * starter_floor.js handles the live season by raising the back; past seasons keep every overall exactly, so here the
 * other player's RB rating comes down instead, one point at a time, until he sits 1 point below the best back: first
 * ratings that don't move his overall at his own position (elusiveness, ball security, ...), then, when his RB rating
 * comes from ratings his own position shares (a big, fast receiver), a trade of one rating down for another up that
 * leaves his overall exactly where it was. Anyone nothing can lower that far is reported.
 *
 * Usage: node --max-old-space-size=14000 src/historic_rb_fix.js [before=2026]
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const BEFORE = +(process.argv[2] || 2026);
const LOWER = ['elu', 'bsc', 'stre', 'hnd', 'rtr', 'spd'];
// Blocking is never lowered (receivers and tight ends block on running plays), and nothing goes below these floors
const FLOOR = { bsc: 30, stre: 20, hnd: 30, rtr: 30, spd: 30 };
const KEEP = new Set(['rbk', 'pbk']);
const canLower = (r, k) => !KEEP.has(k) && r[k] > (FLOOR[k] || 0);
const ALL = ['hgt', 'stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];

const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const nm = p => `${p.firstName} ${p.lastName}`;

const teams = new Map(); // season|tid -> [{ p, r }]
for (const p of master.players) for (const r of p.ratings || []) {
  if (r.season >= BEFORE) continue;
  const st = (p.stats || []).find(s => s.season === r.season && !s.playoffs);
  if (!st) continue;
  const k = r.season + '|' + st.tid;
  if (!teams.has(k)) teams.set(k, []);
  teams.get(k).push({ p, r });
}

let lowered = 0, teamsFixed = 0;
const stuck = [];
for (const [k, roster] of teams) {
  const backs = roster.filter(x => x.r.pos === 'RB');
  if (!backs.length) continue;
  const top = Math.max(...backs.map(x => x.r.ovrs.RB));
  const over = roster.filter(x => x.r.pos !== 'RB' && x.r.ovrs.RB >= top);
  if (!over.length) continue;
  teamsFixed++;
  for (const { p, r } of over) {
    const own = r.ovrs[r.pos];
    for (let i = 0; i < 300 && R.computeOvr(r, 'RB') >= top; i++) {
      // the rating whose drop lowers RB the most, of those that leave his own overall alone
      let best = null, bestRb = R.computeOvr(r, 'RB', true);
      for (const s of LOWER) {
        if (!canLower(r, s)) continue;
        r[s]--;
        const rb = R.computeOvr(r, 'RB', true);
        if (R.computeOvr(r, r.pos) === own && rb < bestRb) { best = s; bestRb = rb; }
        r[s]++;
      }
      if (best) { r[best]--; continue; }
      // Nothing alone: trade one rating down for another up (one his own position counts more), overall unchanged
      let pair = null;
      for (const d of ALL) for (const u of ALL) {
        if (d === u || !canLower(r, d) || r[u] >= 100) continue;
        r[d]--; r[u]++;
        const rb = R.computeOvr(r, 'RB', true);
        if (R.computeOvr(r, r.pos) === own && rb < bestRb) { pair = [d, u]; bestRb = rb; }
        r[d]++; r[u]--;
      }
      if (!pair) break;
      r[pair[0]]--; r[pair[1]]++;
    }
    if (R.computeOvr(r, 'RB') >= top) stuck.push(`${k} ${nm(p)} ${r.pos} ${R.computeOvr(r, 'RB')} vs back ${top}`);
    r.ovrs = {};
    for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
    if (r.ovrs[r.pos] !== own) throw new Error(`${nm(p)} ${k}: overall moved ${own} -> ${r.ovrs[r.pos]}`);
    const age = r.season - (p.born?.year ?? r.season - 25);
    r.pots = {};
    for (const q of R.POSITIONS) r.pots[q] = R.computePot(r.ovrs[q], age, q);
    r.skills = R.computeSkills({ ...r, pos: r.pos });
    lowered++;
  }
}
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`${teamsFixed} team-seasons: lowered the RB rating of ${lowered} non-backs; ${stuck.length} couldn't go low enough`);
for (const s of stuck.slice(0, 15)) console.log('  ' + s);
