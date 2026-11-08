/**
 * fix_allstar_refs.js - All-Star (Pro Bowl) picks that point to a player who isn't in the data get linked to the real
 * one: the only player with that name (middle initials aside) who played that season. John L. Williams (1990-91) and
 * James O. Williams (2001) pointed at IDs from an old mix-up between players with common names.
 *
 * Runs on the master and its rebuild baseline. Safe to run again. A pick it can't match is reported, not guessed.
 * Usage: node --max-old-space-size=14000 src/fix_allstar_refs.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const key = n => n.toLowerCase().replace(/\b[a-z]\.\s*/g, '').replace(/[.,']/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();

for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = new Set(m.players.map(p => p.pid));
  const fixed = [], unmatched = [];
  for (const a of m.allStars || []) for (const team of a.teams || []) for (const x of team) {
    if (!x || x.pid === undefined || ids.has(x.pid) || !x.name) continue;
    let c = m.players.filter(p => key(`${p.firstName} ${p.lastName}`) === key(x.name) && (p.stats || []).some(s => !s.playoffs && s.gp > 0 && s.season === a.season));
    // Two with that name that season: the one on the pick's team (James O. Williams, 2001 Bears tackle)
    if (c.length > 1 && x.tid !== undefined) c = c.filter(p => (p.stats || []).some(s => !s.playoffs && s.season === a.season && s.tid === x.tid));
    if (c.length === 1) { fixed.push(`${a.season} ${x.name}: ${x.pid} -> ${c[0].pid}`); x.pid = c[0].pid; }
    else unmatched.push(`${a.season} ${x.name} (${c.length} candidates)`);
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: re-linked ${fixed.length}${fixed.length ? ': ' + fixed.join('; ') : ''}`);
  if (unmatched.length) console.log('  could not match: ' + unmatched.join('; '));
}
