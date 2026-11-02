/**
 * fetch_wiki_players.js - downloads Wikipedia articles (wikitext) for players whose
 * 1966-1998 seasons have no stats in our sources, so their "career statistics"
 * tables can be merged (see wiki_player_stats.js).
 *
 * Input:  data_cache/wiki_stat_targets.json  [{ name, born, pos, ... }]
 * Output: data_cache/wiki_players/<name>_<born>.json  { name, born, title, wikitext }
 * Wikimedia rate-limits aggressively: one request every few seconds, with backoff.
 * Usage: node src/fetch_wiki_players.js [limit]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE = path.join(__dirname, '..', 'data_cache');
const OUT = path.join(CACHE, 'wiki_players');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

const fileFor = (t) => path.join(OUT, `${t.name.replace(/[^A-Za-z0-9]+/g, '_')}_${t.born}.json`);

// The article must be about an American football player born in the right year.
function plausible(title, wt, t) {
  if (!wt || /may refer to|\{\{\s*(hndis|disambig)/i.test(wt.slice(0, 3000))) return false;
  const last = t.name.split(' ').slice(-1)[0].toLowerCase();
  if (!title.toLowerCase().includes(last) || /season|football team|\bdraft\b|list of/i.test(title)) return false;
  if (!/football/i.test(wt)) return false;
  return new RegExp(String.raw`\b(${t.born - 1}|${t.born}|${t.born + 1})\b`).test(wt.slice(0, 20000));
}
const POS_WORD = { QB: 'quarterback', RB: 'running back', WR: 'wide receiver', TE: 'tight end', OL: 'offensive lineman', DL: 'defensive end',
  LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'placekicker', P: 'punter' };

async function query(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await get(url);
    if (r.status === 200 && r.body.startsWith('{')) return JSON.parse(r.body).query || {};
    await sleep(20000 * (attempt + 1));
  }
  return {};
}
const pick = (pages, t) => {
  const ok = Object.values(pages || {}).map(p => ({ title: p.title, wikitext: p.revisions && p.revisions[0].slots.main['*'] }))
    .filter(p => plausible(p.title, p.wikitext, t));
  ok.sort((x, y) => (/career stat|statistics/i.test(y.wikitext) ? 1 : 0) - (/career stat|statistics/i.test(x.wikitext) ? 1 : 0));
  return ok[0] || null;
};

async function fetchOne(t) {
  const titles = [t.name, `${t.name} (American football)`, `${t.name} (${POS_WORD[t.pos] || 'American football'})`, `${t.name} (gridiron football)`];
  const q1 = await query(`https://en.wikipedia.org/w/api.php?action=query&redirects=1&titles=${encodeURIComponent(titles.join('|'))}&prop=revisions&rvprop=content&rvslots=main&format=json`);
  let hit = pick(q1.pages, t);
  if (hit) return hit;
  await sleep(3500);
  const q2 = await query(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(t.name + ' ' + (POS_WORD[t.pos] || '') + ' NFL')}&gsrlimit=4&prop=revisions&rvprop=content&rvslots=main&format=json`);
  return pick(q2.pages, t);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const targets = JSON.parse(fs.readFileSync(path.join(CACHE, 'wiki_stat_targets.json'), 'utf8'));
  const limit = parseInt(process.argv[2] || String(targets.length), 10);
  let got = 0, miss = 0;
  for (const t of targets.slice(0, limit)) {
    const f = fileFor(t);
    if (fs.existsSync(f)) continue;
    const res = await fetchOne(t);
    fs.writeFileSync(f, JSON.stringify(res ? { name: t.name, born: t.born, ...res } : { name: t.name, born: t.born, missing: true }));
    if (res) got++; else miss++;
    if ((got + miss) % 25 === 0) console.log(`progress: ${got} found, ${miss} not found`);
    await sleep(3500);
  }
  console.log(`done: ${got} found, ${miss} not found`);
}

main();
