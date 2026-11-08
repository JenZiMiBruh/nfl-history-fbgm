/**
 * fix_retired_number_dates.js - a number isn't retired while its player still wears it.
 *
 * Three retired numbers were dated before the player's last season with the team (Larry Wilson's #8 in 1970, though
 * he played for the Cardinals through 1972), so a league starting in between had him playing in a retired number.
 * Each such date moves to the end of his last season there.
 *
 * Runs on the master and its rebuild baseline. Safe to run again.
 * Usage: node --max-old-space-size=14000 src/fix_retired_number_dates.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byPid = new Map(m.players.map(p => [p.pid, p]));
  const moved = [];
  for (const t of m.teams) for (const j of t.retiredJerseyNumbers || []) {
    const p = j.pid !== undefined && byPid.get(j.pid);
    if (!p) continue;
    const ys = (p.stats || []).filter(s => !s.playoffs && s.tid === t.tid && s.gp > 0).map(s => s.season);
    if (!ys.length) continue;
    const last = Math.max(...ys);
    if (j.seasonRetired < last) { moved.push(`${t.abbrev} #${j.number} ${j.name}: ${j.seasonRetired} -> ${last}`); j.seasonRetired = last; }
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: moved ${moved.length}${moved.length ? ': ' + moved.join('; ') : ''}`);
}
