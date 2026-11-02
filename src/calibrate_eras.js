/**
 * calibrate_eras.js - sets Football GM's sim tuning settings season by season so a simmed league plays like the
 * real NFL of each era. Compares a full-history sim export (made with the current factors) against the real team
 * stats in the master, and scales each factor by real rate / simmed rate:
 *   completionFactor  completions per attempt       intFactor      interceptions per attempt
 *   sackFactor        sacks per dropback            fumbleFactor   fumbles lost per game
 *   rushYdsFactor     yards per carry               passYdsFactor  yards per completion
 *   passFactor        share of plays that are passes
 * Real rates are smoothed over 5 seasons; simmed rates are pooled by decade (one sim is too noisy per season).
 * Run it again on a newer sim to refine (factors already in data_cache/era_factors.json are the starting point).
 *
 * Output: data_cache/era_factors.json  { "<season start year>": { completionFactor, ... } }
 * Usage: node --max-old-space-size=14000 src/calibrate_eras.js <sim export .json or .json.gz>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const E = require('./nfl_eras');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data_cache', 'era_factors.json');
const readJson = (f) => {
  const buf = fs.readFileSync(f);
  return JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString());
};

const simFile = process.argv[2];
if (!simFile) throw new Error('usage: node src/calibrate_eras.js <sim export>');
const real = readJson(path.join(ROOT, 'NFL_Master_1966_2026.json'));
const sim = readJson(simFile);
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const KEYS = ['gp', 'pss', 'pssCmp', 'pssYds', 'pssInt', 'pssSk', 'rus', 'rusYds', 'fmbLost'];
// Sim exports name seasons by the year they end; the master by the year they start.
function totals(league, shift) {
  const by = {};
  for (const t of league.teams) for (const s of t.stats || []) {
    if (s.playoffs || !s.gp) continue;
    const y = s.season - shift;
    by[y] = by[y] || Object.fromEntries(KEYS.map(k => [k, 0]));
    for (const k of KEYS) by[y][k] += s[k] || 0;
  }
  return by;
}
const rates = (b) => ({
  completionFactor: b.pssCmp / b.pss,
  intFactor: b.pssInt / b.pss,
  sackFactor: b.pssSk / (b.pss + b.pssSk),
  fumbleFactor: b.fmbLost / b.gp,
  rushYdsFactor: b.rusYds / b.rus,
  passYdsFactor: b.pssYds / b.pssCmp,
  passFactor: b.pss / (b.pss + b.rus)
});
const sum = (list) => {
  const out = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const b of list) for (const k of KEYS) out[k] += b[k];
  return out;
};

const R = totals(real, 0);
const S = totals(sim, 1);
const out = {};
for (let y = E.FIRST_SEASON; y <= E.LAST_SEASON; y++) {
  const window = [];
  for (let d = -2; d <= 2; d++) if (R[y + d] && y + d <= 2025) window.push(R[y + d]);
  const decade = Object.keys(S).map(Number).filter(s => Math.floor(s / 10) === Math.floor(Math.min(y, 2025) / 10)).map(s => S[s]);
  if (!window.length || !decade.length) continue;
  const r = rates(sum(window));
  const s = rates(sum(decade));
  const prev = old[y] || {};
  const row = {};
  for (const k of Object.keys(r)) {
    // The sim ran with the previous factor (passFactor: the era table in nfl_eras), so scale from there
    const base = prev[k] ?? (k === 'passFactor' ? E.getRules(y).passFactor : 1);
    const f = base * (r[k] / s[k]);
    row[k] = Math.round(Math.min(2.5, Math.max(0.4, f)) * 50) / 50; // steps of 0.02
  }
  out[y] = row;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const show = (y) => console.log(y, JSON.stringify(out[y]));
[1966, 1975, 1985, 1995, 2005, 2015, 2025, 2026].forEach(show);
console.log('wrote', OUT);
