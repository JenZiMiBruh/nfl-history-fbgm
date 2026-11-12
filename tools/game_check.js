/**
 * game_check.js - opens the built league in the real game, saves the same screens each time, and can sim offseasons.
 * Needs the dev game running (SPORT=football node tools/watch/cli.ts --host) and the Lite league at public/football/nfl/check.json.gz.
 *
 * Usage: node tools/game_check.js <output folder> [seasons to sim, default 0]
 */
const { chromium } = require('../football-gm/node_modules/playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.argv[2], SIMS = +process.argv[3] || 0;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'nflcheck')), { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--js-flags=--max-old-space-size=10000'], viewport: { width: 1400, height: 1000 }, colorScheme: 'dark' });
  const p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 160))); p.on('crash', () => console.log('PAGE CRASHED')); p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto('http://localhost:3000/new_league'); await p.waitForTimeout(12000);
  await p.getByRole('button', { name: 'Customize settings' }).click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800);
  await p.locator('select').filter({ hasText: 'Enter league file URL' }).first().selectOption({ label: 'Enter league file URL' }); await p.waitForTimeout(500);
  await p.getByPlaceholder('URL').fill('http://localhost:3000/nfl/check.json.gz'); await p.getByRole('button', { name: 'Load', exact: true }).click(); await p.getByText('Done!').waitFor({ timeout: 90000 });
  await p.getByRole('button', { name: /Create league/i }).click(); await p.waitForURL(/\/l\/\d+/, { timeout: 180000 }); const l = p.url().match(/\/l\/(\d+)/)[1]; await p.waitForTimeout(4000);
  for (const [n, u] of [['standings', 'standings'], ['roster', 'roster/BUF'], ['player_rankings', 'player_ratings'], ['news', 'news'], ['calendar', 'calendar']]) { await p.goto(`http://localhost:3000/l/${l}/${u}`); await p.waitForTimeout(3500); await p.screenshot({ path: path.join(OUT, n + '.png') }); }
  if (SIMS) {
    const seasonNow = () => p.evaluate(() => +(document.body.innerText.match(/(20\d\d) (?:preseason|regular season|playoffs|before draft|draft|after draft|re-sign|free agency)/i) || [])[1]);
    const start = await seasonNow(); console.log('start season', start);
    for (let i = 0; i < 900; i++) {
      const s = await seasonNow(); if (s >= start + SIMS) break; { const ph = await p.evaluate(() => (document.body.innerText.match(/(20dd) (preseason|regular season|playoffs|before draft|draft|after draft|re-sign[a-z ]*|free agency)/i) || [''])[0]); if (ph !== globalThis.lastPh) { globalThis.lastPh = ph; console.log(new Date().toISOString().slice(11, 19), 'step', i, ph); } }
      const play = p.getByRole('button', { name: /^Play/ }).first(); await play.click({ timeout: 60000 }).catch(() => {}); await p.waitForTimeout(600);
      // the game waits on the owner's message after the season and on the user's own draft picks: handle both, or the sim never ends
      const menu = p.locator('.dropdown-menu.show a, .dropdown-menu.show button');
      if (await menu.filter({ hasText: /read new message/i }).count()) { await menu.filter({ hasText: /read new message/i }).first().click().catch(() => {}); await p.waitForTimeout(2500); continue; }
      if (await menu.filter({ hasText: /view draft/i }).count() && !(await menu.filter({ hasText: /until/i }).count())) { await p.goto('http://localhost:3000/l/' + l + '/draft'); await p.waitForTimeout(3000); await p.getByRole('button', { name: 'Draft', exact: true }).first().click({ timeout: 15000 }).catch(e => console.log('could not draft:', e.message.slice(0, 80))); await p.waitForTimeout(2500); continue; }
      const item = p.locator('.dropdown-menu.show a, .dropdown-menu.show button').filter({ hasText: /until|through|to /i }).last(); if (await item.count()) await item.click().catch(() => {}); await p.waitForTimeout(8000);
    }
    console.log('end season', await seasonNow()); await p.goto(`http://localhost:3000/l/${l}/standings`); await p.waitForTimeout(3000); await p.screenshot({ path: path.join(OUT, 'after_sim.png') });
  }
  console.log('page errors', errs.length, errs.slice(0, 3).join(' | ')); await ctx.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e.message.slice(0, 300)); process.exit(1); });
