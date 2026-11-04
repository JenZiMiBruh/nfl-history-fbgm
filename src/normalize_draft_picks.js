/**
 * normalize_draft_picks.js - every player's draft.pick as the pick within his round, which is what Football GM expects.
 * The sources mix it: 1998 on mostly give the overall pick (Tom Brady: round 6, pick 199, shown as 6-199 and "359th
 * pick"), older drafts the pick within the round, with a few of the other kind in each year. In an overall-style year, a
 * pick past the earlier rounds has the round's start taken off. Runs on the master and its rebuild baseline.
 *
 * Usage: node --max-old-space-size=14000 src/normalize_draft_picks.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const years = new Map();
  for (const p of m.players) {
    const d = p.draft;
    if (!d || !(d.round > 0) || !(d.pick > 0)) continue;
    if (!years.has(d.year)) years.set(d.year, []);
    years.get(d.year).push(d);
  }
  let changed = 0;
  for (const [, list] of years) {
    const isOverall = d => d.round > 1 && d.pick > (d.round - 1) * 20;
    const later = list.filter(d => d.round > 1);
    if (later.filter(isOverall).length <= later.length / 2) continue; // already within the round
    const start = {};
    for (const d of list.filter(isOverall)) start[d.round] = Math.min(start[d.round] ?? Infinity, d.pick);
    for (const d of list.filter(isOverall)) { d.pick = d.pick - start[d.round] + 1; changed++; }
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: ${changed} picks converted`);
}
