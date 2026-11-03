/**
 * real_contracts.js - real contract end years, from OverTheCap (nflverse's historical_contracts, converted to
 * data_cache/historical_contracts.csv). A deal runs from the season it was signed for its listed years; an extension
 * starts counting the season after.
 *
 * The master sets a contract's end from the seasons a player is known to play: for today's players that is only this
 * one, so nearly every contract ran out after one season, and in past seasons it was an estimate. Instead:
 *   - every player gets realDeals, [[first season, last season], ...], matched by name, then draft year or birth year
 *     when two players share a name, and only deals that overlap his career. season_slicer.js uses them for any season
 *     they cover (OverTheCap is thin before 2011, so older seasons keep the estimate)
 *   - the live season's contracts are set from them here; players with no deal on file (practice-squad call-ups,
 *     late signings) get 1-3 seasons
 * Capped at Football GM's 5-season limit (some listings include void years).
 *
 * Usage (pipeline step, writes the master): node --max-old-space-size=14000 src/real_contracts.js [season=2026]
 */
const path = require('path');
const { parseCSVFile } = require('./csv_parser');

const key = n => String(n).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

function attachDeals(players) {
  const deals = new Map();
  for (const c of parseCSVFile(path.join(__dirname, '..', 'data_cache', 'historical_contracts.csv'))) {
    const signed = +c.year_signed, years = +c.years;
    if (!signed || !years) continue;
    const k = key(c.player);
    if (!deals.has(k)) deals.set(k, []);
    deals.get(k).push({ signed, end: signed + years - 1, draft: +c.draft_year || 0, born: +(c.date_of_birth || '').slice(0, 4) || 0 });
  }
  let n = 0;
  for (const p of players) {
    delete p.realDeals;
    const seasons = (p.stats || []).map(s => s.season).concat((p.ratings || []).map(r => r.season));
    if (!seasons.length) continue;
    const first = Math.min(...seasons), last = Math.max(...seasons);
    let list = (deals.get(key(`${p.firstName} ${p.lastName}`)) || []).filter(d => d.end >= first && d.signed <= last + 1);
    const dy = p.draft?.year, by = p.born?.year;
    // Two players with one name: keep the deals whose draft or birth year fits; if none can tell them apart, none
    if (new Set(list.map(d => d.draft + '|' + d.born)).size > 1) {
      const fit = list.filter(d => (dy && d.draft === dy) || (by && d.born === by));
      list = fit.length ? fit : [];
    }
    if (!list.length) continue;
    // An extension (signed while an earlier deal still runs that season) adds its years after the current season:
    // Russell Wilson's 4-year extension in 2015 ran through 2019, not 2018
    list.sort((a, b) => a.signed - b.signed);
    p.realDeals = list.map(d => [d.signed, list.some(e => e.signed < d.signed && e.end >= d.signed) ? d.end + 1 : d.end]);
    n++;
  }
  console.log(`real deals attached to ${n} players`);
}

// The deal in force in season S (the latest signed, when an extension overlaps the old deal): its last season, capped
function dealExp(p, S) {
  const d = (p.realDeals || []).filter(([a, b]) => a <= S && b >= S).pop();
  return d ? Math.min(d[1], S + 4) : 0;
}

function applyRealContracts(players, S) {
  const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 13; return x >>> 0; };
  let real = 0, guessed = 0;
  for (const p of players) {
    if (p.tid < 0 || !p.contract) continue;
    let exp = dealExp(p, S);
    if (exp) real++;
    else if (p.contract.exp > S) continue;
    else { exp = S + hash(p.pid) % 3; guessed++; }
    p.contract = Object.assign({}, p.contract, { exp });
  }
  console.log(`contracts: ${real} real end years, ${guessed} without a deal on file`);
}

module.exports = { attachDeals, applyRealContracts };

if (require.main === module) {
  const fs = require('fs');
  const FILE = path.join(__dirname, '..', 'NFL_Master_1966_2026.json');
  const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  attachDeals(master.players);
  applyRealContracts(master.players, +(process.argv[2] || 2026));
  fs.writeFileSync(FILE, JSON.stringify(master));
}
