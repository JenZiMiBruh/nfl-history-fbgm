/**
 * fix_co_mvps.js - the AP's shared MVP awards: 1997 Brett Favre and Barry Sanders, 2003 Peyton Manning and
 * Steve McNair. The award sources list one winner, so the co-winner is added to the season's award and to his
 * player page (in the same format as the other winner's).
 * Usage: node --max-old-space-size=14000 src/fix_co_mvps.js
 */
const fs = require('fs');
const path = require('path');
const MASTER = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
const CO = [[1997, 'Barry', 'Sanders', 'RB'], [2003, 'Steve', 'McNair', 'QB']];
for (const [season, first, last, pos] of CO) {
  const p = m.players.filter(x => x.firstName === first && x.lastName === last && x.ratings.some(r => r.pos === pos))
    .find(x => (x.stats || []).some(s => s.season === season && !s.playoffs));
  const st = p.stats.find(s => s.season === season && !s.playoffs);
  const mvp = m.awards.find(a => a.season === season).awards.find(a => a.name === 'Most Valuable Player');
  const list = mvp.winner || mvp.winners;
  if (!list.some(w => w.pid === p.pid)) list.push({ pid: p.pid, tid: st.tid });
  // copy the other winner's player-page entry
  const other = m.players.find(x => x.pid === list[0].pid);
  const tmpl = other.awards.find(a => a.season === season && a.name === 'Most Valuable Player');
  if (!p.awards.some(a => a.season === season && a.name === 'Most Valuable Player')) p.awards.push(Object.assign({}, tmpl));
  console.log(`${season} MVP: ${list.map(w => m.players.find(x => x.pid === w.pid).lastName).join(' & ')}`);
}
fs.writeFileSync(MASTER, JSON.stringify(m));
