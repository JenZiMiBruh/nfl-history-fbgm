// Football GM's own league-file check (the "JSON schema validation errors" warning on upload), run on leagues the
// season selector and the mod build, so a format problem is caught before a player sees it. Same rules as
// src/worker/api/leagueFileUpload.ts: one schema, split into parts, each array item validated on its own.
//
// Usage: node --max-old-space-size=8000 tools/schema_check.js <NFL Official folder> <football-gm folder with build/files/league-schema.json> [seasons, e.g. 1966,1980,2000]
const zlib = require('zlib'), fs = require('fs'), path = require('path');
// A checker for one built game (its football-gm folder)
function makeCheck(GAME) {
const Ajv = require(path.join(GAME, 'node_modules', 'ajv')).default;
const schema = JSON.parse(fs.readFileSync(path.join(GAME, 'build', 'files', 'league-schema.json'), 'utf8'));
const CUMULATIVE = new Set(['gameAttributes', 'meta', 'startingSeason', 'version']);
const ajv = new Ajv({ allErrors: true, verbose: true });
const base = { $schema: schema.$schema, $id: schema.$id, definitions: schema.definitions, title: '', description: '' };
const validators = {};
for (const part of Object.keys(schema.properties)) {
  const subset = CUMULATIVE.has(part) ? schema.properties[part] : schema.properties[part].items;
  validators[part] = ajv.compile({ ...base, $id: `${base.$id}#${part}`, ...subset });
}
// Errors in one league file, grouped by kind with an example each
return function check(L) {
  const out = {};
  for (const [part, validate] of Object.entries(validators)) {
    if (L[part] === undefined) continue;
    const items = CUMULATIVE.has(part) ? [L[part]] : L[part];
    for (const item of items) if (!validate(item)) for (const e of validate.errors) {
      const k = `${part}${e.instancePath.replace(/\/\d+/g, '/N')} ${e.message}`;
      if (!out[k]) out[k] = { n: 0, example: JSON.stringify(e.data).slice(0, 120), params: JSON.stringify(e.params) };
      out[k].n++;
    }
  }
  return out;
};
}
module.exports = { makeCheck };

if (require.main === module) {
  const [ROOT, GAME, list] = process.argv.slice(2);
  if (!ROOT || !GAME) throw new Error('usage: schema_check.js <NFL Official> <football-gm> [seasons]');
  const check = makeCheck(GAME);
  const SL = require(path.join(ROOT, 'src/season_slicer')), E = require(path.join(ROOT, 'src/nfl_eras'));
  const SCHED = require(path.join(ROOT, 'data_cache/real_schedules.json'));
  const LIVE = require(path.join(ROOT, 'src/live_info')).liveInfo();
  const SITE = path.join(__dirname, '..', 'site', 'data');
  const m = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SITE, 'NFL_Selector_Master.json.gz'))));
  const seasons = list ? list.split(',').map(Number) : [1966, 1975, 1985, 1995, 2005, 2015, 2025, 2026];
  const log = console.log; console.log = () => {};
  const all = {};
  for (const S of seasons) for (const [ph, w] of [['preseason', 0], ['regular', 1], ...(S < 2026 ? [['draft', 0]] : [])]) {
    const L = SL.sliceLeague(m, E, { season: S, phase: ph, week: w, lite: false, schedules: SCHED, live: LIVE });
    for (const [k, v] of Object.entries(check(L))) { all[k] = all[k] || { n: 0, where: [], example: v.example, params: v.params }; all[k].n += v.n; if (all[k].where.length < 4) all[k].where.push(`${S} ${ph}`); }
  }
  for (const f of ['NFL_2027_Live_FBGM.json.gz']) {
    const L = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, f))));
    for (const [k, v] of Object.entries(check(L))) { all[k] = all[k] || { n: 0, where: [], example: v.example, params: v.params }; all[k].n += v.n; all[k].where.push(f); }
  }
  console.log = log;
  if (!Object.keys(all).length) log('NO SCHEMA ERRORS');
  for (const [k, v] of Object.entries(all)) log(`${k}: ${v.n} (${v.where.join(', ')})\n   params ${v.params}\n   value ${v.example}`);
}
