/**
 * fix_player_photos.js - real player pictures for as many players as possible.
 *
 * Every player came in with an NFL.com headshot link, but for most older players that link serves NFL.com's
 * generic silhouette, and real ones point at 4-6 MB originals. This:
 *   1. checks every NFL.com link at a tiny size and drops the ones that are the silhouette placeholder;
 *   2. rewrites real ones to a 240px-wide version (a few KB instead of megabytes);
 *   3. for players still without a picture, looks them up on Wikidata (Pro-Football-Reference ID, else name +
 *      birth date) and uses their Wikimedia Commons photo as a 240px thumbnail.
 * Results are cached in data_cache/photos.json so reruns only check new players.
 *
 * Usage: node --max-old-space-size=14000 src/fix_player_photos.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const CACHE_FILE = path.join(ROOT, 'data_cache', 'photos.json');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project)';
const WIDTH = 240;

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : { nfl: {}, wiki: {} };
const save = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

function request(url, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, { method, headers: { 'User-Agent': UA, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => resolve({ status: 0, body: Buffer.alloc(0) }));
    req.setTimeout(20000, () => req.destroy());
    if (body) req.write(body);
    req.end();
  });
}

const nflId = url => (url.match(/\/league\/([^/?#]+)$/) || [])[1];
const nflUrl = (id, t) => `https://static.www.nfl.com/image/private/${t}/league/${id}`;

async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const it = items[i++];
      await fn(it);
      if (++done % 1000 === 0) { console.log(`  ${done}/${items.length}`); save(); }
    }
  }));
}

(async () => {
  const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const players = master.players;

  // 1. NFL.com: tiny version of each link; the placeholder is identified by a known no-photo player's bytes
  const ids = [...new Set(players.map(p => p.imgURL && nflId(p.imgURL)).filter(Boolean))];
  const todo = ids.filter(id => cache.nfl[id] === undefined);
  console.log(`NFL.com links: ${ids.length}, to check: ${todo.length}`);
  await pool(todo, 24, async (id) => {
    const r = await request(nflUrl(id, 'f_png,w_32'));
    cache.nfl[id] = r.status === 200 ? r.body.length + ':' + r.body.slice(-64).toString('base64') : 'missing';
  });
  save();
  // The most common response is the silhouette
  const counts = {};
  for (const v of Object.values(cache.nfl)) counts[v] = (counts[v] || 0) + 1;
  const placeholder = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const realNfl = id => cache.nfl[id] && cache.nfl[id] !== 'missing' && cache.nfl[id] !== placeholder;
  console.log(`placeholder shared by ${counts[placeholder]} links`);

  // 2. Wikidata for players without a real NFL.com photo
  const need = players.filter(p => !(p.imgURL && realNfl(nflId(p.imgURL))));
  // Pro-Football-Reference IDs from the nflverse player list, matched by name + birth year
  const pfrByKey = {};
  const csv = fs.readFileSync(path.join(ROOT, 'data_cache', 'players.csv'), 'utf8').split('\n');
  const head = csv[0].split(',');
  const col = k => head.indexOf(k);
  for (const line of csv.slice(1)) {
    const f = line.split(',');
    const pfr = f[col('pfr_id')], name = f[col('display_name')], birth = f[col('birth_date')];
    if (pfr && name && birth) pfrByKey[`${name}|${birth.slice(0, 4)}`] = pfr;
  }
  const keyOf = p => `${p.firstName} ${p.lastName}|${p.born && p.born.year}`;
  const pfrIds = [...new Set(need.map(p => pfrByKey[keyOf(p)]).filter(id => id && cache.wiki['pfr:' + id] === undefined))];
  console.log(`Wikidata lookups by PFR ID: ${pfrIds.length}`);
  for (let i = 0; i < pfrIds.length; i += 200) {
    const batch = pfrIds.slice(i, i + 200);
    const q = `SELECT ?pfr ?img WHERE { VALUES ?pfr { ${batch.map(id => JSON.stringify(id[0] + '/' + id)).join(' ')} } ?p wdt:P3561 ?pfr . ?p wdt:P18 ?img . }`;
    const r = await request('https://query.wikidata.org/sparql', { method: 'POST', body: 'query=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } });
    let rows = [];
    try { rows = JSON.parse(r.body.toString()).results.bindings; } catch (e) { console.log('  sparql error', r.status); }
    for (const id of batch) cache.wiki['pfr:' + id] = null;
    // Wikidata stores PFR IDs with their first letter as a prefix (P/PaytWa00)
    for (const b of rows) cache.wiki['pfr:' + b.pfr.value.split('/').pop()] = b.img.value;
    save();
  }
  // Name + birth date for the rest (players nflverse has no PFR ID for)
  const byName = need.filter(p => !pfrByKey[keyOf(p)] && p.born && p.born.year && cache.wiki['nb:' + keyOf(p)] === undefined);
  console.log(`Wikidata lookups by name + birth year: ${byName.length}`);
  for (let i = 0; i < byName.length; i += 100) {
    const batch = byName.slice(i, i + 100);
    const values = batch.map(p => `(${JSON.stringify(`${p.firstName} ${p.lastName}`)}@en ${p.born.year})`).join(' ');
    const q = `SELECT ?name ?y ?img WHERE { VALUES (?name ?y) { ${values} } ?p rdfs:label ?name ; wdt:P106 wd:Q19204627 ; wdt:P569 ?b ; wdt:P18 ?img . FILTER(YEAR(?b) = ?y) }`;
    const r = await request('https://query.wikidata.org/sparql', { method: 'POST', body: 'query=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } });
    let rows = [];
    try { rows = JSON.parse(r.body.toString()).results.bindings; } catch (e) { console.log('  sparql error', r.status); }
    for (const p of batch) cache.wiki['nb:' + keyOf(p)] = null;
    const hits = {};
    for (const b of rows) { const k = `${b.name.value}|${b.y.value}`; (hits[k] = hits[k] || []).push(b.img.value); }
    // Only unambiguous matches: one person with that name and birth year
    for (const [k, imgs] of Object.entries(hits)) if (new Set(imgs).size === 1) cache.wiki['nb:' + k] = imgs[0];
    save();
  }

  // 3. Apply
  const thumb = commons => {
    const file = decodeURIComponent(commons.split('Special:FilePath/')[1] || '').replace(/ /g, '_');
    return file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${WIDTH}` : null;
  };
  let nfl = 0, wiki = 0, none = 0;
  for (const p of players) {
    const id = p.imgURL && nflId(p.imgURL);
    if (id && realNfl(id)) { p.imgURL = nflUrl(id, `f_auto,q_auto,w_${WIDTH}`); nfl++; continue; }
    const commons = cache.wiki['pfr:' + pfrByKey[keyOf(p)]] || cache.wiki['nb:' + keyOf(p)];
    if (commons && thumb(commons)) { p.imgURL = thumb(commons); wiki++; continue; }
    delete p.imgURL; none++;
  }
  console.log(`photos: NFL.com ${nfl}, Wikimedia ${wiki}, none (Football GM draws a face) ${none}`);
  fs.writeFileSync(MASTER, JSON.stringify(master));
})();
