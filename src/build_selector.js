/**
 * build_selector.js - inlines nfl_eras.js, season_slicer.js and the schedule /
 * Hall of Fame / logo data into nfl_season_selector.html (one portable file).
 * Usage: node src/build_selector.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p, d) => (fs.existsSync(path.join(ROOT, p)) ? read(p) : d);
// Keep embedded code from closing the <script> element early.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

let html = read('src/selector_template.html');
html = html.replace('/*__NFL_ERAS__*/', () => 'window.NFL_ERA_FACTORS = ' + json('data_cache/era_factors.json', 'null') + ';\n' + safe(read('src/nfl_eras.js')));
html = html.replace('/*__SEASON_SLICER__*/', () => safe(read('src/season_slicer.js')));
html = html.replace('/*__SCHEDULES__*/{}', () => json('data_cache/real_schedules.json', '{}'));
html = html.replace('/*__HOF__*/{}', () => json('data_cache/hof_years.json', '{}'));
html = html.replace('/*__LOGOS__*/{}', () => json('data_cache/logos.json', '{}'));
html = html.replace('/*__LOGOS_PROCESSED__*/{}', () => json('data_cache/logos_processed.json', '{}'));
html = html.replace('/*__LOGO_ERAS__*/null', () => json('data_cache/logos_eras_final.json', 'null'));
fs.writeFileSync(path.join(ROOT, 'nfl_season_selector.html'), html);
console.log('wrote nfl_season_selector.html', (html.length / 1024).toFixed(0), 'KB');
