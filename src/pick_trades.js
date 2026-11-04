/**
 * pick_trades.js - real traded draft picks, 2002 on, from nflverse's trades.csv. Writes master.pickTrades:
 * [date, season, round, from tid, to tid, overall pick or 0], oldest first, conditional picks left out. season_slicer.js
 * replays them up to a league's start date, so each future pick starts with whoever really owned it then.
 * Seasons are the master's: a draft belongs to the season before it (the April 2016 draft is 2015).
 *
 * Usage: node --max-old-space-size=14000 src/pick_trades.js
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const { CODE } = require('./team_codes');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const ALT = { JAC: 'JAX', LVR: 'LV', LAR: 'LA', ARZ: 'ARI', CLV: 'CLE', BLT: 'BAL', HST: 'HOU', GNB: 'GB', KAN: 'KC', NOR: 'NO', NWE: 'NE', SDG: 'SD', SFO: 'SF', TAM: 'TB' };
const tidOf = c => CODE[ALT[c] || c];
const rows = [];
let unknown = 0;
for (const r of parseCSVFile(path.join(ROOT, 'data_cache', 'trades.csv'))) {
  if (!+r.pick_season || !+r.pick_round || +r.conditional) continue;
  const from = tidOf(r.gave), to = tidOf(r.received);
  if (from === undefined || to === undefined) { unknown++; continue; }
  rows.push([r.trade_date, +r.pick_season - 1, +r.pick_round, from, to, +r.pick_number || 0]);
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
master.pickTrades = rows;
fs.writeFileSync(FILE, JSON.stringify(master));
console.log(`${rows.length} traded picks, ${unknown} with an unknown team`);
