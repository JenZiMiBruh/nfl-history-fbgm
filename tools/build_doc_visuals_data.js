/**
 * build_doc_visuals_data.js - numbers for the explainer charts in the docs (site/visuals.html), all from the league.
 *   curve       percentile -> overall, with the honor floors
 *   example     Barry Sanders 1997 end to end: AV/game rank, smoothing, MVP floor, stats vs his era, final ratings
 *   dist        the 2025 season's overall ratings by position
 *   careers     rating by season for a few legends
 *   eras        era factors by season (data_cache/era_factors.json)
 *   decades     sim vs real by decade (an analyze_sim.js output)
 *   funnel      draft class funnel (data_cache/prospects)
 *
 * Usage: node --max-old-space-size=14000 tools/build_doc_visuals_data.js <NFL Official folder> <sim analysis.json>
 */
const fs = require('fs');
const path = require('path');
const [ROOT, analysisFile] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
const out = {};
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

out.curve = { points: [[0, 28], [0.2, 38], [0.5, 47], [0.75, 56], [0.9, 65], [0.96, 72], [0.985, 78], [0.995, 83], [1, 88]],
  floors: [['MVP', 0.998], ['Player of the Year', 0.995], ['1st-team All-Pro', 0.99], ['2nd-team All-Pro', 0.975], ['Pro Bowl', 0.95]] };

// Worked example: Barry Sanders, 1997
const mainPos = (p, season) => (p.ratings.find(r => r.season === season) || p.ratings[0]).pos;
const SEASON = 1997;
const rbRows = [];
for (const p of m.players) for (const s of p.stats || []) if (!s.playoffs && s.season === SEASON && s.gp >= 4 && mainPos(p, SEASON) === 'RB') rbRows.push({ p, s });
const avpg = r => (r.s.av || 0) / r.s.gp;
const sorted = rbRows.map(avpg).sort((a, b) => a - b);
const bs = rbRows.find(r => r.p.firstName === 'Barry' && r.p.lastName === 'Sanders');
const pctOf = v => sorted.filter(x => x < v).length / sorted.length;
const qual = rbRows.filter(r => r.s.rus >= 60);
const zOf = (f) => { const v = qual.map(f); const mu = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length); return x => (f(x) - mu) / sd; };
const ypc = r => r.s.rusYds / r.s.rus, rpg = r => r.s.rusYds / r.s.gp, td = r => r.s.rusTD / r.s.rus;
const r97 = bs.p.ratings.find(r => r.season === SEASON);
out.example = {
  name: 'Barry Sanders', season: SEASON, team: 'Detroit Lions', av: bs.s.av, gp: bs.s.gp, avpg: avpg(bs),
  pct: pctOf(avpg(bs)), floor: 0.998, rbCount: rbRows.length,
  stats: { rus: bs.s.rus, rusYds: bs.s.rusYds, rusTD: bs.s.rusTD, ypc: ypc(bs), rpg: rpg(bs) },
  league: { ypc: median(qual.map(ypc)), rpg: median(qual.map(rpg)) },
  z: { ypc: zOf(ypc)(bs), rpg: zOf(rpg)(bs), td: zOf(td)(bs) },
  ratings: Object.fromEntries(['spd', 'elu', 'bsc', 'stre', 'hnd', 'rtr', 'pbk', 'rbk', 'hgt', 'endu'].map(k => [k, r97[k]])), ovr: r97.ovr,
  awards: (bs.p.awards || []).filter(a => a.season === SEASON).map(a => a.name || a.type),
  career: bs.p.ratings.filter(r => r.season >= 1989 && r.season <= 1998).map(r => [r.season, r.ovr]),
};

// 2025 distribution by position
out.dist = {};
for (const p of m.players) {
  const r = p.ratings.find(x => x.season === 2025);
  if (!r || !(p.stats || []).some(s => s.season === 2025 && !s.playoffs && s.gp > 0)) continue;
  (out.dist[r.pos] = out.dist[r.pos] || []).push(r.ovr);
}
for (const k of Object.keys(out.dist)) out.dist[k].sort((a, b) => b - a);

// Legends' careers
out.careers = [];
for (const [f, l, pos] of [['Tom', 'Brady', 'QB'], ['Jerry', 'Rice', 'WR'], ['Peyton', 'Manning', 'QB'], ['Barry', 'Sanders', 'RB'], ['Reggie', 'White', 'DL'], ['Patrick', 'Mahomes', 'QB']]) {
  const p = m.players.filter(x => x.firstName === f && x.lastName === l).sort((a, b) => b.ratings.length - a.ratings.length)
    .find(x => x.ratings.some(r => r.pos === pos));
  if (!p) continue;
  const seasons = new Set((p.stats || []).filter(s => !s.playoffs && s.gp > 0).map(s => s.season));
  out.careers.push({ name: `${f} ${l}`, pos, pts: p.ratings.filter(r => seasons.has(r.season)).map(r => [r.season, r.ovr]) });
}

// Era factors
const ef = JSON.parse(fs.readFileSync(path.join(ROOT, 'data_cache', 'era_factors.json'), 'utf8'));
out.eras = Object.entries(ef).map(([y, f]) => [+y, f.completionFactor, f.intFactor, f.rushYdsFactor, f.sackFactor]).sort((a, b) => a[0] - b[0]);
out.decades = JSON.parse(fs.readFileSync(analysisFile, 'utf8')).decades;

// Draft funnel
const P = path.join(ROOT, 'data_cache', 'prospects');
const players = JSON.parse(fs.readFileSync(path.join(P, 'players_2026.json'), 'utf8'));
const teams = JSON.parse(fs.readFileSync(path.join(P, 'teams_2026.json'), 'utf8'));
const recruits = fs.readdirSync(P).filter(f => /^recruits_\d+\.json$/.test(f)).reduce((n, f) => n + JSON.parse(fs.readFileSync(path.join(P, f), 'utf8')).length, 0);
const conf = new Set(teams.filter(t => t.conf).map(t => t.id));
out.funnel = { rosters: players.length, fbs: players.filter(p => conf.has(p.team)).length, teams: conf.size,
  byClass: { 2027: players.filter(p => conf.has(p.team) && p.cls >= 3).length, 2028: players.filter(p => conf.has(p.team) && p.cls === 2).length, 2029: players.filter(p => conf.has(p.team) && p.cls === 1).length },
  recruits, statLines: fs.readdirSync(path.join(P, 'stats')).length, perClass: 340, board: JSON.parse(fs.readFileSync(path.join(P, 'board_2027.json'), 'utf8')).length };

out.counts = { players: m.players.length, deceased: m.players.filter(p => p.diedYear).length, photos: m.players.filter(p => p.imgURL).length };
fs.writeFileSync(path.join(__dirname, '..', 'site', 'data', 'docviz.json'), JSON.stringify(out));
console.log(JSON.stringify({ example: out.example, funnel: out.funnel, counts: out.counts, careers: out.careers.map(c => c.name + ' ' + c.pts.length) }, null, 1));
