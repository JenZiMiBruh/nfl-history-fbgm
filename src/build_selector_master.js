/**
 * build_selector_master.js - a slim copy of the master league for the season selector, small enough for phones.
 *
 * The full master unpacks to 350+ MB, which crashes mobile browsers. The selector doesn't need most of it:
 *   - team-season logos (129 MB of repeated images): the selector draws every logo from its own built-in set
 *   - scheduled events and the live season's box scores: the slicer builds its own
 *   - zero-valued stats (most of the ~80 fields in every stat line): season_slicer.js puts them back when it
 *     writes the league file (master.statKeys lists the fields)
 *   - per-position overalls and potentials (ovrs, pots) are stored as plain lists in master.ratingPos order instead
 *     of labeled objects, and expanded back the same way
 * Writes site/data/NFL_Selector_Master.json.gz.
 *
 * Usage: node --max-old-space-size=14000 src/build_selector_master.js [out=../nfl-history-fbgm/site/data/NFL_Selector_Master.json.gz]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '..', 'nfl-history-fbgm', 'site', 'data', 'NFL_Selector_Master.json.gz');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));

for (const t of m.teams) for (const s of t.seasons || []) { delete s.imgURL; delete s.imgURLSmall; }
delete m.scheduledEvents;
delete m.games;

// Every stat field, in order, so the slicer can restore the zeros; then drop them from each line
const playerKeys = new Set(), teamKeys = new Set();
for (const p of m.players) for (const s of p.stats || []) for (const k of Object.keys(s)) playerKeys.add(k);
for (const t of m.teams) for (const s of t.stats || []) for (const k of Object.keys(s)) teamKeys.add(k);
const ID = new Set(['tid', 'season', 'playoffs', 'jerseyNumber']); // identity fields stay even when 0 (tid 0 is Arizona)
const strip = (rows) => { for (const s of rows || []) for (const k of Object.keys(s)) if (s[k] === 0 && !ID.has(k)) delete s[k]; };
for (const p of m.players) strip(p.stats);
for (const t of m.teams) strip(t.stats);
m.statKeys = { player: [...playerKeys], team: [...teamKeys] };

const ratingPos = Object.keys(m.players.find(p => p.ratings?.[0]?.ovrs).ratings[0].ovrs);
for (const p of m.players) for (const r of p.ratings || []) for (const k of ['ovrs', 'pots']) if (r[k] && !Array.isArray(r[k])) r[k] = ratingPos.map(q => r[k][q]);
m.ratingPos = ratingPos;

const json = JSON.stringify(m);
fs.writeFileSync(OUT, zlib.gzipSync(Buffer.from(json), { level: 9 }));
console.log(`selector master: ${(json.length / 1e6).toFixed(0)} MB unpacked, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB download`);
