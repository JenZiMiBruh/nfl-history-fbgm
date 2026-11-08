/**
 * link_relatives.js - family links between players (Archie, Peyton and Eli Manning; Deion, Shedeur and Shilo Sanders),
 * shown on Football GM's player pages.
 *
 * Football GM knows three kinds: father, son and brother. Wikidata has the family links (father, child, sibling) for
 * American football players; both people are matched to players here by name and birth year, so only pairs where both
 * are in the league are linked. Grandfathers and uncles have no type in Football GM (Arch Manning's are Archie, and
 * Peyton and Eli), so they aren't linked. Sisters and mothers aren't football players.
 *
 * The Wikidata answer is cached in data_cache/family_wikidata.json (delete it to fetch again). EXTRA below adds pairs
 * Wikidata doesn't have.
 *
 * Runs on the master and its rebuild baseline, like merge_ghost_players.js.
 * Usage: node --max-old-space-size=14000 src/link_relatives.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data_cache', 'family_wikidata.json');
const FILES = [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')];
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project)';

// [parent or older, born, relation of the second to the first, child or sibling, born] for pairs Wikidata misses
const EXTRA = [
  ['Deion Sanders', 1967, 'son', 'Shedeur Sanders', 2002],
  ['Deion Sanders', 1967, 'son', 'Shilo Sanders', null],
  ['Shedeur Sanders', 2002, 'brother', 'Shilo Sanders', null],
];

function sparql(q) {
  return new Promise((ok, no) => {
    const body = 'query=' + encodeURIComponent(q);
    const req = https.request('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => res.statusCode === 200 ? ok(JSON.parse(d)) : no(new Error('Wikidata ' + res.statusCode + ': ' + d.slice(0, 200))));
    });
    req.on('error', no); req.write(body); req.end();
  });
}

// Pairs (a, relation of b to a, b) where both are American football players: father (P22), child (P40), sibling (P3373)
async function fetchPairs() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const q = `SELECT ?a ?aLabel ?aBorn ?rel ?b ?bLabel ?bBorn WHERE {
    ?a wdt:P106 wd:Q19204627 .
    VALUES (?prop ?rel) { (wdt:P22 "father") (wdt:P40 "son") (wdt:P3373 "brother") }
    ?a ?prop ?b . ?b wdt:P106 wd:Q19204627 .
    OPTIONAL { ?a wdt:P569 ?aBorn } OPTIONAL { ?b wdt:P569 ?bBorn }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  }`;
  const j = await sparql(q);
  const rows = j.results.bindings.map(r => ({
    a: r.aLabel.value, aBorn: r.aBorn ? +r.aBorn.value.slice(0, 4) : null,
    rel: r.rel.value, b: r.bLabel.value, bBorn: r.bBorn ? +r.bBorn.value.slice(0, 4) : null,
  }));
  fs.writeFileSync(CACHE, JSON.stringify(rows));
  return rows;
}

// Names match without case, accents, punctuation or a suffix, and initials match spaced or not ("J. J. Watt" and
// "J.J. Watt" are both "jj watt")
const nameKey = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b([a-z])\.\s*(?=[a-z]\.)/g, '$1').replace(/[.,']/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();
// The relation the other way round: b is a's son, so a is b's father
const INVERSE = { father: 'son', son: 'father', brother: 'brother' };

(async () => {
  const rows = await fetchPairs();
  const pairs = rows.concat(EXTRA.map(([a, aBorn, rel, b, bBorn]) => ({ a, aBorn, rel, b, bBorn })));
  for (const file of FILES) {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    const byName = new Map();
    for (const p of m.players) { const k = nameKey(`${p.firstName} ${p.lastName}`); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
    // One player for a name and birth year, or none when it isn't clear (two players with the same name and year)
    const find = (name, born) => {
      const c = (byName.get(nameKey(name)) || []).filter(p => born == null || Math.abs((p.born && p.born.year) - born) <= 1);
      return c.length === 1 ? c[0] : undefined;
    };
    for (const p of m.players) p.relatives = [];
    const add = (p, type, q) => { if (p !== q && !p.relatives.some(r => r.pid === q.pid)) p.relatives.push({ type, pid: q.pid, name: `${q.firstName} ${q.lastName}` }); };
    let linked = 0;
    for (const { a, aBorn, rel, b, bBorn } of pairs) {
      const pa = find(a, aBorn), pb = find(b, bBorn);
      if (!pa || !pb) continue;
      // Wikidata's "father" says b is a's father; Football GM lists b on a's page as type "father"
      add(pa, rel, pb);
      add(pb, INVERSE[rel], pa);
      linked++;
    }
    // Brothers of brothers: three Sanders brothers or four Matthews brothers all link to each other
    for (const p of m.players) for (const r of p.relatives.filter(r => r.type === 'brother')) {
      const q = m.players.find(x => x.pid === r.pid);
      for (const r2 of q.relatives.filter(r2 => r2.type === 'brother' && r2.pid !== p.pid)) { const s = m.players.find(x => x.pid === r2.pid); add(p, 'brother', s); add(s, 'brother', p); }
    }
    const withRel = m.players.filter(p => p.relatives.length);
    for (const p of m.players) if (!p.relatives.length) delete p.relatives;
    fs.writeFileSync(file, JSON.stringify(m));
    console.log(`${path.basename(file)}: ${linked} family pairs, ${withRel.length} players with relatives`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
