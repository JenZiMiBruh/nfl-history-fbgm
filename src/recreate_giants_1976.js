/**
 * recreate_giants_1976.js - rebuilds the 1976-99 New York Giants "GIANTS" logo at high resolution.
 *
 * No clean copy of that logo exists online, but the team's own 1994 "70 Seasons" logo uses the same italic
 * GIANTS lettering. This traces the blue letters out of it, upsamples the shape 8x with smoothing so the edges
 * are clean curves instead of pixels, and redraws it in Giants blue with the white outline the letters carry.
 *
 * Output: data_cache/logo_sources/NYG_1976_recreated.png (used by upgrade_logos.js via logo_overrides.json)
 * Usage: node src/recreate_giants_1976.js <jimp module>
 */
const path = require('path');
const Jimp = require(process.argv[2]);
const SRC = path.join(__dirname, '..', 'data_cache', 'logo_sources', 'New_York_Giants_logo_(70_Seasons_of_Pro_Football).png');
const OUT = path.join(__dirname, '..', 'data_cache', 'logo_sources', 'NYG_1976_recreated.png');
const BLUE = [1, 35, 82];   // #012352, Giants blue
const UP = 8;

(async () => {
  const src = await Jimp.read(SRC);
  const { width: W, data } = src.bitmap;
  // The lettering sits in the top band of the badge
  const y0 = 24, y1 = 122, x0 = 96, x1 = 456, PAD = 12;
  const w = x1 - x0 + PAD * 2, h = y1 - y0 + PAD * 2;
  // Blueness of each pixel (blue clearly above red and green)
  const mask = new Jimp(w, h, 0x000000ff);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - PAD + x0, sy = y - PAD + y0;
    // Outside the crop, and the tops of the two helmets that poke into the bottom corners, stay empty
    if (sx < x0 || sx >= x1 || sy < y0 || sy >= y1 || (sy >= 104 && sx > 354) || (sy >= 106 && sx < 137) || (sy >= 112 && sx < 146)) { mask.bitmap.data.set([0, 0, 0, 255], (y * w + x) * 4); continue; }
    const p = (sy * W + sx) * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
    const v = a > 100 ? Math.max(0, Math.min(255, (b - Math.max(r, g)) * 3)) : 0;
    mask.bitmap.data.set([v, v, v, 255], (y * w + x) * 4);
  }
  // Keep only the letters: drop thin pieces of the badge border that fall inside the crop
  const on = new Uint8Array(w * h), comp = new Int32Array(w * h).fill(-1);
  for (let p = 0; p < w * h; p++) on[p] = mask.bitmap.data[p * 4] > 60 ? 1 : 0;
  const sizes = [], boxes = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!on[p0] || comp[p0] >= 0) continue;
    const id = sizes.length, st = [p0]; let n = 0, mnx = w, mxx = 0;
    comp[p0] = id;
    while (st.length) { const p = st.pop(); n++; const x = p % w, y = (p / w) | 0; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x);
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && on[q] && comp[q] < 0) { comp[q] = id; st.push(q); } }
    sizes.push(n); boxes.push(mxx - mnx + 1);
  }
  for (let p = 0; p < w * h; p++) if (comp[p] >= 0 && (sizes[comp[p]] < 400 || boxes[comp[p]] < 12)) mask.bitmap.data.set([0, 0, 0, 255], p * 4);
  // Upsample, smooth, re-threshold: pixel steps become curves
  mask.resize(w * UP, h * UP, Jimp.RESIZE_BICUBIC).blur(UP / 2);
  const M = mask.bitmap, MW = M.width, MH = M.height;
  const inside = new Float32Array(MW * MH);
  for (let p = 0; p < MW * MH; p++) {
    const v = M.data[p * 4];
    inside[p] = Math.max(0, Math.min(1, (v - 118) / 20)); // narrow ramp = anti-aliased edge
  }
  // White outline: the letter shape grown by a few percent of the letter height
  const R = Math.round(MH * 0.035);
  const grown = new Float32Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let m = 0;
    for (let dy = -R; dy <= R && m < 1; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
      const v = inside[yy * MW + xx]; if (v > m) m = v; if (m >= 1) break;
    }
    grown[y * MW + x] = m;
  }
  const out = new Jimp(MW, MH, 0x00000000);
  for (let p = 0; p < MW * MH; p++) {
    const a = inside[p], o = grown[p];
    if (o <= 0) continue;
    const col = [0, 1, 2].map(k => Math.round(BLUE[k] * a + 255 * (1 - a)));
    out.bitmap.data.set([...col, Math.round(o * 255)], p * 4);
  }
  out.autocrop({ tolerance: 0.0005, cropOnlyFrames: false });
  await out.writeAsync(OUT);
  console.log('wrote', OUT, out.bitmap.width + 'x' + out.bitmap.height);
})();
