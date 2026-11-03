/**
 * build_mod_assets.js - bundles nfl_eras.js, season_slicer.js and the schedule / Hall of Fame /
 * logo data into one script for the NFL history mod's season picker (New League screen).
 * Usage: node src/build_mod_assets.js [path to zengm-mod]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOD = process.argv[2] || path.join(ROOT, '..', 'zengm-mod');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p, d) => (fs.existsSync(path.join(ROOT, p)) ? read(p) : d);

const out = [
  // Shown in the picker so it's easy to tell a stale copy from the current one
  'window.NFL_MOD_BUILT = ' + JSON.stringify(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })) + ';',
  'window.NFL_ERA_FACTORS = ' + json('data_cache/era_factors.json', 'null') + ';',
  read('src/nfl_eras.js'),
  read('src/season_slicer.js'),
  `window.NFL_DATA = { schedules: ${json('data_cache/real_schedules.json', '{}')}, hofYears: ${json('data_cache/hof_years.json', '{}')}, logos: ${json('data_cache/logos.json', '{}')}, logosProcessed: ${json('data_cache/logos_processed.json', '{}')}, logoEras: ${json('data_cache/logos_eras_final.json', 'null')}, live: ${JSON.stringify(require('./live_info').liveInfo())} };`
].join('\n;\n');
const dir = path.join(MOD, 'public', 'football', 'nfl');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'nfl_mod.js'), out);
console.log('wrote', path.join(dir, 'nfl_mod.js'), (out.length / 1024).toFixed(0), 'KB');
