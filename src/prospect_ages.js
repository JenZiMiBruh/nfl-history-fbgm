/**
 * prospect_ages.js - real ages for the 2027-2029 draft prospects.
 *
 * Every prospect was born in "draft year minus 21", so a whole class shared one age. Their high-school class gives a
 * real one: players finish high school the year they turn 18 or 19, so birth year = high-school class - 18 (about a
 * third a year earlier, picked the same way every run from the player's ID). Redshirts and fifth-year players come out
 * older on their own, since their high-school class is earlier. Where there's no recruiting record, the college class
 * on the 2026 roster stands in (a 2026 sophomore finished high school in 2025).
 *
 * Prospects are matched to ESPN by the player ID in their headshot link.
 * Runs on the master and its rebuild baseline. Safe to run again.
 * Usage: node --max-old-space-size=14000 src/prospect_ages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'data_cache', 'prospects');
const SEASON = 2026;

// ESPN id -> high-school class (recruiting files) and 2026 college class (1 = freshman)
const hsClass = new Map(), collegeCls = new Map();
for (const f of fs.readdirSync(P).filter(f => /^recruits_\d{4}\.json$/.test(f))) {
  const list = JSON.parse(fs.readFileSync(path.join(P, f), 'utf8'));
  for (const r of Array.isArray(list) ? list : Object.values(list)) if (r.collegeId && r.cls) hsClass.set(String(r.collegeId), r.cls);
}
{
  const list = JSON.parse(fs.readFileSync(path.join(P, 'players_2026.json'), 'utf8'));
  for (const x of Array.isArray(list) ? list : Object.values(list)) if (x.id && x.cls) collegeCls.set(String(x.id), x.cls);
}
const espnId = p => { const m = decodeURIComponent(p.imgURL || '').match(/players\/full\/(\d+)\.png/); return m && m[1]; };

for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  let byRecruit = 0, byClass = 0, none = 0;
  const ages = {};
  for (const p of m.players) {
    if (p.tid !== -2) continue;
    const id = espnId(p);
    let hs = id && hsClass.get(id);
    if (hs) byRecruit++;
    else if (id && collegeCls.has(id)) { hs = SEASON - (collegeCls.get(id) - 1); byClass++; }
    else { none++; continue; }
    const early = id && Number(id) % 3 === 0; // about a third finish high school at 19
    p.born = { ...p.born, year: hs - 18 - (early ? 1 : 0) };
    const draftYear = p.draft.year + 1; // draft years are filed under the season before
    const age = draftYear - p.born.year;
    ages[age] = (ages[age] || 0) + 1;
  }
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${path.basename(file)}: ${byRecruit} from recruiting class, ${byClass} from college class, ${none} unchanged; ages at the draft ${JSON.stringify(ages)}`);
}
