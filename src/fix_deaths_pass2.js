/**
 * fix_deaths_pass2.js - second pass for deaths the ID lookup missed (Walter Payton, Brandon Burlsworth...).
 * Pulls every deceased American football player on Wikidata (name, birth year, death date) decade by decade and
 * marks any league player still unmarked whose name and birth year match exactly one of them.
 *
 * Usage: node --max-old-space-size=14000 src/fix_deaths_pass2.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const MASTER = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
const CACHE = path.join(__dirname, '..', 'data_cache', 'deaths_wikidata_all.json');
const sparql = q => new Promise((resolve) => {
  const req = https.request('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': 'NFLHistoryFBGM/1.0 (personal project)', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } }, (res) => {
    const c = []; res.on('data', d => c.push(d)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString()).results.bindings); } catch (e) { resolve(null); } });
  });
  req.on('error', () => resolve(null)); req.setTimeout(120000, () => req.destroy());
  req.write('query=' + encodeURIComponent(q)); req.end();
});
const norm = s => String(s).toLowerCase().replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '').replace(/[^a-z]/g, '');

(async () => {
  let all = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
  if (!all) {
    all = [];
    for (let dec = 1900; dec <= 2000; dec += 5) {
      const rows = await sparql(`SELECT ?p ?name ?b ?d WHERE { ?p wdt:P106 wd:Q19204627 ; wdt:P569 ?b ; wdt:P570 ?d ; rdfs:label ?name . FILTER(LANG(?name) = "en") FILTER(YEAR(?b) >= ${dec} && YEAR(?b) < ${dec + 5}) }`);
      if (!rows) { console.log(`  ${dec}s: query failed`); continue; }
      for (const r of rows) all.push([r.p.value, r.name.value, +r.b.value.slice(0, 4), r.d.value.slice(0, 10)]);
      console.log(`  born ${dec}-${dec + 4}: ${rows.length}`);
    }
    fs.writeFileSync(CACHE, JSON.stringify(all));
  }
  // One entry per Wikidata person: name and every birth year Wikidata gives (some list two)
  const people = new Map();
  for (const [q, name, by, d] of all) { const e = people.get(q) || { name: norm(name), births: new Set(), d }; e.births.add(by); people.set(q, e); }
  const m = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const byName = new Map();
  for (const p of m.players) { const k = norm(`${p.firstName} ${p.lastName}`); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
  // The 1965-born Derrick Thomas is a different player from the Hall of Famer (Wikidata lists both birth years for him)
  for (const p of m.players) if (p.firstName === 'Derrick' && p.lastName === 'Thomas' && p.born && p.born.year === 1965) delete p.diedYear;
  let marked = 0, retired = 0;
  const ex = [];
  for (const e of people.values()) {
    // league players with that name born within a year of any birth year Wikidata gives; exactly one, or skip
    const cands = (byName.get(e.name) || []).filter(p => p.born && [...e.births].some(b => Math.abs(p.born.year - b) <= 1));
    if (cands.length !== 1) continue;
    const p = cands[0];
    if (p.diedYear) continue;
    const year = +e.d.slice(0, 4);
    if (!(year > 1900)) continue;
    p.diedYear = +e.d.slice(5, 7) <= 7 ? year - 1 : year;
    marked++; ex.push(`${p.firstName} ${p.lastName} (${e.d})`);
    if (p.tid >= -1) { p.tid = -3; p.retiredYear = p.diedYear; retired++; }
  }
  console.log(`second pass: marked ${marked} more; retired ${retired}. e.g. ${ex.slice(0, 12).join(', ')}`);
  fs.writeFileSync(MASTER, JSON.stringify(m));
})();
