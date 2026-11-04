/**
 * normalize_draft_picks.js - every player's draft.pick as the pick within his round, which is what Football GM expects,
 * and draft.overall as his real overall pick (Tom Brady: round 6, pick 33, 199th). The sources mix the two: 1998 on mostly
 * give the overall pick, older drafts the pick within the round, with a few of the other kind in each year.
 * Round by round, a pick past the end of the round before is an overall pick; the rest are already within the round.
 * Reads the original numbers from a baseline that still has them, and writes the master and its rebuild baseline.
 *
 * Usage: node --max-old-space-size=14000 src/normalize_draft_picks.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const original = new Map();
for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, '_old', 'NFL_Master_before_roster_match_fix.json'), 'utf8')).players) if (p.draft) original.set(p.pid, p.draft.pick);
for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const years = new Map();
  for (const p of m.players) {
    const d = p.draft;
    if (!d || !(d.round > 0) || !(original.get(p.pid) > 0)) continue;
    d.pick = original.get(p.pid);
    if (!years.has(d.year)) years.set(d.year, new Map());
    const rounds = years.get(d.year);
    if (!rounds.has(d.round)) rounds.set(d.round, []);
    rounds.get(d.round).push(d);
  }
  let changed = 0, dups = 0;
  for (const [, rounds] of years) {
    let end = 0; // the overall number of the last pick so far
    for (const r of [...rounds.keys()].sort((a, b) => a - b)) {
      const list = rounds.get(r);
      const over = list.filter(d => d.pick > end);
      const isOverall = r > 1 && over.length > list.length / 2 && Math.max(...over.map(d => d.pick)) > 32;
      const start = isOverall ? Math.min(...over.map(d => d.pick)) : end + 1;
      for (const d of list) {
        if (isOverall && d.pick > end) { d.overall = d.pick; d.pick = d.pick - start + 1; changed++; } else d.overall = start + d.pick - 1;
      }
      end = Math.max(end, ...list.map(d => d.overall));
      dups += list.length - new Set(list.map(d => d.pick)).size;
    }
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: ${changed} picks converted, ${dups} duplicates left`);
}
// (the players' stored draft transactions were set to draft.overall too, once, on the master and the baseline)
