/**
 * estimate_av.js - fills in Approximate Value where Pro-Football-Reference has none yet.
 *
 * The ratings are driven by AV. PFR only publishes it after a season is over, and the 2025 list was fetched before
 * it was computed (every value is 0), and the live season has none at all. Without it, those seasons ranked players
 * almost at random: Mahomes and Herbert fell into the 40s while rookies kept their draft-prospect ratings.
 *
 * For each position, a least-squares fit of AV on the season's counting stats (games, yards, touchdowns,
 * sacks, interceptions, ...) is trained on 2019-2024, where real AV and stats both exist, then applied to every
 * regular-season row in ESTIMATE_SEASONS. Partial seasons simply get less AV; the ratings use AV per game.
 *
 * Usage: node --max-old-space-size=14000 src/estimate_av.js [seasons=2025,2026]
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const ESTIMATE_SEASONS = (process.argv[2] || '2025,2026').split(',').map(Number);
const TRAIN = [2019, 2024];

const tck = s => (s.defTckSolo || 0) + 0.5 * (s.defTckAst || 0);
const fg = s => (s.fg0 || 0) + (s.fg20 || 0) + (s.fg30 || 0) + (s.fg40 || 0) + (s.fg50 || 0);
const FEATURES = {
  // Skill players: games and production. Linemen and defenders: games started too, which for 2025-26 come from snap
  // counts (starts_from_snaps.js; the live feed's own start counts are wrong, e.g. Ja'Marr Chase 2 starts in 7 games)
  QB: s => [s.gp || 0, (s.pssYds || 0) / 100, s.pssTD || 0, s.pssInt || 0, (s.rusYds || 0) / 100, s.rusTD || 0],
  RB: s => [s.gp || 0, (s.rusYds || 0) / 100, s.rusTD || 0, (s.recYds || 0) / 100, s.recTD || 0],
  WR: s => [s.gp || 0, s.rec || 0, (s.recYds || 0) / 100, s.recTD || 0],
  TE: s => [s.gp || 0, s.rec || 0, (s.recYds || 0) / 100, s.recTD || 0],
  OL: s => [s.gs || 0, s.gp || 0],
  DL: s => [s.gs || 0, s.gp || 0, s.defSk || 0, tck(s), s.defFmbFrc || 0],
  LB: s => [s.gs || 0, s.gp || 0, tck(s), s.defSk || 0, s.defInt || 0, s.defPssDef || 0],
  CB: s => [s.gs || 0, s.gp || 0, tck(s), s.defInt || 0, s.defPssDef || 0],
  S: s => [s.gs || 0, s.gp || 0, tck(s), s.defInt || 0, s.defPssDef || 0],
  K: s => [fg(s), s.xp || 0],
  P: s => [s.pnt || 0, s.pntIn20 || 0],
};

// Ridge least squares: (X'X + lambda I) b = X'y, intercept unpenalized
function fit(X, y, lambda = 1) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), v = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) {
    v[a] += X[i][a] * y[i];
    for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
  }
  for (let a = 1; a < k; a++) A[a][a] += lambda;
  for (let c = 0; c < k; c++) { // Gauss-Jordan
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [v[c], v[piv]] = [v[piv], v[c]];
    for (let r = 0; r < k; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let b = c; b < k; b++) A[r][b] -= f * A[c][b];
      v[r] -= f * v[c];
    }
  }
  return v.map((x, i) => x / A[i][i]);
}

const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const posOf = (p, season) => {
  const r = (p.ratings || []).find(r => r.season === season) || (p.ratings || []).at(-1);
  return FEATURES[r?.pos] ? r.pos : FEATURES[p.pos] ? p.pos : null;
};

const train = {};
for (const p of master.players) for (const s of p.stats || []) {
  if (s.playoffs || s.season < TRAIN[0] || s.season > TRAIN[1] || !(s.gp > 0) || typeof s.av !== 'number') continue;
  const pos = posOf(p, s.season);
  if (!pos) continue;
  (train[pos] = train[pos] || { X: [], y: [] }).X.push([1, ...FEATURES[pos](s)]);
  train[pos].y.push(s.av);
}
const model = {};
for (const [pos, { X, y }] of Object.entries(train)) {
  model[pos] = fit(X, y);
  const pred = X.map(x => x.reduce((a, v, i) => a + v * model[pos][i], 0));
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  const r2 = 1 - y.reduce((a, v, i) => a + (v - pred[i]) ** 2, 0) / y.reduce((a, v) => a + (v - my) ** 2, 0);
  console.log(`${pos.padEnd(2)} trained on ${String(y.length).padStart(5)} seasons, R² ${r2.toFixed(2)}`);
}

let filled = 0;
for (const p of master.players) for (const s of p.stats || []) {
  if (s.playoffs || !ESTIMATE_SEASONS.includes(s.season)) continue;
  if (!(s.gp > 0)) { s.av = 0; continue; }
  const pos = posOf(p, s.season);
  if (!pos || !model[pos]) continue;
  const x = [1, ...FEATURES[pos](s)];
  s.av = Math.max(0, Math.round(x.reduce((a, v, i) => a + v * model[pos][i], 0)));
  filled++;
}
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`estimated AV for ${filled} player-seasons in ${ESTIMATE_SEASONS.join(', ')}`);
