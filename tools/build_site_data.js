/**
 * build_site_data.js - extracts what the team history explorer (site/) needs from the master league:
 * each franchise's looks (logo + jersey colors by era), season records, and its players' real ratings
 * and stat lines season by season. Logos are written as PNG files so the JSON stays small.
 *
 * Usage: node --max-old-space-size=14000 tools/build_site_data.js <NFL_Master_1966_2026.json> <nfl_eras.js> <logos_eras_final.json>
 * Output: site/data/teams.json, site/data/team-<tid>.json, site/logos/<tid>-<n>.png
 */
const fs = require('fs');
const path = require('path');

const [masterFile, erasFile, logoErasFile] = process.argv.slice(2);
if (!logoErasFile) throw new Error('usage: build_site_data.js <master.json> <nfl_eras.js> <logos_eras_final.json>');
const E = require(path.resolve(erasFile));
const LOGO_ERAS = JSON.parse(fs.readFileSync(logoErasFile, 'utf8')).primary;
const master = JSON.parse(fs.readFileSync(masterFile, 'utf8'));

const SITE = path.join(__dirname, '..', 'site');
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.mkdirSync(path.join(SITE, 'logos'), { recursive: true });

const FIRST = 1966, LAST = 2026;

// A franchise's looks: a new one whenever its name, city, colors or logo change.
function looks(tid) {
  const t = E.TEAMS.find(x => x.tid === tid), eras = LOGO_ERAS[tid] || [];
  const start = Math.max(FIRST, t.activeFrom || 0);
  const years = new Set([start]);
  for (const s of t.segs) if (s.from > start && (s.colors || s.name || s.region || s.jersey)) years.add(s.from);
  for (const e of E.HOME_JERSEYS[tid] || []) if (e[0] > start) years.add(e[0]);
  for (const e of eras) if (e.from > start) years.add(e.from);
  const out = [];
  for (const y of [...years].filter(y => y <= LAST).sort((a, b) => a - b)) {
    const st = {};
    for (const s of t.segs) if (s.from <= y) Object.assign(st, s);
    const era = [...eras].reverse().find(e => e.from <= y) || eras[0];
    // Jersey colors exactly as the game shows them (home jersey by season), falling back to team colors
    const hj = (E.HOME_JERSEYS[tid] || []).filter(e => e[0] <= y).pop();
    const look = { from: y, region: st.region, name: st.name, abbrev: st.abbrev, colors: hj ? hj[1] : st.colors, jersey: hj ? hj[2] : st.jersey, img: era && era.data };
    const p = out[out.length - 1];
    if (p && p.img === look.img && String(p.colors) === String(look.colors) && p.name === look.name && p.region === look.region) continue;
    if (p) p.to = y - 1;
    out.push(look);
  }
  out[out.length - 1].to = LAST;
  return out;
}

const statLine = (pos, s) => {
  const n = k => s[k] || 0;
  if (pos === 'QB') return [n('pssYds'), 'pass yds', n('pssTD'), 'TD', n('pssInt'), 'INT'];
  if (pos === 'RB') return [n('rusYds'), 'rush yds', n('rusTD') + n('recTD'), 'TD', n('rec'), 'rec'];
  if (pos === 'WR' || pos === 'TE') return [n('rec'), 'rec', n('recYds'), 'yds', n('recTD'), 'TD'];
  if (pos === 'K') return [n('fg0') + n('fg20') + n('fg30') + n('fg40') + n('fg50'), 'FG', n('xp'), 'XP'];
  if (pos === 'P') return [n('pnt'), 'punts', n('pntYds'), 'yds'];
  if (pos === 'OL') return [n('gs'), 'starts'];
  return [n('defTckSolo') + n('defTckAst'), 'tkl', n('defSk'), 'sacks', n('defInt'), 'INT'];
};

const AWARD_SHORT = { 'Most Valuable Player': 'MVP', 'Offensive Player of the Year': 'OPOY', 'Defensive Player of the Year': 'DPOY', 'Super Bowl MVP': 'SB MVP' };

// A championship = won the last playoff round that season.
const roundsBySeason = {};
for (const t of master.teams) for (const s of t.seasons || []) {
  if (s.playoffRoundsWon > (roundsBySeason[s.season] ?? -1)) roundsBySeason[s.season] = s.playoffRoundsWon;
}
const isChamp = s => roundsBySeason[s.y] !== undefined && s.po === roundsBySeason[s.y];

