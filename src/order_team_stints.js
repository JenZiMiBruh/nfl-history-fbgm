/**
 * order_team_stints.js - puts a player's teams within a season in the order he played for them.
 *
 * A player who changed teams mid-season has one stats row per team, and everything downstream reads the first row as
 * the team he started the season with (the season selector's preseason rosters, Football GM's stats tables). The rows
 * weren't always in that order: Bob Tucker's 1977 Vikings row came before his Giants row, so a 1977 preseason league
 * started him in Minnesota, and his season's games bumped a real Viking off the roster.
 *
 * Trade dates only exist from 2002, so the order comes from his seasons around it: the team he played for the season
 * before (or, failing that, the one he played for most recently) is where he started, and the team he played for the
 * season after is where he finished. Rows that neither settles keep their order. Playoff rows are left alone (a player
 * only has playoff games with the team he finished with).
 *
 * Runs on the master and its rebuild baseline, like merge_ghost_players.js.
 * Usage: node --max-old-space-size=14000 src/order_team_stints.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')];

// Where in the season a row goes: -1 first (his team from before), 1 last (his team after), 0 unknown
function place(row, before, after) {
  if (before.has(row.tid) && !after.has(row.tid)) return -1;
  if (after.has(row.tid) && !before.has(row.tid)) return 1;
  return 0;
}

for (const file of FILES) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  let players = 0, seasons = 0;
  for (const p of m.players) {
    const stats = p.stats || [];
    const reg = stats.filter(s => !s.playoffs);
    const bySeason = new Map();
    for (const s of reg) { if (!bySeason.has(s.season)) bySeason.set(s.season, []); bySeason.get(s.season).push(s); }
    const years = [...bySeason.keys()].sort((a, b) => a - b);
    let changed = false;
    for (let i = 0; i < years.length; i++) {
      const rows = bySeason.get(years[i]);
      if (rows.length < 2) continue;
      // The nearest season he played before and after this one (a gap year still tells where he came from)
      const prev = i > 0 ? bySeason.get(years[i - 1]) : [];
      const next = i < years.length - 1 ? bySeason.get(years[i + 1]) : [];
      // Before: his last team of the previous season he played; after: his first team of the next one
      // A rookie has no season before, so he starts with the team that drafted him (Courtney Brown, the 2000 first
      // pick, with Cleveland; draft years are filed under the season before)
      const rookie = !prev.length && p.draft && p.draft.tid >= 0 && p.draft.year === years[i] - 1;
      const before = new Set(prev.length ? [prev[prev.length - 1].tid] : rookie ? [p.draft.tid] : []);
      const after = new Set(next.length ? [next[0].tid] : []);
      const sorted = rows.map((r, k) => ({ r, k, w: place(r, before, after) })).sort((a, b) => a.w - b.w || a.k - b.k).map(x => x.r);
      if (sorted.some((r, k) => r !== rows[k])) { bySeason.set(years[i], sorted); seasons++; changed = true; }
    }
    if (!changed) continue;
    // Rebuild the stats list: each season's regular-season rows in their new order, then that season's playoff rows,
    // keeping seasons in their original order
    const out = [];
    const done = new Set();
    for (const s of stats) {
      if (done.has(s.season)) continue;
      done.add(s.season);
      out.push(...(bySeason.get(s.season) || []), ...stats.filter(x => x.playoffs && x.season === s.season));
    }
    if (out.length !== stats.length) throw new Error(`${p.firstName} ${p.lastName}: lost stats rows`);
    p.stats = out;
    players++;
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: reordered ${seasons} seasons for ${players} players`);
}
