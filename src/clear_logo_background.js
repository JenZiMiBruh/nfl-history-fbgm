/**
 * clear_logo_background.js - hand-traced cleanup for scanned classic logos whose background didn't come out cleanly:
 * the opposite of fix_logo_holes.js.
 *
 * The 1966-69 St. Louis Cardinals logo (the cardinal running in front of the Gateway Arch) kept patches of the scan's
 * white background (between the arch and the cardinal, by his head), lost its white shoe stripes, and has parts of the
 * arch drawn as outlines only. Everything is done with exact shapes traced on the 256x256 image, so nothing leaks
 * through gaps in the art's outlines:
 *   - background pockets are cleared by filling from inside, confined to a traced shape, never entering the thigh or
 *     the shin (their outlines have gaps where they meet the pocket)
 *   - hollow arch segments are painted white between their outlines
 *   - see-through gaps inside the black shoes go back to white
 * Always starts from the original art in data_cache/logos_hires, then updates data_cache/logos_eras_final.json,
 * data_cache/logos_processed.json and (by exact string replacement) the master and its rebuild backup.
 *
 * Usage: node --max-old-space-size=14000 src/clear_logo_background.js <path to jimp module>
 */
const fs = require('fs');
const path = require('path');
const Jimp = require(process.argv[2] || 'jimp');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data_cache', 'logos_eras_final.json');
const PROCESSED = path.join(ROOT, 'data_cache', 'logos_processed.json');
const MASTERS = [path.join(ROOT, 'NFL_Master_1966_2026.json'), path.join(ROOT, '_old', 'NFL_Master_before_av_fix.json')];

