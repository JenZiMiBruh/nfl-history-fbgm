/**
 * fix_deaths.js - marks every player who has died.
 *
 * Dates of death come from Wikidata, matched by Pro-Football-Reference ID (from the nflverse player list, by name
 * and birth year), or by name and birth year for players without one (one match only). Each match sets diedYear,
 * which Football GM shows on the player page. A player who died while still on a roster or in free agency
 * (Khyree Jackson, Brandon Burlsworth before his rookie season) is retired so no team can sign him.
 * Results are cached in data_cache/deaths.json.
 *
 * Usage: node --max-old-space-size=14000 src/fix_deaths.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');
const CACHE = path.join(ROOT, 'data_cache', 'deaths.json');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project)';
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

function sparql(q) {
  return new Promise((resolve) => {
    const body = 'query=' + encodeURIComponent(q);
    const req = https.request('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } }, (res) => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString()).results.bindings); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(60000, () => req.destroy());
    req.write(body); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  // PFR IDs by name + birth year
  const csv = fs.readFileSync(path.join(ROOT, 'data_cache', 'players.csv'), 'utf8').split('\n');
  const head = csv[0].split(',');
  const col = k => head.indexOf(k);
  const pfrByKey = {};
  for (const line of csv.slice(1)) { const f = line.split(','); if (f[col('pfr_id')] && f[col('birth_date')]) pfrByKey[`${f[col('display_name')]}|${f[col('birth_date')].slice(0, 4)}`] = f[col('pfr_id')]; }
  const keyOf = p => `${p.firstName} ${p.lastName}|${p.born && p.born.year}`;

  // Deaths by PFR ID
  const pfrIds = [...new Set(m.players.map(p => pfrByKey[keyOf(p)]).filter(id => id && cache['pfr:' + id] === undefined))];
  console.log(`lookups by PFR ID: ${pfrIds.length}`);
  for (let i = 0; i < pfrIds.length; i += 250) {
    const batch = pfrIds.slice(i, i + 250);
    let rows = await sparql(`SELECT ?pfr ?d WHERE { VALUES ?pfr { ${batch.map(x => JSON.stringify(x[0] + '/' + x)).join(' ')} } ?p wdt:P3561 ?pfr . ?p wdt:P570 ?d . }`);
    if (!rows) { await sleep(5000); rows = await sparql(`SELECT ?pfr ?d WHERE { VALUES ?pfr { ${batch.map(x => JSON.stringify(x[0] + '/' + x)).join(' ')} } ?p wdt:P3561 ?pfr . ?p wdt:P570 ?d . }`); }
    if (!rows) { console.log('  batch failed, will retry next run'); continue; }
    for (const id of batch) cache['pfr:' + id] = null;
    // Wikidata stores PFR IDs with their first letter as a prefix (P/PaytWa00)
    for (const b of rows) cache['pfr:' + b.pfr.value.split('/').pop()] = b.d.value.slice(0, 10);
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    await sleep(800);
  }

  // Deaths by name + birth year for the rest (American football players only, one match only)
  const rest = m.players.filter(p => !pfrByKey[keyOf(p)] && p.born && p.born.year && p.born.year < 2008 && cache['nb:' + keyOf(p)] === undefined);
  console.log(`lookups by name + birth year: ${rest.length}`);
  for (let i = 0; i < rest.length; i += 120) {
    const batch = rest.slice(i, i + 120);
    const values = batch.map(p => `(${JSON.stringify(`${p.firstName} ${p.lastName}`)}@en ${p.born.year})`).join(' ');
    const rows = await sparql(`SELECT ?name ?y ?d ?p WHERE { VALUES (?name ?y) { ${values} } ?p rdfs:label ?name ; wdt:P106 wd:Q19204627 ; wdt:P569 ?b ; wdt:P570 ?d . FILTER(YEAR(?b) = ?y) }`);
    if (!rows) { console.log('  batch failed, will retry next run'); continue; }
    for (const p of batch) cache['nb:' + keyOf(p)] = null;
    const hits = {};
    for (const b of rows) { const k = `${b.name.value}|${b.y.value}`; (hits[k] = hits[k] || new Set()).add(b.p.value + '|' + b.d.value.slice(0, 10)); }
    for (const [k, s] of Object.entries(hits)) if (s.size === 1) cache['nb:' + k] = [...s][0].split('|')[1];
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    await sleep(800);
  }

  // Apply
  let marked = 0, retired = 0;
  const examples = [];
  for (const p of m.players) {
    const d = cache['pfr:' + pfrByKey[keyOf(p)]] || cache['nb:' + keyOf(p)];
    if (!d) continue;
    const year = +d.slice(0, 4);
    if (!(year > 1900)) continue;
    // Seasons are stored by start year; a death in January-July belongs to the season that started the year before
    const season = +d.slice(5, 7) <= 7 ? year - 1 : year;
    p.diedYear = season;
    marked++;
    if (p.tid >= -1) {
      const last = Math.max(season, ...(p.stats || []).filter(s => !s.playoffs).map(s => s.season));
      p.tid = -3; p.retiredYear = Math.min(last, season);
      retired++; examples.push(`${p.firstName} ${p.lastName} (${d})`);
    }
  }
  console.log(`marked ${marked} players as deceased; retired ${retired} who were on a roster or in free agency: ${examples.slice(0, 20).join(', ')}`);
  fs.writeFileSync(MASTER, JSON.stringify(m));
})();
