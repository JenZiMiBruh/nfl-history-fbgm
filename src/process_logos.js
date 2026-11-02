/**
 * process_logos.js - embeds every team logo in the league as a small transparent PNG.
 * Covers the era logos in data_cache/logos.json and each franchise's current logo
 * (stored as CURRENT_<tid>), so no logo depends on an outside site staying up.
 * Images without transparency (archived GIF/JPEG files) get their background removed:
 * the background color is taken from the image corner and cleared from the edges in.
 * Output: data_cache/logos_processed.json (id -> data URI).
 *
 * Usage: node src/process_logos.js <path to jimp module> [--all]
 *   --all  re-download logos that are already embedded
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const E = require('./nfl_eras');

const Jimp = require(process.argv[2] || 'jimp');
const CACHE = path.join(__dirname, '..', 'data_cache');
const logos = JSON.parse(fs.readFileSync(path.join(CACHE, 'logos.json'), 'utf8'));
for (const [tid, url] of Object.entries(E.CURRENT_LOGO)) logos['CURRENT_' + tid] = url;

const get = (url, redirects = 5) => new Promise((resolve) => {
  https.get(url, { headers: { 'User-Agent': 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)' } }, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1)); }
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve(res.statusCode === 200 ? Buffer.concat(chunks) : null));
  }).on('error', () => resolve(null));
});

// Clear pixels matching the corner color that are connected to the image edges.
function clearBackground(img) {
  const { width: w, height: h } = img.bitmap;
  const data = img.bitmap.data;
  const bg = [data[0], data[1], data[2]];
  const isBg = (i) => data[i + 3] > 0 && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 60;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (!isBg(i)) continue;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

(async () => {
  const outFile = path.join(CACHE, 'logos_processed.json');
  const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  for (const [id, url] of Object.entries(logos)) {
    if (!/^https?:/.test(url)) continue;
    if (out[id] && !process.argv.includes('--all')) continue;
    const buf = await get(url.replace(/(\d{14})im_\//, '$1id_/'));
    if (!buf) { console.log(id, 'download failed'); await new Promise(r => setTimeout(r, 4000)); continue; }
    try {
      const img = await Jimp.read(buf);
      if (img.bitmap.width > 128 || img.bitmap.height > 128) img.scaleToFit(128, 128);
      const d = img.bitmap.data;
      if (d[3] === 255 && d[d.length - 1] === 255) clearBackground(img);
      out[id] = await img.getBase64Async(Jimp.MIME_PNG);
      console.log(id, 'ok', Math.round(out[id].length / 1024) + 'KB');
      fs.writeFileSync(outFile, JSON.stringify(out));
    } catch (e) { console.log(id, 'failed', e.message); }
    await new Promise(r => setTimeout(r, 2500));
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log('embedded logos:', Object.keys(out).length);
})();
