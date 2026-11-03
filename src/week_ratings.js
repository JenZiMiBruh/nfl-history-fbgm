/**
 * week_ratings.js - the live season's ratings week by week, so a league started at week W in the season selector has
 * the ratings players really had going into that week, not today's.
 *
 * Each weekly update ends with a snapshot of every 2026 rating row, filed under the week a league would start (ratings
 * through week 8 -> week 9), in data_cache/week_ratings_2026.json. Snapshots are kept from update to update; the
 * master is rebuilt from its baseline every time, so they are copied back in as p.weekRatings = { week: row } for the
 * selector master. season_slicer.js uses the latest snapshot at or before the start week (export_vanilla.js and the
 * slicer strip the field from league files).
 *
 * Usage: node --max-old-space-size=14000 src/week_ratings.js <start week>   (snapshot, then copy all into the master)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const STORE = path.join(ROOT, 'data_cache', 'week_ratings_2026.json');
const SEASON = 2026;
const WEEK = +process.argv[2];
if (!WEEK) throw new Error('usage: week_ratings.js <start week>');

const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {};
const snap = {};
for (const p of master.players) {
  const r = (p.ratings || []).find(r => r.season === SEASON);
  if (r) snap[p.pid] = r;
}
store[WEEK] = snap;
fs.writeFileSync(STORE, JSON.stringify(store));

let n = 0;
for (const p of master.players) {
  delete p.weekRatings;
  const rows = {};
  for (const [w, s] of Object.entries(store)) if (s[p.pid]) rows[w] = s[p.pid];
  if (Object.keys(rows).length) { p.weekRatings = rows; n++; }
}
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`week ${WEEK} snapshot saved (${Object.keys(snap).length} players); weeks on file: ${Object.keys(store).join(', ')}; ${n} players carry them`);
