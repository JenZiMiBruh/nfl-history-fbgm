/**
 * draft_ratings.js - what a player looks like as a draft prospect in a league started before his draft: rated by where
 * he really went, not by the career he went on to have (Dak Prescott, pick 135, isn't the 4th-best prospect of 2016).
 * His real ratings take over when his first season starts (the mod's realRatings).
 *
 * Writes p.draftRow into the master: his first season's rating row with every skill but height moved evenly to hit
 * the target. 34 + 26 * e^(-pick / 80) gives 60 at the top, 51 at the end of round 1, 41 at pick 100, 35 at the end of the
 * draft, the same scale as the real 2027-29 classes. Undrafted players get 36. season_slicer.js uses the row.
 *
 * Usage: node --max-old-space-size=14000 src/draft_ratings.js
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const KEYS = ['stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];
const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
// draft.pick is the pick within the round (normalize_draft_picks.js)
const overall = d => (d.round - 1) * 32 + d.pick;
let n = 0, off = 0;
for (const p of master.players) {
  delete p.draftRow;
  if (p.tid === -2 || !(p.ratings || []).length) continue;
  const seasons = (p.stats || []).filter(s => !s.playoffs).map(s => s.season);
  const debut = seasons.length ? Math.min(...seasons) : p.ratings[0].season;
  const r0 = p.ratings.find(r => r.season === debut) || p.ratings[0];
  const drafted = p.draft && p.draft.round > 0 && p.draft.pick > 0;
  const target = Math.round(drafted ? 34 + 26 * Math.exp(-overall(p.draft) / 80) : 36);
  const pos = r0.pos;
  const row = shift => { const o = { ...r0 }; for (const k of KEYS) if (typeof r0[k] === 'number') o[k] = Math.max(1, Math.min(99, Math.round(r0[k] + shift))); return o; };
  let lo = -90, hi = 60;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (R.computeOvr(row(mid), pos) < target) lo = mid; else hi = mid; }
  let best = row(hi);
  for (let d = -5; d <= 5 && R.computeOvr(best, pos) !== target; d += 0.05) { const c = row(hi + d); if (Math.abs(R.computeOvr(c, pos) - target) < Math.abs(R.computeOvr(best, pos) - target)) best = c; }
  // rounding can leave it a point off: nudge one skill at a time, so a later pick never outrates an earlier one
  const main = KEYS.filter(k => typeof best[k] === 'number').sort((a, b) => best[b] - best[a]);
  for (let i = 0; i < 400 && R.computeOvr(best, pos) !== target; i++) { const k = main[i % main.length], up = R.computeOvr(best, pos) < target; best[k] = Math.max(1, Math.min(99, best[k] + (up ? 1 : -1))); }
  if (R.computeOvr(best, pos) !== target) off++;
  best.ovrs = {}; best.pots = {};
  const age = debut - 1 - (p.born?.year ?? debut - 22);
  for (const q of R.POSITIONS) { best.ovrs[q] = R.computeOvr(best, q); best.pots[q] = R.computePot(best.ovrs[q], age, q); }
  best.ovr = best.ovrs[pos];
  best.pot = Math.max(best.ovr, best.pots[pos]);
  best.skills = R.computeSkills({ ...best, pos });
  p.draftRow = best;
  n++;
}
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`draft rows for ${n} players; ${off} missed the exact target`);
