/**
 * fix_logo_era.js - points a team's logo era at the right image when the source art was wrong, in the eras file and in
 * that team's seasons in the master and its rebuild baseline. A targeted swap, not a find-and-replace: the wrong image
 * is often right for another era (the elf is the Browns' real logo through 1969).
 *
 * The 1970-95 Browns showed Brownie the Elf; their logo from 1970 was the orange helmet, the same design they came
 * back with in 1999, so that era takes the 1999 helmet.
 *
 * Usage: node --max-old-space-size=14000 src/fix_logo_era.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data_cache', 'logos_eras_final.json');
const FIXES = [{ tid: 7, era: 1, from: 1970, to: 1995, useEra: 2, name: 'Cleveland Browns 1970-95: helmet, not the elf' }];

const eras = JSON.parse(fs.readFileSync(ERAS, 'utf8'));
for (const f of FIXES) {
  const list = eras.primary[f.tid];
  if (list[f.era].from !== f.from || list[f.useEra].data === undefined) throw new Error('eras changed: ' + f.name);
  list[f.era].data = list[f.useEra].data;
  console.log('eras: ' + f.name);
}
fs.writeFileSync(ERAS, JSON.stringify(eras));

for (const file of [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')]) {
  if (!fs.existsSync(file)) continue;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const f of FIXES) {
    const img = eras.primary[f.tid][f.useEra].data;
    let n = 0;
    for (const s of m.teams.find(t => t.tid === f.tid).seasons) {
      if (s.season < f.from || s.season > f.to) continue;
      s.imgURL = img; s.imgURLSmall = img; n++;
    }
    console.log(`${path.basename(file)}: ${n} seasons`);
  }
  fs.writeFileSync(file, JSON.stringify(m));
}
