/**
 * export_vanilla.js - the live league for stock Football GM: today's real standings, stats, rosters and injuries,
 * with the full history since 1966 and the real 2027-2029 draft classes. No mod needed.
 *
 * Seasons are renamed by the year they end (the current season is 2027), like every other file in this project.
 * Bookkeeping that only the build scripts use (prospect IDs, counted-game lists) is stripped.
 *
 * Output: NFL_2027_Live_FBGM.json.gz
 * Usage: node --max-old-space-size=14000 src/export_vanilla.js ["label for the league name"]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { shiftSeasons } = require('./season_slicer');

const ROOT = path.join(__dirname, '..');
const label = process.argv[2] || 'Live';
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
// The master keeps every scheduled event since 1966 for slicing. A league that starts today has already passed them:
// apply each passed team change (logos, colors, jerseys, names) so the teams show today's look, then queue only
// future events. Without this, changes like the 2026 Titans Shield never fire.
{
  const S = m.gameAttributes.season, P = m.gameAttributes.phase;
  const passed = e => e.season < S || (e.season === S && e.phase <= P);
  const KEYS = ['region', 'name', 'abbrev', 'imgURL', 'imgURLSmall', 'colors', 'jersey', 'pop', 'stadiumCapacity'];
  let applied = 0;
  for (const e of m.scheduledEvents.filter(passed).sort((x, y) => x.season - y.season || x.phase - y.phase)) {
    if (e.type !== 'teamInfo') continue;
    const t = m.teams.find(t => t.tid === e.info.tid);
    for (const k of KEYS) if (e.info[k] !== undefined) t[k] = e.info[k];
    applied++;
  }
  // This season's team records carry the look too (the standings, roster and power rankings pages read them)
  for (const t of m.teams) {
    const ts = (t.seasons || []).find(x => x.season === S);
    if (ts) for (const k of KEYS) if (t[k] !== undefined && k in ts) ts[k] = t[k];
  }
  const before = m.scheduledEvents.length;
  m.scheduledEvents = m.scheduledEvents.filter(e => !passed(e)).map((e, i) => Object.assign({}, e, { id: i + 1 }));
  console.log(`applied ${applied} passed team changes; events ${before} -> ${m.scheduledEvents.length}`);
}
shiftSeasons(m, 1);
m.meta = Object.assign({}, m.meta, { name: `NFL 2026-27 (${label})` });
delete m.liveCounted;
for (const p of m.players) { delete p.espnId; delete p.prospectRank; }
const out = path.join(ROOT, 'NFL_2027_Live_FBGM.json.gz');
fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify(m)), { level: 9 }));
console.log(`wrote ${path.basename(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

// Phone-friendly copy for low-end phones: the same league without long-retired role players and without a copy of
// every past season's logo (past seasons show the team's current one). Same rules as the selector's option.
{
  const S = m.gameAttributes.season;
  const keep = new Set();
  for (const a of m.awards || []) for (const aw of a.awards || []) for (const w of [aw.winner].flat(3)) if (w && w.pid !== undefined) keep.add(w.pid);
  for (const a of m.allStars || []) for (const t of a.teams || []) for (const w of t) if (w && w.pid !== undefined) keep.add(w.pid);
  for (const t of m.teams) for (const j of t.retiredJerseyNumbers || []) if (j.pid !== undefined) keep.add(j.pid);
  const before = m.players.length;
  m.players = m.players.filter(p => p.tid !== -3 || p.hof || keep.has(p.pid) || (p.retiredYear !== undefined && p.retiredYear >= S - 10));
  for (const t of m.teams) for (const ts of t.seasons || []) if (ts.season < S) { delete ts.imgURL; delete ts.imgURLSmall; }
  m.meta.name = m.meta.name.replace(')', ', phone-friendly)');
  const lite = path.join(ROOT, 'NFL_2027_Live_Lite_FBGM.json.gz');
  fs.writeFileSync(lite, zlib.gzipSync(Buffer.from(JSON.stringify(m)), { level: 9 }));
  console.log(`wrote ${path.basename(lite)} (${(fs.statSync(lite).size / 1e6).toFixed(1)} MB, ${m.players.length} of ${before} players)`);
}
