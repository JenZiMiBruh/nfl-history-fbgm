/**
 * apply_jersey_eras.js - pushes the home jersey colors in nfl_eras.js (HOME_JERSEYS) into the master league:
 * each franchise's teamInfo event in every season where its jersey changes, and the current team colors.
 * Run after editing HOME_JERSEYS so the game matches the explorer.
 *
 * Usage: node --max-old-space-size=14000 src/apply_jersey_eras.js [tid ...]
 */
const fs = require('fs');
const path = require('path');
const E = require('./nfl_eras');
const MASTER = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const only = process.argv.slice(2).map(Number);
const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
const tmpl = m.scheduledEvents.find(e => e.type === 'teamInfo');
let n = 0;
for (const [tidStr, list] of Object.entries(E.HOME_JERSEYS)) {
  const tid = +tidStr;
  if (only.length && !only.includes(tid)) continue;
  for (const [season, colors, jersey] of list) {
    if (season <= m.startingSeason) continue;
    let e = m.scheduledEvents.find(x => x.type === 'teamInfo' && x.info.tid === tid && x.season === season);
    if (!e) { e = { ...tmpl, season, phase: 0, info: { tid } }; delete e.id; m.scheduledEvents.push(e); }
    e.info.colors = colors; e.info.jersey = jersey; n++;
  }
  const last = list[list.length - 1];
  m.teams[tid].colors = last[1]; m.teams[tid].jersey = last[2];
}
m.scheduledEvents.sort((a, b) => a.season - b.season || a.phase - b.phase);
fs.writeFileSync(MASTER, JSON.stringify(m));
console.log(`jersey eras applied: ${n} events`);
