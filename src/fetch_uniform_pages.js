/**
 * fetch_uniform_pages.js - downloads Wikipedia team articles' uniform sections and the
 * "Logos and uniforms of the ..." articles (wikitext) used to date jersey and color
 * changes in nfl_eras.js. Output: data_cache/uniforms/<title>.json
 * Usage: node src/fetch_uniform_pages.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'data_cache', 'uniforms');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const TEAMS = ['Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills', 'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals',
  'Cleveland Browns', 'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers', 'Houston Texans', 'Indianapolis Colts',
  'Jacksonville Jaguars', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins', 'Minnesota Vikings',
  'New England Patriots', 'New Orleans Saints', 'New York Giants', 'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
  'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (url) => new Promise((resolve) => {
  https.get(url, { headers: { 'User-Agent': UA } }, (res) => { let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); })
    .on('error', () => resolve({ status: 0, body: '' }));
});
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const titles = [];
  for (const t of TEAMS) titles.push(`Logos and uniforms of the ${t}`, t);
  for (const title of titles) {
    const file = path.join(OUT, title.replace(/[^A-Za-z0-9]+/g, '_') + '.json');
    if (fs.existsSync(file)) continue;
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await get(`https://en.wikipedia.org/w/api.php?action=parse&redirects=1&page=${encodeURIComponent(title)}&prop=wikitext&format=json`);
      if (r.status === 200 && r.body.startsWith('{')) { fs.writeFileSync(file, r.body); console.log('saved', title); break; }
      await sleep(20000 * (attempt + 1));
    }
    await sleep(5000);
  }
  console.log('done');
})();
