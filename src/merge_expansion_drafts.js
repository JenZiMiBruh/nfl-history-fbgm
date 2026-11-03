/**
 * merge_expansion_drafts.js - one expansion draft per season for teams joining together (Seahawks and Buccaneers 1976,
 * Panthers and Jaguars 1995), in the master and its rebuild baseline. Football GM runs one expansion draft at a time,
 * so with two events only one team could be picked as the expansion team. nfl_eras.js now builds them merged; this
 * fixes masters built before that.
 *
 * Usage: node --max-old-space-size=14000 src/merge_expansion_drafts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const first = new Map();
  let merged = 0;
  m.scheduledEvents = m.scheduledEvents.filter(e => {
    if (e.type !== 'expansionDraft') return true;
    const k = e.season + '|' + e.phase;
    if (!first.has(k)) { first.set(k, e); return true; }
    first.get(k).info.teams.push(...e.info.teams);
    merged++;
    return false;
  }).map((e, i) => Object.assign(e, { id: i + 1 }));
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: merged ${merged} expansion draft events`);
}
