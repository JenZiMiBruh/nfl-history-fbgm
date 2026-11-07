/**
 * merge_ghost_players.js - removes players who are a second copy of a real player under a nickname or another spelling
 * (Charley and Charlie Cowan, Olie and Ollie Cordill). The copy has team seasons with 0 games in every one, so it took a
 * roster spot those seasons, and an honor attached to it didn't count for the real player (Cowan's 1967 All-Pro).
 * Each pair below is the same team, seasons, college and birth year. Anything that names the copy (awards, All-Star
 * teams, events, retired numbers) is pointed at the real player, then the copy is dropped. Runs on the master and its
 * rebuild baseline.
 *
 * Usage: node --max-old-space-size=14000 src/merge_ghost_players.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// [copy, real player]
const PAIRS = [
  [25780, 28573], // Jim Hunt -> Jim Lee Hunt
  [26174, 28598], // Denny -> Dennis Biodrowski
  [26217, 28580], // Charley -> Charlie Cowan
  [26862, 28760], // Billy -> Billy Guy Anderson
  [26985, 28601], // Olie -> Ollie Cordill
  [27114, 28606], // Tom -> Tommie Smiley
  [27924, 28776], // Charlie -> Cookie Brinkman
  [28419, 28646], // John Jones -> J.J. Jones
];

// Every { pid } in a nested structure (awards' winners, All-Star teams), pointed at the real player
const repoint = (x, map) => {
  if (Array.isArray(x)) { for (const y of x) repoint(y, map); return; }
  if (x && typeof x === 'object') {
    if (typeof x.pid === 'number' && map.has(x.pid)) x.pid = map.get(x.pid);
    if (Array.isArray(x.pids)) x.pids = x.pids.map(pid => map.get(pid) ?? pid);
    for (const v of Object.values(x)) if (v && typeof v === 'object') repoint(v, map);
  }
};

for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map(PAIRS);
  const byPid = new Map(m.players.map(p => [p.pid, p]));
  let merged = 0;
  for (const [copy, real] of PAIRS) {
    const c = byPid.get(copy), r = byPid.get(real);
    if (!c || !r) continue;
    if ((c.stats || []).some(s => s.gp > 0)) throw new Error(`${c.firstName} ${c.lastName} has real games: not a copy`);
    r.awards = [...(r.awards || []), ...(c.awards || []).filter(a => !(r.awards || []).some(b => b.season === a.season && b.type === a.type))];
    if (c.hof) r.hof = true;
    if (!(r.draft && r.draft.round > 0) && c.draft && c.draft.round > 0) r.draft = c.draft;
    merged++;
  }
  m.players = m.players.filter(p => !map.has(p.pid));
  repoint(m.awards, map);
  repoint(m.allStars, map);
  repoint(m.events, map);
  for (const t of m.teams) repoint(t.retiredJerseyNumbers, map);
  repoint(m.scheduledEvents, map);
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: merged ${merged} copies into the real players`);
}
