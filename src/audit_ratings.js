/**
 * audit_ratings.js - the ratings checks to run before every release. Each check prints PASS or FAIL with examples,
 * and the script exits with an error if any check fails.
 *
 * Every check here comes from a real bug that shipped once:
 *   - historic overalls changed by a rebuild meant to touch only recent seasons
 *   - stars capped near 49 by a rule that misread "few starts" (Tony Dorsett 1977, Ja'Marr Chase 2026)
 *   - backups starting over real starters (Uiagalelei over Herbert)
 *   - players rated on the wrong side of the ball (Jimmy Smith, the Jaguars receiver, as a cornerback)
 *   - returners rated as stars at their listed position (Devin Hester 2007 as a CB)
 *   - every quarterback with the same speed (Stafford and Lamar Jackson)
 *   - starters whose live-season stats didn't come through
 *   - all three draft classes flattened to one rating
 *
 * Usage: node --max-old-space-size=14000 src/audit_ratings.js [baseline master to compare history against]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'NFL_Master_1966_2026.json'), 'utf8'));
const BASE = process.argv[2];
const LIVE = 2026;
const nm = p => `${p.firstName} ${p.lastName}`;
const totals = (p, y) => { const s = (p.stats || []).filter(t => t.season === y && !t.playoffs); return k => s.reduce((a, t) => a + (t[k] || 0), 0); };
let failed = 0;
const check = (name, bad, total, examples, allowed = 0) => {
  const ok = bad.length <= allowed;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${bad.length}${total !== undefined ? ' of ' + total : ''}${allowed ? ` (allowed ${allowed})` : ''}`);
  for (const e of (examples || bad).slice(0, 8)) console.log('        ' + e);
};

// 1. Impossible values
const impossible = [];
for (const p of m.players) for (const r of p.ratings || []) if (!(r.ovr >= 1 && r.ovr <= 99) || r.pot < r.ovr) impossible.push(`${nm(p)} ${r.season} ovr ${r.ovr} pot ${r.pot}`);
check('impossible ratings', impossible);

// 2. History against a baseline: overalls before the live seasons should only move where a rule says so
if (BASE) {
  const b = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  const old = new Map();
  const oldPos = new Map();
  for (const p of b.players) for (const r of p.ratings || []) { old.set(p.pid + '|' + r.season, r.ovr); oldPos.set(p.pid + '|' + r.season, r.pos); }
  const drops = [];
  let moved = 0, total = 0;
  for (const p of m.players) for (const r of p.ratings || []) {
    if (r.season >= 2025) continue;
    const o = old.get(p.pid + '|' + r.season);
    if (o === undefined) continue;
    total++;
    if (o !== r.ovr) moved++;
    const t = totals(p, r.season);
    // Intended: returners and fullbacks no longer carry honors earned on returns or as blockers, and players moved to
    // the position they really played are rated there
    const intended = t('pr') + t('kr') >= 30 || (r.pos === 'RB' && t('rus') + t('rec') < 60) || oldPos.get(p.pid + '|' + r.season) !== r.pos;
    if (r.ovr - o <= -12 && t('av') >= 6 && !intended) drops.push(`${r.season} ${nm(p)} ${r.pos} ${o} -> ${r.ovr} (AV ${t('av')}, ${t('gp')} gp)`);
  }
  console.log(`info  historic overalls changed vs baseline: ${moved} of ${total}`);
  check('historic players with real value who dropped 12+', drops, total);
}

// 3. Real starting quarterbacks start (live season)
const qbBad = [];
for (const t of m.teams) {
  const qbs = m.players.filter(p => p.tid === t.tid && p.ratings.at(-1).season === LIVE && p.ratings.at(-1).pos === 'QB' && !(p.injury && p.injury.gamesRemaining > 0));
  const st = p => (p.stats || []).filter(s => s.season === LIVE && !s.playoffs && s.tid === t.tid);
  const gs = p => st(p).reduce((a, s) => a + (s.gs || 0), 0), att = p => st(p).reduce((a, s) => a + (s.pss || 0), 0);
  const real = qbs.slice().sort((a, b) => gs(b) - gs(a) || att(b) - att(a))[0];
  const top = qbs.slice().sort((a, b) => b.ratings.at(-1).ovrs.QB - a.ratings.at(-1).ovrs.QB)[0];
  if (real && top && real !== top) qbBad.push(`${t.abbrev}: ${nm(real)} ${real.ratings.at(-1).ovr} behind ${nm(top)} ${top.ratings.at(-1).ovr}`);
}
check('teams where a backup QB would start (live season)', qbBad, 32);

// 4. Current players losing a lot while producing
const drops = [];
for (const p of m.players.filter(p => p.tid >= 0)) {
  const r = p.ratings.at(-1), q = p.ratings.find(x => x.season === LIVE - 1);
  if (!q || q.pos !== r.pos || r.season !== LIVE) continue;
  const t = totals(p, LIVE);
  const prod = t('pssYds') / 250 + t('rusYds') / 60 + t('recYds') / 60 + t('defTckSolo') / 5 + t('defSk') * 2 + t('defInt') * 3;
  if (q.ovr - r.ovr >= 20 && prod >= 8 && !(p.injury && p.injury.gamesRemaining > 0)) drops.push(`${nm(p)} ${r.pos} ${q.ovr} -> ${r.ovr}`);
}
check('current players down 20+ while producing', drops, undefined, drops, 3);

// 5. Stars of last season rated below 55 now, while playing
const sunk = [];
for (const p of m.players.filter(p => p.tid >= 0)) {
  const r = p.ratings.at(-1), q = p.ratings.find(x => x.season === LIVE - 1);
  if (!q || r.season !== LIVE || q.ovr < 78 || r.ovr >= 55) continue;
  if (totals(p, LIVE)('gp') >= 3) sunk.push(`${nm(p)} ${r.pos} ${q.ovr} -> ${r.ovr}`);
}
check('last season\'s stars (78+) now under 55 while playing', sunk);

// 6. Wrong side of the ball
const side = [];
for (const p of m.players) for (const r of p.ratings || []) {
  const t = totals(p, r.season);
  if (!t('gp')) continue;
  const off = t('rec') + t('rus') + t('pss'), def = t('defTckSolo') + t('defSk') * 3 + t('defInt') * 5 + t('defPssDef');
  if (['DL', 'LB', 'CB', 'S'].includes(r.pos) && off >= 25 && def < 5 && r.ovr >= 55) side.push(`${r.season} ${nm(p)} ${r.pos} ${r.ovr} (offensive touches ${off})`);
  if (['WR', 'RB', 'TE', 'QB'].includes(r.pos) && def >= 30 && off < 5 && r.ovr >= 55) side.push(`${r.season} ${nm(p)} ${r.pos} ${r.ovr} (defense ${def})`);
}
check('rated on the wrong side of the ball', side);

// 7. Returners rated as stars at their listed position
const ret = [];
for (const p of m.players) for (const r of p.ratings || []) {
  if (!['CB', 'S', 'RB', 'WR'].includes(r.pos) || r.ovr < 72) continue;
  const t = totals(p, r.season);
  const work = { CB: t('defInt') * 5 + t('defPssDef') + t('defTckSolo'), S: t('defInt') * 5 + t('defPssDef') + t('defTckSolo'), RB: t('rus') + t('rec'), WR: t('rec') }[r.pos];
  if (t('pr') + t('kr') >= 30 && work < 10 && (r.season >= 1994 || ['RB', 'WR'].includes(r.pos))) ret.push(`${r.season} ${nm(p)} ${r.pos} ${r.ovr} (returns ${t('pr') + t('kr')}, position work ${work})`);
}
check('returners rated 72+ at a position they barely played', ret);

// 8. Quarterback speed follows running (live season starters)
const qbs = m.players.filter(p => p.tid >= 0 && p.ratings.at(-1).pos === 'QB' && totals(p, LIVE)('pss') >= 50).map(p => p.ratings.at(-1).spd);
const spread = Math.max(...qbs) - Math.min(...qbs);
check('quarterback speed spread (fastest minus slowest starter) under 30', spread < 30 ? [`spread ${spread}`] : []);

// 9. Missing live-season data: a healthy rostered player rated 65+ whose team has played 6+ games but who has no
// games this season, and isn't a newly arrived player (his team this season differs from last)
const teamGames = {};
for (const t of m.teams) teamGames[t.tid] = ((t.seasons || []).find(x => x.season === LIVE) || {}).gp || 0;
const missing = [];
for (const p of m.players.filter(p => p.tid >= 0 && p.ratings.at(-1).season === LIVE)) {
  if (p.ratings.at(-1).ovr < 65 || (p.injury && p.injury.gamesRemaining > 0) || teamGames[p.tid] < 6) continue;
  if (totals(p, LIVE)('gp') === 0) missing.push(`${nm(p)} ${p.ratings.at(-1).pos} ${p.ratings.at(-1).ovr} (${m.teams[p.tid].abbrev}), no ${LIVE} games`);
}
check('healthy 65+ players with no games this season (missing data?)', missing);

// 10. Draft classes keep their spread: prospects must not all share one rating (a rebuild once flattened all three
// classes to 40 overall / 59 potential)
const flat = [];
const classes = {};
for (const p of m.players.filter(p => p.tid === -2)) (classes[p.draft.year] = classes[p.draft.year] || []).push(p.ratings.at(-1));
for (const [y, rs] of Object.entries(classes)) {
  const ovrs = rs.map(r => r.ovr).sort((a, b) => b - a), pots = rs.map(r => r.pot).sort((a, b) => b - a);
  const distinct = new Set(ovrs).size;
  const line = `class ${y}: ${rs.length} prospects, ${distinct} distinct overalls, top ${ovrs.slice(0, 3).join('/')}, median ${ovrs[ovrs.length >> 1]}, top potential ${pots[0]}`;
  if (distinct < 10 || ovrs[0] - ovrs[ovrs.length >> 1] < 8 || pots[0] < 65) flat.push(line);
  else console.log('info  draft ' + line);
}
check('flattened draft classes', flat);

// 11. Top of each position (for a human look)
for (const pos of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S']) {
  const v = m.players.filter(p => p.tid >= 0 && p.ratings.at(-1).pos === pos).sort((a, b) => b.ratings.at(-1).ovr - a.ratings.at(-1).ovr).slice(0, 8);
  console.log(`info  top ${pos.padEnd(2)} ${v.map(p => `${p.lastName} ${p.ratings.at(-1).ovr}`).join(', ')}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
