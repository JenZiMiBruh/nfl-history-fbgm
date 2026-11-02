/**
 * fix_logo_holes.js - fills the see-through insides of outline-style logos with white.
 *
 * A few classic logos are line art on a transparent background (the 1966-80 Rams heads, the 1969-71 Oilers
 * helmet). On a white page they look right, but on Football GM's dark theme or a team-colored header the
 * background shows through the face, horns and helmet. This fills only the enclosed area: a morphological
 * closing bridges small gaps (hatching, an open facemask) without growing the logo, then everything the
 * outside can't reach gets white underneath, so soft edges blend onto white.
 *
 * Updates data_cache/logos_eras_final.json, data_cache/logos_processed.json and, by exact string replacement,
 * NFL_Master_1966_2026.json, so no rebuild is needed.
 *
 * Usage: node --max-old-space-size=14000 src/fix_logo_holes.js <path to jimp module>
 */
const fs = require('fs');
const path = require('path');
const Jimp = require(process.argv[2] || 'jimp');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data_cache', 'logos_eras_final.json');
const PROCESSED = path.join(ROOT, 'data_cache', 'logos_processed.json');
const MASTER = path.join(ROOT, 'NFL_Master_1966_2026.json');

// tid -> primary logo era indexes to fill
// Override with LOGO_TARGETS='{"28":[0]}' to fix one logo; LOGO_GAP for logos whose gaps open to the edge; LOGO_PREVIEW=<dir> writes PNGs instead of saving
const TARGETS = process.env.LOGO_TARGETS ? JSON.parse(process.env.LOGO_TARGETS) : { 18: [0, 1, 2], 30: [1] } // gap 8: { 28: [0], 6: [0], 9: [0] };
const GAP = +process.env.LOGO_GAP || 5; // pixels of outline thickening when deciding what's enclosed

async function fill(dataUri) {
  const img = await Jimp.read(Buffer.from(dataUri.split(',')[1], 'base64'));
  const { width: W, height: H, data } = img.bitmap;
  const op = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) op[p] = data[p * 4 + 3] > 10 ? 1 : 0;
  const morph = (src, r, grow) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = grow ? 0 : 1;
      for (let dy = -r; dy <= r && v === (grow ? 0 : 1); dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const xx = x + dx, yy = y + dy;
        const s = xx >= 0 && yy >= 0 && xx < W && yy < H ? src[yy * W + xx] : 0;
        if (grow && s) { v = 1; break; }
        if (!grow && !s) { v = 0; break; }
      }
      out[y * W + x] = v;
    }
    return out;
  };
  // Closing (thicken, then thin back) bridges gaps in the outline without growing the logo outward
  const closed = morph(morph(op, GAP, true), GAP, false);
  // Flood the outside from the border
  const outside = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || closed[p]) continue;
    outside[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  // Inside the logo, put white under every pixel: soft edges blend onto white instead of the background
  let filled = 0;
  for (let p = 0; p < W * H; p++) {
    if (outside[p]) continue;
    const a = data[p * 4 + 3] / 255;
    if (a >= 1) continue;
    for (let k = 0; k < 3; k++) data[p * 4 + k] = Math.round(data[p * 4 + k] * a + 255 * (1 - a));
    data[p * 4 + 3] = 255;
    filled++;
  }
  const buf = await img.getBufferAsync(Jimp.MIME_PNG);
  return { uri: 'data:image/png;base64,' + buf.toString('base64'), filled, total: W * H };
}

(async () => {
  const eras = JSON.parse(fs.readFileSync(ERAS, 'utf8'));
  const processed = JSON.parse(fs.readFileSync(PROCESSED, 'utf8'));
  const swaps = [];
  for (const [tid, idxs] of Object.entries(TARGETS)) {
    for (const i of idxs) {
      const era = eras.primary[tid][i];
      const { uri, filled, total } = await fill(era.data);
      console.log(`tid ${tid} ${era.from}-${era.to}: filled ${(100 * filled / total).toFixed(1)}% of the image`);
      if (process.env.LOGO_PREVIEW) { fs.writeFileSync(path.join(process.env.LOGO_PREVIEW, tid + '-' + i + '.png'), Buffer.from(uri.split(',')[1], 'base64')); continue; }
      swaps.push([era.data, uri]);
      era.data = uri;
    }
  }
  if (process.env.LOGO_PREVIEW) return;
  for (const k of Object.keys(processed)) for (const [a, b] of swaps) if (processed[k] === a) { processed[k] = b; console.log('processed', k); }
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
