/**
 * playoff_check.js - proves a league can start at any playoff round in every format era.
 * Part 1 (all seasons, all rounds): slices the master and checks the bracket against that season's rules.
 * Part 2 (era boundaries): creates the league in the real game, reads the bracket, and plays to a champion.
 * Needs the dev game running for part 2. Usage: node --max-old-space-size=14000 tools/playoff_check.js [static]
 */
const fs = require('fs'), path = require('path'), os = require('os');
const OFF = 'C:/Users/sophi/Downloads/NFL Official', PUB = path.join(__dirname, '..', 'football-gm-dev/public/football/nfl');
const E = require(OFF + '/src/nfl_eras.js'), SL = require(OFF + '/src/season_slicer.js');
const master = JSON.parse(fs.readFileSync(OFF + '/NFL_Master_1966_2026.json', 'utf8'));
const slicer = SL.sliceLeague || (globalThis.SEASON_SLICER && globalThis.SEASON_SLICER.sliceLeague), eras = E.getRules ? E : globalThis.NFL_ERAS;
const options = y => y <= 1966 ? [0, 1] : y <= 1977 ? [0, 2, 1] : [0, 3, 2, 1];
const slice = (season, playoffRound) => slicer(master, eras, { season, phase: 'playoffs', week: 1, realDraftRatings: true, playoffRound, secondaryLogos: true });
const at = (tl, y) => { let v; for (const e of tl) if (e.start == null || e.start <= y) v = e.value; return v; };
const live = (m, side) => m[side];
let fails = 0, n = 0; const fail = s => { fails++; console.log('FAIL', s); };
for (const ps of process.env.SKIP_STATIC ? [] : master.playoffSeries) for (const r of options(ps.season)) {
  const y = ps.season; n++;
  const L = slice(y, r), ga = L.gameAttributes, game = ga.season, R = at(ga.numGamesPlayoffSeries, game).length;
  if (R !== ps.series.length) fail(`${y} round option ${r}: game has ${R} rounds, real bracket ${ps.series.length}`);
  if (!ga.nflRealSeeds) { fail(`${y} no real seeds`); continue; }
  if (r === 0) { if (ga.nflStartBracket) fail(`${y} first round got a later-round bracket`); continue; }
  const b = ga.nflStartBracket; if (!b) { fail(`${y} option ${r}: no bracket`); continue; }
  if (b.season !== game) fail(`${y} option ${r}: bracket season ${b.season}, game ${game}`);
  if (b.round !== R - r) fail(`${y} option ${r}: starts at round ${b.round}, expected ${R - r}`);
  const need = 2 ** (R - 1 - b.round); if (b.series[b.round].length !== need) fail(`${y} option ${r}: ${b.series[b.round].length} matchups, expected ${need}`);
  for (const m of b.series[b.round]) if (!live(m, 'home') || !live(m, 'away')) fail(`${y} option ${r}: open slot in the round being played`);
  const active = L.teams.filter(t => !t.disabled).map(t => t.tid); for (const m of b.series[b.round]) for (const t of [m.home, m.away]) if (t && !active.includes(t.tid)) fail(`${y} option ${r}: tid ${t.tid} is not active`);
}
console.log(`static: ${n} season and round combinations, ${fails} failures`);
if (process.argv[2] === 'static') process.exit(fails ? 1 : 0);

