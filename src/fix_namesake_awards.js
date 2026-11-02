/**
 * fix_namesake_awards.js - moves awards that landed on the wrong player when two players share a name (three
 * Reggie Whites, two Gary Andersons, ...). A season award (Pro Bowl, All-Pro, ...) moves to the namesake who played
 * that season with clearly more Approximate Value; a Hall of Fame induction moves to the namesake with the most
 * career Approximate Value (and data_cache/hof_years.json follows it).
 * Usage: node --max-old-space-size=14000 src/fix_namesake_awards.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const HOF = path.join(ROOT, 'data_cache', 'hof_years.json');
const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const hofYears = fs.existsSync(HOF) ? JSON.parse(fs.readFileSync(HOF, 'utf8')) : {};

const seasonAv = (p, season) => (p.stats || []).filter(s => !s.playoffs && s.season === season).reduce((a, s) => a + (s.av || 0), 0);
const seasonGp = (p, season) => (p.stats || []).filter(s => !s.playoffs && s.season === season).reduce((a, s) => a + (s.gp || 0), 0);
const careerAv = (p) => (p.stats || []).filter(s => !s.playoffs).reduce((a, s) => a + (s.av || 0), 0);

const byName = new Map();
for (const p of master.players) {
  const k = `${p.firstName} ${p.lastName}`;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

let movedSeason = 0, movedHof = 0;
for (const [, list] of byName) {
  if (list.length < 2) continue;
  for (const p of list) {
    const keep = [];
    for (const a of p.awards || []) {
      if (a.type === 'Won Championship') { keep.push(a); continue; } // team awards follow the roster
      let to = p;
      if (a.type === 'Inducted into the Hall of Fame') {
        to = list.reduce((x, y) => (careerAv(y) > careerAv(x) ? y : x));
      } else {
        const mine = seasonAv(p, a.season);
        const best = list.filter(q => seasonGp(q, a.season) > 0).reduce((x, y) => (!x || seasonAv(y, a.season) > seasonAv(x, a.season) ? y : x), null);
        if (best && best !== p && seasonAv(best, a.season) > mine + 3) to = best;
      }
      if (to === p) { keep.push(a); continue; }
      to.awards = to.awards || [];
      if (!to.awards.some(b => b.season === a.season && b.type === a.type)) to.awards.push(a);
      if (a.type === 'Inducted into the Hall of Fame') {
        movedHof++;
        if (hofYears[p.pid] !== undefined) { hofYears[to.pid] = hofYears[p.pid]; delete hofYears[p.pid]; }
        to.hof = p.hof || to.hof; p.hof = false;
      } else movedSeason++;
    }
    p.awards = keep;
  }
}
for (const p of master.players) if (p.awards) p.awards.sort((a, b) => a.season - b.season);

// League award records (MVP, All-Pro teams, ...) name winners by pid: same check
const byPid = new Map(master.players.map(p => [p.pid, p]));
let movedLeague = 0;
const fixWinner = (x, season) => {
  const p = byPid.get(x.pid);
  if (!p) return;
  const list = byName.get(`${p.firstName} ${p.lastName}`);
  if (!list || list.length < 2) return;
  const best = list.filter(q => seasonGp(q, season) > 0).reduce((a, b) => (!a || seasonAv(b, season) > seasonAv(a, season) ? b : a), null);
  if (best && best !== p && seasonAv(best, season) > seasonAv(p, season) + 3) { x.pid = best.pid; movedLeague++; }
};
for (const a of master.awards || []) for (const aw of a.awards || []) {
  for (const w of aw.winner || []) {
    if (Array.isArray(w)) w.forEach(x => fixWinner(x, a.season));
    else if (w && typeof w === 'object') fixWinner(w, a.season);
  }
}
console.log('moved league award winners:', movedLeague);
fs.writeFileSync(FILE, JSON.stringify(master));
fs.writeFileSync(HOF, JSON.stringify(hofYears));
console.log('moved season awards:', movedSeason, ' Hall of Fame inductions:', movedHof);
