// Every player who played a game since 1966, for the site's "Flag a rating" search: name, position and each season's
// team and rating, as shown on the team pages (seasons by the year they start). Loaded only when someone opens the
// search.
//
// Output: site/data/players.json = { teams: [abbrev by tid], players: [[pid, "First Last", "POS", [[season, tid, ovr], ...]], ...] }
// Usage: node --max-old-space-size=14000 tools/build_player_index.js <NFL_Master_1966_2026.json>
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) throw new Error('usage: build_player_index.js <master.json>');
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const SITE = path.join(__dirname, '..', 'site', 'data');
const teams = JSON.parse(fs.readFileSync(path.join(SITE, 'teams.json'), 'utf8'));
const abbrev = [];
for (const t of teams) abbrev[t.tid] = t.abbrev;

const out = [];
for (const p of m.players) {
  const bySeason = new Map();
  for (const s of p.stats || []) {
    if (s.playoffs || !(s.gp > 0) || s.tid < 0) continue;
    if (!bySeason.has(s.season)) bySeason.set(s.season, s.tid); // the team he started the season with
  }
  if (!bySeason.size) continue;
  const rows = [];
  for (const [season, tid] of [...bySeason].sort((a, b) => a[0] - b[0])) {
    const r = (p.ratings || []).find(x => x.season === season);
    if (r) rows.push([season, tid, Math.round(r.ovr)]);
  }
  if (!rows.length) continue;
  const pos = (p.ratings || []).at(-1)?.pos || '';
  out.push([p.pid, `${p.firstName} ${p.lastName}`, pos, rows]);
}
out.sort((a, b) => a[1].localeCompare(b[1]));
fs.writeFileSync(path.join(SITE, 'players.json'), JSON.stringify({ teams: abbrev, players: out }));
const kb = fs.statSync(path.join(SITE, 'players.json')).size / 1024;
console.log(`players.json: ${out.length} players, ${out.reduce((n, p) => n + p[3].length, 0)} seasons, ${kb.toFixed(0)} KB`);
