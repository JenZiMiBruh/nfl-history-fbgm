/**
 * analyze_sim.js - how close a full-history sim came to real NFL history.
 *
 *   1. League stats by decade (completion %, yards per attempt, INT and sack rates, yards per carry, points)
 *   2. Team records: correlation of simmed win % with the real win %, season by season
 *   3. Careers by position: the sim's career totals as a share of the real ones, for each position's best
 *      real careers (median and middle-half range), plus the biggest misses
 *   4. Workload checks: lead-back carries, top-target share
 *
 * Sim exports name seasons by the year they end; the master by the year they start. Players match by pid.
 * Usage: node --max-old-space-size=14000 src/analyze_sim.js <sim export .json or .json.gz> [out.json]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const read = f => { const b = fs.readFileSync(f); return JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString()); };
const simFile = process.argv[2];
if (!simFile) throw new Error('usage: analyze_sim.js <sim export>');
const real = read(path.join(ROOT, 'NFL_Master_1966_2026.json'));
const sim = read(simFile);
const SHIFT = 1; // sim season = real season + 1
const LAST_REAL = 2025;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * f)] : NaN; };
const pct = v => (100 * v).toFixed(0) + '%';
const out = {};

// ---------------- 1. league stats by decade
const KEYS = ['gp', 'pss', 'pssCmp', 'pssYds', 'pssTD', 'pssInt', 'pssSk', 'rus', 'rusYds', 'pts'];
function teamTotals(league, shift) {
  const by = {};
  for (const t of league.teams) for (const s of t.stats || []) {
    if (s.playoffs || !s.gp) continue;
    const y = s.season - shift;
    if (y < 1966 || y > LAST_REAL) continue;
    const dec = Math.floor(y / 10) * 10;
    const b = by[dec] = by[dec] || Object.fromEntries(KEYS.map(k => [k, 0]));
    for (const k of KEYS) b[k] += s[k] || 0;
  }
  return by;
}
const rates = b => ({ cmp: b.pssCmp / b.pss, ypa: b.pssYds / b.pss, int: b.pssInt / b.pss, sack: b.pssSk / (b.pss + b.pssSk), ypc: b.rusYds / b.rus, passShare: b.pss / (b.pss + b.rus), ppg: b.pts / b.gp });
const R = teamTotals(real, 0), S = teamTotals(sim, SHIFT);
out.decades = {};
console.log('\n1. LEAGUE STATS BY DECADE (sim vs real)');
console.log('decade  cmp%        ypa         int%        sack%       ypc         pass share  pts/g');
for (const dec of Object.keys(R).sort()) {
  if (!S[dec]) continue;
  const r = rates(R[dec]), s = rates(S[dec]);
  out.decades[dec] = { real: r, sim: s };
  const f = (k, m, d) => `${(s[k] * m).toFixed(d)}/${(r[k] * m).toFixed(d)}`.padEnd(12);
  console.log(`${dec}s   ${f('cmp', 100, 1)}${f('ypa', 1, 2)}${f('int', 100, 2)}${f('sack', 100, 2)}${f('ypc', 1, 2)}${f('passShare', 100, 1)}${f('ppg', 1, 1)}`);
}

// ---------------- 2. team records
const realRec = {}, simRec = {};
for (const t of real.teams) for (const s of t.seasons || []) if (s.season <= LAST_REAL && s.won + s.lost) realRec[`${t.tid}|${s.season}`] = (s.won + s.tied / 2) / (s.won + s.lost + s.tied);
for (const t of sim.teams) for (const s of t.seasons || []) if (s.season - SHIFT <= LAST_REAL && s.won + s.lost) simRec[`${t.tid}|${s.season - SHIFT}`] = (s.won + s.tied / 2) / (s.won + s.lost + s.tied);
const pairs = Object.keys(realRec).filter(k => simRec[k] !== undefined).map(k => [simRec[k], realRec[k]]);
const corr = (P) => { const n = P.length, mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of P) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
out.teamCorr = corr(pairs);
const champs = {};
for (const lg of [['real', real, 0], ['sim', sim, SHIFT]]) for (const t of lg[1].teams) for (const s of t.seasons || []) {
  const y = s.season - lg[2]; if (y > LAST_REAL) continue;
  const k = lg[0] + y; champs[k] = champs[k] || { best: -1, tid: [] };
  if (s.playoffRoundsWon > champs[k].best) champs[k] = { best: s.playoffRoundsWon, tid: [t.tid] };
}
let sameChamp = 0, nChamp = 0;
for (let y = 1966; y <= LAST_REAL; y++) if (champs['real' + y] && champs['sim' + y]) { nChamp++; if (champs['real' + y].tid[0] === champs['sim' + y].tid[0]) sameChamp++; }
console.log(`\n2. TEAM RECORDS\n  win % correlation with real (all team-seasons): ${out.teamCorr.toFixed(2)}  (${pairs.length} team-seasons)`);
console.log(`  same champion as real: ${sameChamp} of ${nChamp} seasons`);

// ---------------- 3. careers by position
const POS_STAT = { QB: ['pssYds', 'passing yds'], RB: ['rusYds', 'rushing yds'], WR: ['recYds', 'receiving yds'], TE: ['recYds', 'receiving yds'],
  DL: ['defSk', 'sacks'], LB: ['defTck', 'tackles'], CB: ['defInt', 'interceptions'], S: ['defInt', 'interceptions'] };
const simById = new Map(sim.players.map(p => [p.pid, p]));
const total = (p, k, fromReal) => (p.stats || []).filter(s => !s.playoffs && (fromReal ? s.season <= LAST_REAL && s.season >= 1966 : s.season - SHIFT <= LAST_REAL))
  .reduce((a, s) => a + (k === 'defTck' ? (s.defTckSolo || 0) + (s.defTckAst || 0) : (s[k] || 0)), 0);
const mainPos = p => { const c = {}; for (const r of p.ratings || []) c[r.pos] = (c[r.pos] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
out.careers = {};
console.log('\n3. CAREERS BY POSITION (sim total as % of real, each position\'s top 60 real careers that started 1967+ and ended by 2025)');
for (const [pos, [k, label]] of Object.entries(POS_STAT)) {
  // tackles weren't tracked before 1994 and sacks before 1982: only careers inside the tracked years
  const minStart = k === 'defTck' ? 1994 : k === 'defSk' ? 1982 : 1967;
  const cands = real.players.filter(p => mainPos(p) === pos).map(p => {
    const regs = (p.stats || []).filter(s => !s.playoffs);
    if (!regs.length) return null;
    const first = Math.min(...regs.map(s => s.season)), last = Math.max(...regs.map(s => s.season));
    if (first < minStart || last > LAST_REAL - 1) return null;
    return { p, r: total(p, k, true), first, last };
  }).filter(x => x && x.r > 0).sort((a, b) => b.r - a.r).slice(0, 60);
  const ratios = [], misses = [];
  for (const c of cands) {
    const sp = simById.get(c.p.pid);
    if (!sp) continue;
    const s = total(sp, k, false), ratio = s / c.r;
    ratios.push(ratio);
    misses.push([ratio, `${c.p.firstName} ${c.p.lastName} ${Math.round(s)}/${Math.round(c.r)}`]);
  }
  misses.sort((a, b) => a[0] - b[0]);
  out.careers[pos] = { stat: label, n: ratios.length, median: median(ratios), q25: q(ratios, 0.25), q75: q(ratios, 0.75), low: misses.slice(0, 3).map(m => m[1]), high: misses.slice(-3).map(m => m[1]) };
  const c = out.careers[pos];
  console.log(`  ${pos.padEnd(3)} ${label.padEnd(14)} median ${pct(c.median).padStart(5)}  middle half ${pct(c.q25)}-${pct(c.q75)}   lowest: ${c.low.join(', ')}`);
}

// ---------------- 4. workloads (sim, last 20 seasons)
const lead = [], share = [];
for (const t of sim.teams) for (const ts of t.stats || []) {
  if (ts.playoffs || ts.season - SHIFT < LAST_REAL - 19 || ts.season - SHIFT > LAST_REAL || !ts.rus) continue;
  const rows = sim.players.flatMap(p => (p.stats || []).filter(s => !s.playoffs && s.season === ts.season && s.tid === t.tid));
  const top = rows.reduce((m, s) => Math.max(m, s.rus || 0), 0);
  lead.push(top / ts.gp); share.push(top / ts.rus);
}
const realLead = [], realShare = [];
for (const t of real.teams) for (const ts of t.stats || []) {
  if (ts.playoffs || ts.season < LAST_REAL - 19 || ts.season > LAST_REAL || !ts.rus) continue;
  const rows = real.players.flatMap(p => (p.stats || []).filter(s => !s.playoffs && s.season === ts.season && s.tid === t.tid));
  const top = rows.reduce((m, s) => Math.max(m, s.rus || 0), 0);
  realLead.push(top / ts.gp); realShare.push(top / ts.rus);
}
out.workload = { leadCarriesPerGame: [median(lead), median(realLead)], leadShare: [median(share), median(realShare)] };
console.log(`\n4. WORKLOAD (last 20 seasons, sim/real)\n  lead back carries per game: ${median(lead).toFixed(1)} / ${median(realLead).toFixed(1)}   share of team carries: ${pct(median(share))} / ${pct(median(realShare))}`);

if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