const { chromium } = require('../football-gm/node_modules/playwright');
const CASES = [[1966, 0], [1966, 1], [1967, 2], [1969, 1], [1970, 2], [1977, 1], [1978, 0], [1978, 3], [1982, 3], [1987, 2], [1989, 3], [1990, 3], [2019, 3], [2020, 0], [2020, 3], [2025, 2], [2025, 1]];
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'nflpo')), { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, viewport: { width: 1400, height: 900 } });
  for (const [y, r] of CASES) {
    const name = `po_${y}_${r}.json`, label = `${y} option ${r}`; fs.writeFileSync(path.join(PUB, name), JSON.stringify(slice(y, r)));
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200))); p.on('dialog', d => d.accept().catch(() => {}));
    try {
      await p.goto('http://localhost:3000/new_league'); await p.waitForTimeout(9000);
      await p.getByRole('button', { name: 'Customize settings' }).click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800);
      await p.locator('select').filter({ hasText: 'Enter league file URL' }).first().selectOption({ label: 'Enter league file URL' }); await p.waitForTimeout(500);
      await p.getByPlaceholder('URL').fill('http://localhost:3000/nfl/' + name); await p.getByRole('button', { name: 'Load', exact: true }).click(); await p.getByText('Done!').waitFor({ timeout: 240000 });
      await p.getByRole('button', { name: /Create league/i }).click(); await p.waitForURL(/\/l\/\d+/, { timeout: 240000 }); const l = p.url().match(/\/l\/(\d+)/)[1]; await p.waitForTimeout(4000);
      await p.goto(`http://localhost:3000/l/${l}/playoffs`); await p.waitForTimeout(4000); const before = await p.evaluate(() => document.body.innerText.length);
      await p.screenshot({ path: path.join(os.tmpdir(), `po_${y}_${r}.png`) });
      const read = () => p.evaluate(async l => { const db = await new Promise((ok, no) => { const q = indexedDB.open('league' + l); q.onsuccess = () => ok(q.result); q.onerror = no; }); const get = (st, fn) => new Promise(ok => { const q = db.transaction(st).objectStore(st).getAll(); q.onsuccess = () => ok(q.result); }); const ps = await get('playoffSeries'), ga = await get('gameAttributes'); db.close(); const G = Object.fromEntries(ga.map(x => [x.key, x.value])); return { ps: ps.sort((x, y) => x.season - y.season).pop(), season: G.season, phase: G.phase }; }, l);
      let st = null; for (let i = 0; i < 60; i++) {
        await p.getByRole('button', { name: /^Play/ }).first().click({ timeout: 30000 }).catch(() => {}); await p.waitForTimeout(500);
        const it = p.locator('.dropdown-menu.show a, .dropdown-menu.show button').filter({ hasText: /through playoffs|end of playoffs|until end/i }).first(); if (await it.count()) await it.click().catch(() => {}); else await p.keyboard.press('Escape');
        await p.waitForTimeout(5000); st = await read(); if (st.phase > 3 || st.phase === -2) break;
      }
      const real = master.playoffSeries.find(x => x.season === y), R = real.series.length, start = r ? R - r : 0, g = st.ps, problems = [], ids = m => [m.home && m.home.tid, m.away && m.away.tid].filter(x => x != null).sort().join();
      if (st.phase <= 3 && st.phase !== -2) problems.push('never left the playoffs, phase ' + st.phase);
      if (!g || g.series.length !== R) problems.push('rounds ' + (g && g.series.length) + ' vs ' + R);
      else { for (let q = 0; q <= start; q++) { const A = g.series[q].map(ids).sort().join('|'), Bq = real.series[q].map(ids).sort().join('|'); if (A !== Bq) problems.push('round ' + q + ' teams differ: ' + A + ' vs ' + Bq); } const fin = g.series[R - 1][0]; if (!fin || !fin.home || !fin.away || fin.home.won === fin.away.won) problems.push('no champion'); const live = g.series[start].flatMap(m => [m.home, m.away]).filter(Boolean).map(t => t.tid); if (fin && fin.home && !live.includes(fin.home.tid)) problems.push('finalist was not in the start round'); }
      console.log(label, problems.length ? 'FAIL ' + problems.join('; ') : 'ok, real bracket through start round, champion crowned', 'errors', errs.length, errs[0] || ''); if (problems.length || errs.length) fails++;
    } catch (e) { fails++; console.log(label, 'FAIL', e.message.slice(0, 200), errs[0] || ''); }
    await p.close(); fs.unlinkSync(path.join(PUB, name));
  }
  console.log('total failures', fails); await ctx.close(); process.exit(fails ? 1 : 0);
})();
