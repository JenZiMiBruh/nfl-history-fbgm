/**
 * clear_logo_background.js - makes leftover background inside a logo transparent: the opposite of fix_logo_holes.js.
 *
 * Some scanned classic logos keep a patch of their original white background where the art is open, so on a colored
 * page it shows as a white block (the 1966-69 St. Louis Cardinals logo between the Gateway Arch and the cardinal).
 * Each fix flood-fills from seed points inside the patch, clearing near-white pixels until it meets the outlines, and
 * never crosses keepOut (a function of x, y) where the art's own outline has a gap (the cardinal's back leg).
 *
 * Updates data_cache/logos_eras_final.json, data_cache/logos_processed.json and, by exact string replacement,
 * NFL_Master_1966_2026.json.
 *
 * Usage: node --max-old-space-size=14000 src/clear_logo_background.js <path to jimp module>
 */
const fs = require('fs');
const path = require('path');
const Jimp = require(process.argv[2] || 'jimp');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data_cache', 'logos_eras_final.json');
const PROCESSED = path.join(ROOT, 'data_cache', 'logos_processed.json');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');

const inPolygon = (x, y, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// Coordinates are for the 256x256 logo images
const FIXES = [
  {
    tid: 0, era: 0, name: 'St. Louis Cardinals 1966-69 (white behind the cardinal, inside the arch)',
    seeds: [[88, 115], [107, 47], [104, 52], [110, 44], [75, 185], [62, 180]],
    // the back leg's shin has a gap in its outline where it meets the patch: keep everything inside the shin, traced from
    // the outlines (under the thigh, down the black diagonal, the cuff, the faint top line)
    keepOut: (x, y) => inPolygon(x, y, [[90, 177], [130, 167], [90, 213], [67, 213], [67, 195], [80, 195], [86, 186]]),
  },
];

async function clear(dataUri, fix) {
  const img = await Jimp.read(Buffer.from(dataUri.split(',')[1], 'base64'));
  const { width: W, height: H, data } = img.bitmap;
  const white = i => data[i + 3] > 200 && data[i] > 205 && data[i + 1] > 205 && data[i + 2] > 205;
  const seen = new Uint8Array(W * H);
  const stack = fix.seeds.map(([x, y]) => [x, y]);
  let cleared = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || fix.keepOut(x, y)) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    seen[p] = 1;
    if (!white(p * 4)) continue;
    data[p * 4 + 3] = 0;
    cleared++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const buf = await img.getBufferAsync(Jimp.MIME_PNG);
  return { uri: 'data:image/png;base64,' + buf.toString('base64'), cleared };
}

(async () => {
  const eras = JSON.parse(fs.readFileSync(ERAS, 'utf8'));
  const processed = JSON.parse(fs.readFileSync(PROCESSED, 'utf8'));
  const swaps = [];
  for (const fix of FIXES) {
    const era = eras.primary[fix.tid][fix.era];
    const { uri, cleared } = await clear(era.data, fix);
    console.log(`${fix.name}: cleared ${cleared} pixels`);
    swaps.push([era.data, uri]);
    era.data = uri;
  }
  for (const k of Object.keys(processed)) for (const [a, b] of swaps) if (processed[k] === a) processed[k] = b;
  for (const list of Object.values(eras.secondary || {})) for (const e of list) for (const [a, b] of swaps) if (e.data === a) e.data = b;
  fs.writeFileSync(ERAS, JSON.stringify(eras));
  fs.writeFileSync(PROCESSED, JSON.stringify(processed));
  let master = fs.readFileSync(MASTER, 'utf8');
  for (const [a, b] of swaps) {
    const n = master.split(a).length - 1;
    master = master.split(a).join(b);
    console.log(`master: replaced ${n} copies`);
  }
  fs.writeFileSync(MASTER, master);
})();