const inPoly = (x, y, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const FIXES = [{
  tid: 0, era: 0, original: 'logos_hires/0_1962.png', name: 'St. Louis Cardinals 1966-69',
  // parts of the cardinal a pocket fill must never enter
  protect: [
    [[90, 177], [130, 167], [90, 213], [67, 213], [67, 195], [80, 195], [86, 186]], // back leg's shin
    [[76, 168], [80, 155], [88, 147], [100, 145], [132, 146], [132, 178], [96, 179], [80, 175]], // front thigh
  ],
  pockets: [
    // between the arch's left leg and the cardinal, down to the shin
    { seeds: [[88, 115], [75, 185], [62, 180], [92, 90], [70, 160]], shape: [[74, 60], [112, 60], [112, 168], [90, 177], [86, 186], [80, 195], [66, 196], [59, 196], [62, 150], [70, 100]] },
    // the triangle between the arm and the crest
    { seeds: [[110, 50], [118, 48], [120, 55]], shape: [[100, 54], [117, 41], [124, 47], [127, 61], [106, 57]] },
  ],
  // the arch near the top is drawn as pairs of thin lines with a hollow between: inside this box, any see-through gap of
  // up to 9 pixels with an outline on both sides is the arch band, and is painted white (wide gaps are background)
  archGaps: { box: [88, 22, 172, 57], maxGap: 9 },
  archFill: [
    [[45, 216], [55, 216], [55, 231], [45, 231]], // its base below the back foot, drawn as an outline only
  ],
  shoes: [[[118, 186], [162, 192], [168, 205], [130, 228], [115, 222]], [[5, 196], [45, 196], [45, 235], [5, 245]]],
}];

async function clean(fix) {
  const img = await Jimp.read(path.join(ROOT, 'data_cache', fix.original));
  const { width: W, height: H, data } = img.bitmap;
  const at = (x, y) => (y * W + x) * 4;
  const isWhite = i => data[i + 3] > 200 && data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200;
  const isClear = i => data[i + 3] < 60;
  const isDark = i => data[i + 3] > 150 && data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90;
  const paint = i => { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; };
  const each = (pts, fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPoly(x + 0.5, y + 0.5, pts)) fn(at(x, y), x, y); };

  // Arch gaps first, on the original art, so the background pockets cleared next can't be mistaken for gaps
  if (fix.archGaps) {
    const [x0, y0, x1, y1] = fix.archGaps.box;
    for (let y = y0; y <= y1; y++) {
      let x = x0;
      while (x <= x1) {
        if (!isClear(at(x, y))) { x++; continue; }
        let e = x;
        while (e + 1 <= x1 && isClear(at(e + 1, y))) e++;
        const left = x - 1 >= 0 && !isClear(at(x - 1, y)) && x > x0, right = e + 1 < W && !isClear(at(e + 1, y)) && e < x1;
        if (left && right && e - x + 1 <= fix.archGaps.maxGap) for (let k = x; k <= e; k++) paint(at(k, y));
        x = e + 1;
      }
    }
  }
  for (const { seeds, shape } of fix.pockets) {
    const seen = new Uint8Array(W * H), stack = seeds.map(p => p.slice());
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H || !inPoly(x + 0.5, y + 0.5, shape)) continue;
      if (fix.protect.some(pr => inPoly(x + 0.5, y + 0.5, pr))) continue;
      const p = y * W + x;
      if (seen[p]) continue;
      seen[p] = 1;
      if (!isWhite(p * 4)) continue;
      data[p * 4 + 3] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  for (const poly of fix.archFill) each(poly, i => { if (isClear(i)) paint(i); });
  for (const poly of fix.shoes) each(poly, (i, x, y) => {
    if (!isClear(i)) return;
    let dark = 0;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && isDark(at(xx, yy))) dark++;
    }
    if (dark >= 4) paint(i);
  });
  // The white halo the scan left around every outer edge: "color to alpha" on light edge pixels touching see-through
  // areas, two pixels deep. The white is taken out of each pixel (light gray becomes partly see-through black, light
  // pink partly see-through red), so outlines keep smooth edges and no white fringe is left. Pure white is left alone,
  // so the arch's white band isn't eaten where it has no outline.
  for (let pass = 0; pass < 2; pass++) {
    const near = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isClear(at(x, y))) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || isClear(at(xx, yy))) { near[y * W + x] = 1; break; }
      }
    }
    for (let p = 0; p < W * H; p++) {
      if (!near[p]) continue;
      const i = p * 4, lo = Math.min(data[i], data[i + 1], data[i + 2]);
      if (lo > 245 || lo < 100) continue;
      const a = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]) / 255;
      for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.round(255 - (255 - data[i + k]) / a));
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
  const buf = await img.getBufferAsync(Jimp.MIME_PNG);
  return 'data:image/png;base64,' + buf.toString('base64');
}

(async () => {
  const eras = JSON.parse(fs.readFileSync(ERAS, 'utf8'));
  const processed = JSON.parse(fs.readFileSync(PROCESSED, 'utf8'));
  const swaps = [];
  for (const fix of FIXES) {
    const era = eras.primary[fix.tid][fix.era];
    const uri = await clean(fix);
    // LOGO_PREVIEW=<file.png>: write the cleaned logo there and change nothing else
    if (process.env.LOGO_PREVIEW) { fs.writeFileSync(process.env.LOGO_PREVIEW, Buffer.from(uri.split(',')[1], 'base64')); console.log('preview written'); return; }
    if (era.data !== uri) swaps.push([era.data, uri]);
    era.data = uri;
    console.log(`${fix.name}: cleaned`);
  }
  for (const k of Object.keys(processed)) for (const [a, b] of swaps) if (processed[k] === a) processed[k] = b;
  for (const list of Object.values(eras.secondary || {})) for (const e of list) for (const [a, b] of swaps) if (e.data === a) e.data = b;
  fs.writeFileSync(ERAS, JSON.stringify(eras));
  fs.writeFileSync(PROCESSED, JSON.stringify(processed));
  for (const file of MASTERS) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    for (const [a, b] of swaps) {
      const n = text.split(a).length - 1;
      text = text.split(a).join(b);
      console.log(`${path.basename(file)}: replaced ${n} copies`);
    }
    fs.writeFileSync(file, text);
  }
})();
