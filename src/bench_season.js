/**
 * bench_season.js - workload and scoring shares from one benched season, next to the real season it replays.
 * Used to tune the game sim between full-history sims: lead-back carry share, running backs' share of receiving,
 * the top receiver's share of team receiving yards, the top pass rusher's share of team sacks, and touchdowns
 * against field goals.
 *
 * Usage: node --max-old-space-size=8000 src/bench_season.js <harness dump.json> <real season (start year)>
 */
const fs = require('fs');
const path = require('path');
const dump = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const REAL_SEASON = +process.argv[3];
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'NFL_Master_1966_2026.json'), 'utf8'));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function measure(players, season, posOf) {
  const byTeam = {};
  for (const p of players) for (const s of p.stats || []) {
    if (s.playoffs || s.season !== season || s.tid < 0) continue;
    (byTeam[s.tid] = byTeam[s.tid] || []).push({ ...s, pos: posOf(p, season) });
  }
  const m = { leadShare: [], leadPerGame: [], rbRec: [], topRec: [], topSack: [], td: 0, fg: 0, gp: 0 };
  for (const rows of Object.values(byTeam)) {
    const gp = Math.max(...rows.map(r => r.gp || 0));
    const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const rus = sum('rus'), rec = sum('recYds'), sk = sum('defSk');
    const lead = Math.max(...rows.map(r => r.rus || 0));
    if (rus) { m.leadShare.push(lead / rus); m.leadPerGame.push(lead / gp); }
    if (rec) { m.rbRec.push(rows.filter(r => r.pos === 'RB').reduce((a, r) => a + (r.recYds || 0), 0) / rec); m.topRec.push(Math.max(...rows.map(r => r.recYds || 0)) / rec); }
    if (sk) m.topSack.push(Math.max(...rows.map(r => r.defSk || 0)) / sk);
    m.td += sum('pssTD') + sum('rusTD'); m.fg += ['fg0', 'fg20', 'fg30', 'fg40', 'fg50'].reduce((a, k) => a + sum(k), 0); m.gp += gp;
  }
  return {
    'lead back share of carries': median(m.leadShare), 'lead back carries/game': median(m.leadPerGame),
    "RBs' share of receiving yds": median(m.rbRec), "top receiver's share of rec yds": median(m.topRec),
    "top pass rusher's share of sacks": median(m.topSack), 'offensive TDs per team-game': m.td / m.gp, 'FGs per team-game': m.fg / m.gp,
  };
}
const posBySeason = (p, season) => (p.ratings.find(r => r.season === season) || p.ratings[p.ratings.length - 1]).pos;
const simSeason = Math.max(...dump.players.flatMap(p => (p.stats || []).filter(s => !s.playoffs && s.gp > 0).map(s => s.season)));
const S = measure(dump.players, simSeason, posBySeason), R = measure(real.players, REAL_SEASON, posBySeason);
console.log(`bench season ${simSeason} vs real ${REAL_SEASON}`);
for (const k of Object.keys(S)) {
  const f = v => (k.includes('share') ? (100 * v).toFixed(0) + '%' : v.toFixed(2));
  console.log(`  ${k.padEnd(34)} sim ${f(S[k]).padStart(6)}   real ${f(R[k]).padStart(6)}`);
}
