// Builds leagues the way the season selector and the mod do, and checks each one for problems. Prints one line per
// problem kind with examples, so nothing has to be checked by hand.
//
//   quick (default): each season's key start points, about 5 minutes. Run it after any change.
//   full: every week of every season too, about 25 minutes. Run it before a release.
//
// Usage: node --max-old-space-size=8000 tools/sweep.js <NFL Official folder> [quick|full] [from=1966] [to=2026]
// Checks that find intended cases (roster limits, practice squads) say so in their name, so a new kind stands out.
// A player's current contract in either format: the new one (p.contracts, a yearly amount each season) or the old one
const cur = (p, season) => { if (p.contract) return p.contract; const c = (p.contracts || [])[(p.contracts || []).length - 1]; if (!c || c.endedEarly || p.contractDemand) return null; const exp = c.start + c.amounts.length - 1; return { exp, amount: c.amounts[Math.min(Math.max(season - c.start, 0), c.amounts.length - 1)] }; };
const zlib = require('zlib'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = process.argv[2];
if (!ROOT) throw new Error('usage: sweep.js <NFL Official folder> [quick|full] [from] [to]');
const MODE = process.argv[3] === 'full' ? 'full' : 'quick';
const FROM = +(process.argv[4] || 1966), TO = +(process.argv[5] || 2026);
const SITE = path.join(__dirname, '..', 'site', 'data');
const SL = require(path.join(ROOT, 'src/season_slicer')), E = require(path.join(ROOT, 'src/nfl_eras'));
const SCHED = require(path.join(ROOT, 'data_cache/real_schedules.json'));
const LIVE = require(path.join(ROOT, 'src/live_info')).liveInfo();
const m = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SITE, 'NFL_Selector_Master.json.gz'))));
const dealSourceById = new Map(m.players.map(p => [p.pid, p]));
const probs = {}; let built = 0;
const bad = (k, s) => { (probs[k] = probs[k] || []).push(s); };
const weeklyOf = s => { const f = path.join(SITE, 'weekly', s + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : undefined; };
const byPid = new Map(m.players.map(p => [p.pid, p]));
const at = (v, season) => Array.isArray(v) ? [...v].reverse().find(x => x.start == null || x.start <= season)?.value : v;
const posOf = p => (p.ratings.at(-1) || {}).pos;
// Football GM's own file-format check (the upload warning), when a built game is around: the repo's football-gm, or
// NFLH_GAME pointing at one with build/files/league-schema.json
const GAME = process.env.NFLH_GAME || path.join(__dirname, '..', 'football-gm');
let schemaCheck;
if (fs.existsSync(path.join(GAME, 'build', 'files', 'league-schema.json'))) {
  const warn = console.warn; console.warn = () => {}; // ajv's strict-mode notes about the schema itself
  schemaCheck = require('./schema_check.js').makeCheck(GAME); console.warn = warn;
}
// Real game logs make the console noisy; the slicer prints one line per phone-friendly build
const log = console.log; console.log = () => {};

for (let S = FROM; S <= TO; S++) {
  const wk = weeklyOf(S);
  let maxW = Math.max(1, ...(SCHED[S] || []).map(g => g.day)); if (S >= 2026) maxW = Math.min(maxW, LIVE.nextWeek);
  const cases = [['preseason', 0, false], ['preseason', 0, true], ['regular', 1, false]];
  if (MODE === 'full') for (let w = 2; w <= maxW; w++) cases.push(['regular', w, w === 5]);
  else if (maxW >= 9) cases.push(['regular', Math.ceil(maxW / 2), false]); // one mid-season start
  if (S < 2026) cases.push(['playoffs', 0, false], ['afterplayoffs', 0, false], ['draft', 0, false]);
  for (const [ph, w, lite] of cases) {
    const tag = `${S} ${ph}${w ? ' w' + w : ''}${lite ? ' lite' : ''}`;
    let L;
    try { L = SL.sliceLeague(m, E, { season: S, phase: ph, week: w, lite, weekly: wk, schedules: SCHED, live: LIVE }); built++; }
    catch (e) { bad('crash', tag + ': ' + e.message); continue; }
    const ga = L.gameAttributes, season = ga.season, active = L.teams.filter(t => !t.disabled);
    if (schemaCheck) for (const [k, v] of Object.entries(schemaCheck(L))) bad('FILE FORMAT (Football GM upload warning)', `${tag} ${k} x${v.n}: ${v.example}`);
    const activeTids = new Set(active.map(t => t.tid));
    const offseason = ph === 'afterplayoffs' || ph === 'draft'; // retirements happen, free agency refills
    const inSeason = !offseason;
    const pids = new Set(L.players.map(p => p.pid));
    const seen = new Set(), byTeam = {};
    for (const p of L.players) {
      if (seen.has(p.pid)) bad('duplicate player', tag + ' ' + p.pid); seen.add(p.pid);
      if (p.tid >= 0) {
        const t = L.teams[p.tid]; if (!t || t.disabled) bad('player on missing/disabled team', tag + ' ' + p.firstName + ' ' + p.lastName + ' tid ' + p.tid);
        (byTeam[p.tid] = byTeam[p.tid] || []).push(p);
        { const c = cur(p, season); if (!c || c.exp < season || c.exp > season + 5) bad('contract end', tag + ' ' + p.lastName + ' ' + (c && c.exp)); }
        // "How acquired" is the last transaction: in the live season it should be with his team (Kirk Cousins, traded to
        // Minnesota at the deadline, read "Free agent signing" because the start week's trades were left out). Older
        // seasons lack move records before about 1978 and for some returns to an old team, so only from 2020 on.
        if (season >= 2021) { const tr = p.transactions || [], l = tr[tr.length - 1]; if (l && l.tid !== p.tid) bad('last transaction with another team', tag + ' ' + p.firstName + ' ' + p.lastName); }
        // Ages: a player on a team, by birth year (kickers and punters can play into their late 40s)
        const age = season - ((p.born && p.born.year) || season - 25);
        // ...unless he really played that season (George Blanda at 46)
        const realGames = (byPid.get(p.pid)?.stats || []).some(x => !x.playoffs && x.gp > 0 && x.season === S);
        if (!realGames && (age < 20 || age > (['K', 'P'].includes(posOf(p)) ? 49 : 45))) bad('age out of range', `${tag} ${p.firstName} ${p.lastName} age ${age}`);
      }
      if (p.injury && (typeof p.injury.type !== 'string' || !(p.injury.gamesRemaining >= 0))) bad('bad injury', tag + ' ' + p.lastName);
      if (p.injury && p.injury.gamesRemaining > 60) bad('injury too long', `${tag} ${p.lastName} ${p.injury.type} ${p.injury.gamesRemaining} games`);
      if (p.tid < 0 && p.injury && /^Suspended/.test(p.injury.type) && p.injury.gamesRemaining > 0) bad('suspended player not on a team', `${tag} ${p.lastName}`);
      for (const r of p.relatives || []) if (!pids.has(r.pid)) bad('family link to a missing player', `${tag} ${p.lastName} -> ${r.name}`);
    }
    for (const t of active) {
      const roster = byTeam[t.tid] || [];
      if (!roster.length) { bad('empty team', tag + ' ' + t.abbrev); continue; }
      if (roster.length > ga.maxRosterSize) bad('roster over the limit', tag + ' ' + t.abbrev + ' ' + roster.length + '>' + ga.maxRosterSize);
      if (roster.length < 35 && inSeason) bad('tiny roster', tag + ' ' + t.abbrev + ' ' + roster.length);
      // Key positions: a team with no kicker stopped seasons ("No player found at position K")
      if (inSeason) {
        const n = pos => roster.filter(p => posOf(p) === pos).length;
        // Early eras: position players often kicked and punted, and teams carried fewer QBs (the game fills in)
        if (n('QB') < 2) bad('fewer than 2 QBs (early eras: expected)', `${tag} ${t.abbrev} ${n('QB')}`);
        if (n('K') < 1) bad('no kicker (early eras: a position player kicked)', `${tag} ${t.abbrev}`);
        if (n('P') < 1) bad('no punter (early eras: a position player punted)', `${tag} ${t.abbrev}`);
      }
      // Jersey numbers: two players on one team can't wear the same one
      const nums = {};
      for (const p of roster) if (p.jerseyNumber) (nums[p.jerseyNumber] = nums[p.jerseyNumber] || []).push(p.lastName);
      for (const [num, who] of Object.entries(nums)) if (who.length > 1) bad('shared jersey number (cosmetic)', `${tag} ${t.abbrev} #${num} ${who.join('/')}`);
      // Payroll: far over the cap makes the AI dump players and refuse to sign anyone
      const cap = at(ga.salaryCap, season);
      const payroll = roster.reduce((a, p) => a + ((cur(p, season) || {}).amount || 0), 0);
      if (cap && payroll > cap * 1.3) bad('payroll far over the cap', `${tag} ${t.abbrev} ${Math.round(payroll)} vs cap ${cap}`);
      if (!t.imgURL) bad('team without a logo', `${tag} ${t.abbrev}`);
      const ts = (t.seasons || []).find(x => x.season === season);
      if (ts && (ts.lastTen || []).some(v => ![-1, 0, 1, 'OTL'].includes(v))) bad('lastTen code', tag + ' ' + t.abbrev);
    }
    // Divisions: every active team in a division that exists, and no empty division
    const divs = at(ga.divs, season) || [];
    const divIds = new Set(divs.map(d => d.did));
    for (const t of active) if (!divIds.has(t.did)) bad('team in a missing division', `${tag} ${t.abbrev} did ${t.did}`);
    for (const d of divs) if (!active.some(t => t.did === d.did)) bad('empty division', `${tag} ${d.name}`);
    // Draft picks: each team owns its own pick in every round of each future draft, once (the Ravens once got two sets)
    const rounds = at(ga.numDraftRounds, season);
    const future = [...new Set((L.draftPicks || []).map(dp => dp.season))].filter(s => s > season);
    for (const s of future) for (let r = 1; r <= rounds; r++) {
      const n = {};
      for (const dp of L.draftPicks) if (dp.season === s && dp.round === r) n[dp.originalTid] = (n[dp.originalTid] || 0) + 1;
      // A team needs picks in a draft only if it plays the season those rookies join (no 1997 picks for the Browns,
      // who were inactive 1996-98; picks for the 1999 Browns)
      // Teams that join or leave before that draft get their picks at the expansion or move, so only teams playing
      // throughout are checked
      const startYear = season - 1;
      const steady = t => { for (let y = startYear; y <= s; y++) if (!E.isActive(t.tid, y)) return false; return true; };
      for (const t of L.teams.filter(steady)) if ((n[t.tid] || 0) !== 1) bad('draft picks wrong', `${tag} ${t.abbrev} ${s} round ${r}: ${n[t.tid] || 0}`);
    }
    for (const dp of L.draftPicks || []) if (dp.season > season && !E.isActive(dp.tid, dp.season) && !E.isActive(dp.tid, dp.season - 1)) bad('pick owned by an inactive team', `${tag} ${dp.season} r${dp.round} tid ${dp.tid}`);
    // Schedule: no team plays itself, both teams active, and at week 1 everyone has the full season
    const games = L.schedule || [];
    for (const g of games) {
      if (g.homeTid === g.awayTid) bad('team plays itself', `${tag} ${g.homeTid}`);
      if (g.homeTid >= 0 && (!activeTids.has(g.homeTid) || !activeTids.has(g.awayTid))) bad('game with an inactive team', `${tag} ${g.homeTid} v ${g.awayTid}`);
    }
    if (ph === 'regular' && w === 1 && games.length) {
      const n = {}; for (const g of games) if (g.homeTid >= 0) for (const t of [g.homeTid, g.awayTid]) n[t] = (n[t] || 0) + 1;
      // The real schedule's count (the 2022 Bills-Bengals game was never finished)
      const realCount = {}; for (const g of SCHED[S] || []) for (const t of [g.home, g.away, g.homeTid, g.awayTid]) if (t !== undefined) realCount[t] = (realCount[t] || 0) + 1;
      const want = at(ga.numGames, season);
      for (const t of active) if ((n[t.tid] || 0) !== want && (n[t.tid] || 0) !== realCount[t.tid]) bad('wrong number of games', `${tag} ${t.abbrev} ${n[t.tid] || 0} of ${want}`);
    }
    if (ph === 'regular' && !games.length) bad('no schedule', tag);
    // Awards, All-Star teams and retired numbers only point to players in the league
    for (const a of L.awards || []) for (const aw of a.awards || []) for (const x of [aw.winner].flat(3)) if (x && x.pid !== undefined && !pids.has(x.pid)) bad('award for a missing player', `${tag} ${a.season} ${aw.name} ${x.pid}`);
    for (const a of L.allStars || []) for (const team of a.teams || []) for (const x of team) if (x && x.pid !== undefined && !pids.has(x.pid)) bad('All-Star pick missing', `${tag} ${a.season} ${x.pid}`);
    for (const t of L.teams) for (const j of t.retiredJerseyNumbers || []) if (j.pid !== undefined && !pids.has(j.pid)) bad('retired number for a missing player', `${tag} ${t.abbrev} #${j.number}`);
    // Roster cuts at the start of a season: real regulars and the team's own rookies who stuck
    if (ph === 'preseason' || (ph === 'regular' && w <= 1)) {
      for (const p of L.players) {
        if (p.tid !== -1) continue;
        const src = byPid.get(p.pid);
        const rows = (src.stats || []).filter(s => s.season === S && !s.playoffs);
        if (rows.length !== 1) continue;
        const tid = rows[0].tid;
        const stuck = (src.stats || []).some(s => s.season === S + 1 && !s.playoffs && s.tid === tid);
        if (src.draft && src.draft.tid === tid && src.draft.year === S - 1 && stuck) bad('own rookie who stuck, cut (team had no fringe player to swap)', `${tag} ${p.firstName} ${p.lastName} (${rows[0].gp} games)`);
        if ((rows[0].gp || 0) >= 10) {
          const kept = (byTeam[tid] || []).map(q => ((byPid.get(q.pid).stats || []).find(s => s.season === S && !s.playoffs && s.tid === tid) || {}).gp || 0);
          const fewest = Math.min(...kept);
          if (kept.length && fewest < rows[0].gp - 1) bad('regular cut while a backup was kept (mostly position minimums)', `${tag} ${p.firstName} ${p.lastName} (${rows[0].gp} games; kept someone with ${fewest})`);
        }
      }
    }
    // Mid-season starts: real regulars at week W
    if (w > 1 && wk && wk.lines && !(wk.rosters && S >= 2026)) for (const p of L.players) {
      if (p.tid !== -1) continue;
      const ls = wk.lines[p.pid] || [];
      if (ls.some(x => x[0] < w) && ls.filter(x => x[0] >= w).length >= 2) bad('regular in free agency (2020-21: practice squad)', tag + ' ' + p.firstName + ' ' + p.lastName);
    }
    if (w > 1 && wk) {
      const played = {};
      for (const g of wk.games) if (g[0] < w) for (const t of [g[1], g[2]]) played[t] = (played[t] || 0) + 1;
      for (const t of active) {
        const ts = (t.seasons || []).find(x => x.season === season) || {};
        const n = (ts.won || 0) + (ts.lost || 0) + (ts.tied || 0) + (ts.otl || 0);
        if (n !== (played[t.tid] || 0)) bad('record vs real games', `${tag} ${t.abbrev} ${n} vs ${played[t.tid] || 0}`);
      }
    }
    // History checks: is the right person in the right place? Each of these was a bug a clean sweep once missed.
    {
      const ids = (L.scheduledEvents || []).map(e => e.id);
      if (new Set(ids).size !== ids.length || ids.some(x => x === undefined)) bad('scheduled events without unique ids', tag);
      const lp = new Map(L.players.map(p => [p.pid, p]));
      const pidOf = e => e.info.pid ?? e.info.nflSuspension?.pid ?? e.info.nflInjury?.pid;
      if (!lite) for (const e of L.scheduledEvents || []) { const id = pidOf(e); if (id !== undefined && !lp.has(id)) bad('scheduled event for a player not in the league', tag + ' ' + e.type + ' ' + id); }
      for (const p of L.players) if (typeof p.diedYear === 'number' && p.tid >= 0) bad('dead player on a team', tag + ' ' + p.lastName);
      const early = ph === 'preseason' || (ph === 'regular' && w <= 1);
      // Everyone with a real deal in a soft-cap season is paid it
      if (E.getRules(S).salaryCapType === 'soft') { const R0 = E.getRules(S); for (const p of L.players) { if (p.tid < 0 || !p.contract) continue; // old-format files only: contracts now carry each season's real cap hit (season_slicer.js writeContracts)
 const o = dealSourceById.get(p.pid); const pay = o && E.dealPay(o.realDeals, S); if (pay && p.contract.amount !== Math.max(R0.minContract, Math.min(R0.maxContract, pay))) bad('contract is not the real deal', tag + ' ' + p.firstName + ' ' + p.lastName + ' ' + p.contract.amount + ' vs ' + pay); } }
      // Every saved playoff seed matches the real table
      for (const ps of L.playoffSeries || []) { const real = (m.playoffSeeds || {})[ps.season - 1]; if (!real) continue; const seedOf = {}; for (const list of Object.values(real)) list.forEach((tid, i) => { seedOf[tid] = i + 1; }); for (const round of ps.series || []) for (const g of round) for (const x of [g.home, g.away]) if (x && seedOf[x.tid] !== undefined && x.seed !== seedOf[x.tid]) bad('saved playoff seed is wrong', `${tag} ${ps.season} tid ${x.tid} seed ${x.seed}`); }
      if (ph === 'playoffs' && (m.playoffSeeds || {})[S] && !ga.nflRealSeeds) bad('playoff start without real seeds', tag);
      if (!lite && (ph === 'preseason' || ph === 'regular')) {
        const full = E.getRules(S).numGames, OUT = new Set(['RES', 'PUP', 'NWT', 'SUS', 'EXE', 'RSN', 'RSR', 'E14', 'KNOWN']);
        const statsOf = (src, y) => (src.stats || []).filter(x => !x.playoffs && x.season === y), sum = (r, k) => r.reduce((a2, x) => a2 + (x[k] || 0), 0);
        const out = q => (q.injury && q.injury.gamesRemaining > 0) || (q.nflPendingInjuries || []).length > 0;
        const eventFor = pid => (L.scheduledEvents || []).some(e => e.info.nflInjury && e.info.nflInjury.pid === pid && e.season === season);
        for (const src of m.players) {
          const q = lp.get(src.pid);
          if (!q) continue;
          const prev = statsOf(src, S - 1), starter = sum(prev, 'gp') >= full / 2 && sum(prev, 'gs') >= sum(prev, 'gp') / 2;
          const g = (src.gapSeasons || {})[S];
          if (g) {
            if (early && starter && q.tid !== g.tid) bad('starter who really sat out is not on his real team', `${tag} ${q.firstName} ${q.lastName} tid ${q.tid}, real ${g.tid}`);
            if (OUT.has(g.status) && q.tid >= 0 && !out(q) && !(ph === 'preseason' && eventFor(src.pid))) bad('player out for the season is not out', `${tag} ${q.firstName} ${q.lastName} ${g.status}`);
          }
          if (early && sum(statsOf(src, S), 'gs') >= full / 2 && q.tid < 0) bad('real starter that season in free agency', `${tag} ${q.firstName} ${q.lastName}`);
          if (ph === 'regular' && w > 1 && S >= 1999 && (q.ratings.at(-1) || {}).pos === 'QB') for (const r of (q.stats || []).filter(x => x.season === season && !x.playoffs)) if ((r.gs || 0) > 0 && (r.qbW || 0) + (r.qbL || 0) + (r.qbT || 0) !== r.gs) bad('QB record does not add up to his starts', `${tag} ${q.lastName} ${r.gs} starts, ${r.qbW || 0}-${r.qbL || 0}`);
        }
        if (early) for (const [name, born, y, games, type, died] of E.HISTORICAL_INJURIES) {
          if (y !== S || died || games <= 0 || /playoffs|super bowl/i.test(type) || (name === 'Wes Welker' && y === 2009)) continue; // Welker: last game of the season, no games to miss
          const q = L.players.find(x => `${x.firstName} ${x.lastName}`.replace(/ (Jr\.?|Sr\.?|II|III|IV)$/, '') === name.replace(/ (Jr\.?|Sr\.?|II|III|IV)$/, '') && Math.abs(x.born.year - born) <= 1);
          if (q && q.tid >= 0 && !out(q) && !eventFor(q.pid)) bad('known injury will never happen', `${tag} ${name} ${type}`);
        }
      }
    }
    const ex = {}; for (const e of L.scheduledEvents || []) if (e.type === 'expansionDraft') { const k = e.season + '|' + e.phase; if (ex[k]) bad('duplicate expansion draft', tag + ' ' + k); ex[k] = 1; }
  }
  process.stdout.write(S + ' ');
}
console.log = log;
console.log(`\n${built} leagues built (${MODE})`);
fs.writeFileSync(path.join(os.tmpdir(), 'nflh_sweep_out.json'), JSON.stringify(probs));
if (!Object.keys(probs).length) console.log('NO PROBLEMS');
for (const [k, v] of Object.entries(probs).sort((a, b) => b[1].length - a[1].length)) console.log(`${k}: ${v.length}\n   ${v.slice(0, 6).join('\n   ')}`);