const index = [];
for (const t of master.teams) {
  const tid = t.tid;
  const L = looks(tid).map((l, i) => {
    let logo = null;
    if (l.img && l.img.startsWith('data:image/png;base64,')) {
      logo = `logos/${tid}-${i}.png`;
      fs.writeFileSync(path.join(SITE, logo), Buffer.from(l.img.split(',')[1], 'base64'));
    }
    const { img, ...rest } = l;
    return { ...rest, logo };
  });

  const seasons = (t.seasons || []).filter(s => s.season >= FIRST && s.season <= LAST && (s.won + s.lost + (s.tied || 0)) > 0)
    .map(s => ({ y: s.season, w: s.won, l: s.lost, t: s.tied || 0, po: s.playoffRoundsWon ?? -1, n: `${s.region} ${s.name}` }));

  // Players: every regular season row on this franchise.
  const players = [];
  for (const p of master.players) {
    const rows = (p.stats || []).filter(s => !s.playoffs && s.tid === tid && s.season >= FIRST && s.season <= LAST && s.gp > 0);
    if (!rows.length) continue;
    const ratingBy = {};
    for (const r of p.ratings || []) ratingBy[r.season] = r;
    const seas = [];
    let av = 0;
    for (const s of rows) {
      const r = ratingBy[s.season];
      if (!r) continue;
      av += s.av || 0;
      seas.push([s.season, r.ovr, r.pos, s.gp, s.jerseyNumber || '', ...statLine(r.pos, s)]);
    }
    if (!seas.length) continue;
    const awards = {};
    const teamYears = new Set(seas.map(x => x[0]));
    for (const a of p.awards || []) {
      if (!teamYears.has(a.season)) continue;
      const k = AWARD_SHORT[a.name] || (a.type === 'All-Star' ? 'Pro Bowl' : a.name === 'All-League' && a.rank === 1 ? 'All-Pro' : null);
      if (k) awards[k] = (awards[k] || 0) + 1;
    }
    players.push({
      id: p.pid, n: `${p.firstName} ${p.lastName}`, pos: seas.reduce((m, x) => (x[1] > m[1] ? x : m))[2],
      av, peak: Math.max(...seas.map(x => x[1])), hof: p.hof ? 1 : 0, aw: awards,
      img: p.imgURL && !p.imgURL.startsWith('data:') ? p.imgURL : undefined, s: seas,
    });
  }
  // Keep the franchise's notable players: top by value with the team, plus each season's best five.
  players.sort((a, b) => b.av - a.av);
  const keep = new Set(players.slice(0, 120).map(p => p.id));
  const bySeason = {};
  for (const p of players) for (const x of p.s) (bySeason[x[0]] = bySeason[x[0]] || []).push([x[1], p.id]);
  const seasonBest = {};
  for (const [y, list] of Object.entries(bySeason)) {
    list.sort((a, b) => b[0] - a[0]);
    seasonBest[y] = list.slice(0, 8).map(x => x[1]);
    seasonBest[y].forEach(id => keep.add(id));
  }
  const kept = players.filter(p => keep.has(p.id));

  const cur = L[L.length - 1];
  const champs = seasons.filter(s => s.po >= 0 && isChamp(s)).map(s => s.y);
  const out = {
    tid, region: cur.region, name: cur.name, abbrev: cur.abbrev, colors: cur.colors, logo: cur.logo,
    looks: L, seasons, champs, seasonBest, players: kept,
    retired: (t.retiredJerseyNumbers || []).map(r => ({ num: r.number, text: r.text || '', season: r.seasonRetired })),
  };
  fs.writeFileSync(path.join(SITE, 'data', `team-${tid}.json`), JSON.stringify(out));
  index.push({ tid, region: cur.region, name: cur.name, abbrev: cur.abbrev, colors: cur.colors, logo: cur.logo, looks: L.length, from: L[0].from, champs: champs.length });
}

index.sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name));
fs.writeFileSync(path.join(SITE, 'data', 'teams.json'), JSON.stringify(index));
// The same data as one script, so the explorer also works opened straight from disk (browsers block fetch() on file://)
// Draft classes: the real college prospects (master players with an ESPN id), by draft (calendar year = draft.year + 1)
const draft = {};
for (const p of master.players) {
  if (p.espnId === undefined || p.tid !== -2) continue;
  const y = p.draft.year + 1, r = p.ratings[0];
  (draft[y] = draft[y] || []).push({ rank: p.prospectRank, n: p.firstName + ' ' + p.lastName, pos: r.pos, college: p.college, ovr: r.ovr, pot: r.pot, img: p.imgURL, home: p.born && p.born.loc, hgt: p.hgt, wgt: p.weight });
}
for (const y of Object.keys(draft)) draft[y].sort((a, b) => a.rank - b.rank);
fs.writeFileSync(path.join(SITE, 'data', 'draft.json'), JSON.stringify(draft));
const bundle = { teams: index, team: {}, draft };
for (const t of index) bundle.team[t.tid] = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'team-' + t.tid + '.json'), 'utf8'));
fs.writeFileSync(path.join(SITE, 'data', 'all.js'), 'window.SITE_DATA = ' + JSON.stringify(bundle) + ';');
console.log('teams', index.length, 'total KB', fs.readdirSync(path.join(SITE, 'data')).reduce((n, f) => n + fs.statSync(path.join(SITE, 'data', f)).size, 0) >> 10);
