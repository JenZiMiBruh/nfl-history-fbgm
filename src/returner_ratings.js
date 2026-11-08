/**
 * returner_ratings.js - makes each team's real kick and punt returners the ones Football GM sends out to return.
 *
 * Football GM fills KR and PR by its KR/PR ratings, which are mostly speed plus ball security. Speed and ball security
 * come from a player's stats at his own position, so a returner who did little else (a backup cornerback, a fifth
 * receiver) rated slow and loose with the ball, and the job went to the fastest starter instead: in about 95% of
 * team-seasons the real kick returner wasn't the one returning (Devin Hester's bsc was 21 in 2006).
 *
 * For each team-season, the player with the most kick returns (and the most punt returns) handles the ball and is fast,
 * if he had at least 10 returns and 30% of the team's: ball security goes up to at least 85 (92 for punts), and speed goes up by
 * as much as 15, towards a level set by his real return average (a 25-yard kick returner is faster than a 19-yard
 * one). His overall at his own position stays exactly the same: for each point it would gain, another rating his
 * position uses comes down a point (the ones the sim leans on least first). Football GM also keeps starters off
 * returns (rosterAutoSort in the mod), so between the two the real returner gets the job in about 75% of team-seasons
 * for kicks and 85% for punts.
 *
 * Usage: node --max-old-space-size=14000 src/returner_ratings.js
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const MIN_RETURNS = 10;
const MIN_SHARE = 0.3;
// Fielding punts takes the surest hands, so the punt returner gets more than the kick returner
const BSC = { kr: 85, pr: 92 };
const MAX_SPD_GAIN = 15;
// League-average return (yards) and how much speed a yard above it is worth
const AVG = { kr: 21, pr: 9 };
const PER_YARD = { kr: 1.5, pr: 3 };
// Ratings that come down to keep his overall, least important to the sim first. Blocking and the kicking ratings are
// left alone, as are speed and ball security themselves
const GIVE = ['stre', 'elu', 'hnd', 'rtr', 'tck', 'pcv', 'rns', 'prs', 'thv', 'thp', 'tha', 'endu'];
const FLOOR = 20;

const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const nm = p => `${p.firstName} ${p.lastName}`;

// Returns per team-season: season|tid -> [{ p, kr, krYds, pr, prYds }]
const teams = new Map();
for (const p of master.players) {
  for (const s of p.stats || []) {
    if (s.playoffs || s.tid < 0 || !(s.kr || s.pr)) continue;
    const k = s.season + '|' + s.tid;
    if (!teams.has(k)) teams.set(k, new Map());
    const t = teams.get(k);
    const o = t.get(p.pid) || { p, season: s.season, kr: 0, krYds: 0, pr: 0, prYds: 0 };
    o.kr += s.kr || 0; o.krYds += s.krYds || 0; o.pr += s.pr || 0; o.prYds += s.prYds || 0;
    t.set(p.pid, o);
  }
}

// Each player-season's targets (a player can be his team's kick and punt returner, or return for two teams)
const targets = new Map();
for (const t of teams.values()) {
  const list = [...t.values()];
  for (const key of ['kr', 'pr']) {
    const total = list.reduce((a, x) => a + x[key], 0);
    const top = list.reduce((a, x) => (x[key] > a[key] ? x : a), list[0]);
    if (top[key] < MIN_RETURNS || top[key] < MIN_SHARE * total) continue;
    const spdLevel = Math.min(95, 78 + (top[key + 'Yds'] / top[key] - AVG[key]) * PER_YARD[key]);
    const k = top.p.pid + '|' + top.season;
    const prev = targets.get(k) || { p: top.p, season: top.season, spd: 0, bsc: 0 };
    prev.bsc = Math.max(prev.bsc, BSC[key]);
    prev.spd = Math.max(prev.spd, spdLevel);
    targets.set(k, prev);
  }
}

let changed = 0, spdTotal = 0;
const notExact = [];
for (const { p, season, spd, bsc } of targets.values()) {
  const r = (p.ratings || []).find(x => x.season === season);
  if (!r || r.pos === 'QB' || r.pos === 'K' || r.pos === 'P') continue;
  const before = { ...r };
  const own = R.computeOvr(r, r.pos);
  r.bsc = Math.max(r.bsc, bsc);
  let gain = Math.max(0, Math.min(MAX_SPD_GAIN, Math.round(spd) - r.spd));
  r.spd += gain;
  // Bring his overall back: one point at a time, lower whichever of the give ratings his position uses is highest right
  // now, so the cost is spread out instead of draining one rating. If a point overshoots, take back speed until it
  // matches
  const used = GIVE.filter(k => {
    if (r[k] === undefined) return false;
    const base = R.computeOvr(r, r.pos, true);
    r[k]--; const moved = R.computeOvr(r, r.pos, true) < base; r[k]++;
    return moved;
  });
  while (R.computeOvr(r, r.pos) > own) {
    let k;
    for (const c of used) if (r[c] > FLOOR && (k === undefined || r[c] > r[k])) k = c;
    if (k === undefined) break;
    r[k]--;
  }
  while (R.computeOvr(r, r.pos) < own && gain > 0) { r.spd--; gain--; }
  if (R.computeOvr(r, r.pos) !== own) {
    Object.assign(r, before);
    notExact.push(`${season} ${nm(p)} ${r.pos}`);
    continue;
  }
  if (JSON.stringify(before) === JSON.stringify(r)) continue;
  r.ovrs = {};
  for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
  const age = season - (p.born?.year ?? season - 25);
  r.pots = {};
  for (const q of R.POSITIONS) r.pots[q] = R.computePot(r.ovrs[q], age, q);
  r.skills = R.computeSkills({ ...r, pos: r.pos });
  changed++;
  spdTotal += gain;
}

fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`returners: ${targets.size} player-seasons, ${changed} changed (average speed +${(spdTotal / Math.max(1, changed)).toFixed(1)}), overalls unchanged`);
if (notExact.length) console.log(`  left alone (overall couldn't be kept exactly): ${notExact.length}, e.g. ${notExact.slice(0, 5).join(', ')}`);
