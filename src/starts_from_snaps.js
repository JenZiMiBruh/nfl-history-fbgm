/**
 * starts_from_snaps.js - real games played and games started for seasons where the live stat feed gets them wrong,
 * from nflverse snap counts (data_cache/snaps/snap_counts_<season>.csv).
 *
 * The weekly stat feed only lists a player in games where he recorded a stat, and its start counts are mostly wrong
 * from 2025 (Ja'Marr Chase: 2 starts in 7 games; Penei Sewell: 2 games all season). Snap counts list everyone who
 * played. A game counts as played with any snap, and as a start with at least START_PCT of his side's snaps on
 * offense or defense. Checked against 2024, where real starts exist (see the printed agreement).
 *
 * Usage: node --max-old-space-size=14000 src/starts_from_snaps.js [seasons=2025,2026] [--check 2024]
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const { norm } = require('./live_match');
const { CODE } = require('./team_codes');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const args = process.argv.slice(2);
const CHECK = args.includes('--check') ? +args[args.indexOf('--check') + 1] : null;
const SEASONS = CHECK ? [CHECK] : (args[0] && !args[0].startsWith('--') ? args[0] : '2025,2026').split(',').map(Number);
const START_PCT = 0.5;
const SNAP_CODE = Object.assign({}, CODE, { LA: 18, LAR: 18, LV: 16, OAK: 16, SD: 17 });

const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
let agree = 0, compared = 0, absErr = 0;
for (const y of SEASONS) {
  const file = path.join(ROOT, 'data_cache', 'snaps', `snap_counts_${y}.csv`);
  // pid lookup among players with a stat row that season, by name and team
  const byName = new Map();
  for (const p of m.players) for (const s of p.stats || []) {
    if (s.season !== y || s.playoffs) continue;
    const k = norm(`${p.firstName} ${p.lastName}`) + '|' + s.tid;
    if (!byName.has(k)) byName.set(k, { p, s });
  }
  const tally = new Map(); // key -> { gp, gs }
  let unmatched = 0;
  for (const r of parseCSVFile(file)) {
    if (r.game_type !== 'REG') continue;
    const tid = SNAP_CODE[r.team];
    const e = byName.get(norm(r.player) + '|' + tid);
    if (!e) { unmatched++; continue; }
    const k = e.p.pid + '|' + tid;
    const t = tally.get(k) || { e, gp: 0, gs: 0 };
    const off = +r.offense_pct || 0, def = +r.defense_pct || 0, st = +r.st_pct || 0;
    if (off + def + st > 0) t.gp++;
    if (off >= START_PCT || def >= START_PCT) t.gs++;
    tally.set(k, t);
  }
  let set = 0;
  for (const { e, gp, gs } of tally.values()) {
    if (CHECK) {
      compared++;
      absErr += Math.abs(gs - (e.s.gs || 0));
      if (Math.abs(gs - (e.s.gs || 0)) <= 1) agree++;
      continue;
    }
    e.s.gs = gs;
    e.s.gp = Math.max(e.s.gp || 0, gp);
    set++;
  }
  console.log(`${y}: ${tally.size} player-seasons from snap counts${CHECK ? '' : `, ${set} updated`}, ${unmatched} snap rows unmatched`);
}
if (CHECK) console.log(`check ${CHECK}: starts within 1 of the real count for ${(100 * agree / compared).toFixed(1)}% of ${compared} player-seasons (average miss ${(absErr / compared).toFixed(2)})`);
else fs.writeFileSync(MASTER, JSON.stringify(m));
