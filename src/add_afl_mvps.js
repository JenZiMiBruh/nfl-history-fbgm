/**
 * add_afl_mvps.js - the AFL's MVPs for 1966-69, next to the NFL's.
 *
 * Before the 1970 merger the AFL and NFL each named an MVP, but only the NFL's was in the data (Earl Morrall in 1968,
 * not Joe Namath). Football GM has one MVP award, so the AFL's MVP is added as a co-winner, the way it shows the 2003
 * co-MVPs (Peyton Manning and Steve McNair), on the season's awards and on the player.
 *
 * Runs on the master and its rebuild baseline, like merge_ghost_players.js. Safe to run again.
 * Usage: node --max-old-space-size=14000 src/add_afl_mvps.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')];
// AFL MVP (AP and UPI agreed each year): season, name, born
const AFL_MVPS = [
  [1966, 'Jim Nance', 1942],
  [1967, 'Daryle Lamonica', 1941],
  [1968, 'Joe Namath', 1943],
  [1969, 'Daryle Lamonica', 1941],
];

for (const file of FILES) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const [season, name, born] of AFL_MVPS) {
    const [first, ...rest] = name.split(' ');
    const p = m.players.find(x => x.firstName === first && x.lastName === rest.join(' ') && x.born && Math.abs(x.born.year - born) <= 1);
    if (!p) throw new Error(`${name} not found`);
    const row = (p.stats || []).find(s => s.season === season && !s.playoffs);
    if (!row) throw new Error(`${name} has no ${season} season`);
    const season_ = m.awards.find(a => a.season === season);
    const mvp = season_ && season_.awards.find(a => a.actAs === 'mvp');
    if (!mvp) throw new Error(`no MVP award in ${season}`);
    mvp.winner = [mvp.winner].flat();
    if (!mvp.winner.some(w => w.pid === p.pid)) { mvp.winner.push({ pid: p.pid, tid: row.tid }); added++; }
    p.awards = p.awards || [];
    if (!p.awards.some(a => a.season === season && a.actAs === 'mvp')) {
      p.awards.push({ season, index: mvp.index ?? 0, name: mvp.name, shortName: mvp.shortName, rank: 1, actAs: 'mvp' });
    }
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: added ${added} AFL MVPs`);
}
