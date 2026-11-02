/**
 * upgrade_logos.js - rebuilds every era logo at high resolution from its original source.
 *
 * The first logo pass stored logos at ~160px. This goes back to each era's original file
 * (data_cache/logos_eras.json `src`): SVGs are rendered with headless Chrome, raster files are re-read at their
 * full size. Each logo is trimmed to its content, fitted inside SIZE x SIZE with a small transparent margin,
 * and, for outline-style logos meant to be solid (FILL), the enclosed see-through areas get white underneath
 * with blended edges. Overrides (OVERRIDE) point an era at a better source when the original is tiny.
 *
 * Writes data_cache/logos_eras_final.json, data_cache/logos_processed.json and swaps the images inside
 * NFL_Master_1966_2026.json by exact string replacement, plus a contact sheet for review.
 *
 * Usage: node --max-old-space-size=14000 src/upgrade_logos.js <jimp module> <chrome.exe> [--dry]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execFileSync } = require('child_process');
const Jimp = require(process.argv[2]);
const CHROME = process.argv[3];
const DRY = process.argv.includes('--dry');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data_cache');
const SRC_DIR = path.join(CACHE, 'logo_sources');
const OUT_DIR = path.join(CACHE, 'logos_hires');
fs.mkdirSync(SRC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 256;
const MARGIN = 6;
// `${tid}:${from}` -> outline logos whose insides should be solid white
const FILL = new Set(['18:1948', '18:1972', '18:1975', '18:1981', '30:1969', '30:1972']);
// Fill color when the inside isn't white (the 1981-83 ram's face is gold)
const FILL_COLOR = { '18:1981': [255, 205, 0] };
// Outline logos that are the same drawing as a solid version: that version's shape says where the white goes
const STENCIL = {};
// Gap-bridging radius as a fraction of the logo's width when the outline has big openings (the 1972 ram's horn)
const FILL_RADIUS = { '18:1972': 1 / 9, '18:1975': 1 / 9 };
// `${tid}:${from}` -> better source URL than the original
const OVERRIDE = JSON.parse(fs.existsSync(path.join(CACHE, 'logo_overrides.json')) ? fs.readFileSync(path.join(CACHE, 'logo_overrides.json'), 'utf8') : '{}');

const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode + ' ' + url)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function fetchSource(url) {
  const name = decodeURIComponent(url.replace(/\/revision\/latest.*$/, '').split('/').pop()).replace(/[^\w.\-()]/g, '_');
  const file = path.join(SRC_DIR, name);
  if (!fs.existsSync(file)) {
    const full = url.includes('wikia.nocookie.net') ? url.replace(/\/scale-to-width-down\/\d+/, '').replace(/\?.*$/, '') + '?format=original' : url;
    fs.writeFileSync(file, await get(full));
  }
  return file;
}

// SVG -> PNG at 4x SIZE through headless Chrome (transparent background), so trimming still leaves SIZE detail.
function renderSvg(file) {
  const big = SIZE * 4;
  const html = path.join(os.tmpdir(), 'logo_render.html');
  const png = path.join(os.tmpdir(), 'logo_render.png');
  const b64 = fs.readFileSync(file).toString('base64');
  fs.writeFileSync(html, `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${b64}" style="width:${big}px;height:${big}px;object-fit:contain;display:block"></body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--virtual-time-budget=2000', `--window-size=${big},${big}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  return fs.readFileSync(png);
}

// Enclosed see-through areas get white underneath; a closing bridges small gaps first.
function fillInside(img, color = [255, 255, 255], radius = 1 / 40) {
  const { width: W, height: H, data } = img.bitmap;
  const R = Math.max(3, Math.round(W * radius));
  const op = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) op[p] = data[p * 4 + 3] > 10 ? 1 : 0;
  // Round morphology through a chamfer distance transform: grow = within R of the shape, shrink = R inside it
  const dist = (src, target) => {
    const d = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) d[p] = src[p] === target ? 0 : 1e9;
    const a = 1, b = Math.SQRT2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x; let v = d[p];
      if (x > 0) v = Math.min(v, d[p - 1] + a);
      if (y > 0) { v = Math.min(v, d[p - W] + a); if (x > 0) v = Math.min(v, d[p - W - 1] + b); if (x < W - 1) v = Math.min(v, d[p - W + 1] + b); }
      d[p] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const p = y * W + x; let v = d[p];
      if (x < W - 1) v = Math.min(v, d[p + 1] + a);
      if (y < H - 1) { v = Math.min(v, d[p + W] + a); if (x < W - 1) v = Math.min(v, d[p + W + 1] + b); if (x > 0) v = Math.min(v, d[p + W - 1] + b); }
      d[p] = v;
    }
    return d;
  };
  const morph = (src, grow) => {
    const d = dist(src, grow ? 1 : 0), out = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) out[p] = grow ? (d[p] <= R ? 1 : 0) : (d[p] > R ? 1 : 0);
    return out;
  };
  const closed = morph(morph(op, true), false);
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
  for (let p = 0; p < W * H; p++) {
    if (outside[p]) continue;
    const a = data[p * 4 + 3] / 255;
    if (a >= 1) continue;
    for (let k = 0; k < 3; k++) data[p * 4 + k] = Math.round(data[p * 4 + k] * a + color[k] * (1 - a));
    data[p * 4 + 3] = 255;
  }
}

// Make a flat white/near-white background transparent (some raster sources aren't transparent).
function knockOutBackground(img) {
  const { width: W, height: H, data } = img.bitmap;
  const corner = [0, W - 1, (H - 1) * W, H * W - 1].map(p => data[p * 4 + 3]);
  if (corner.some(a => a < 250)) return; // already transparent
  const bg = [data[0], data[1], data[2]];
  const near = p => Math.abs(data[p * 4] - bg[0]) + Math.abs(data[p * 4 + 1] - bg[1]) + Math.abs(data[p * 4 + 2] - bg[2]) < 40;
  const seen = new Uint8Array(W * H), stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !near(p)) continue;
    seen[p] = 1; data[p * 4 + 3] = 0;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1); if (y > 0) stack.push(p - W); if (y < H - 1) stack.push(p + W);
  }
}

// White under the outline wherever the solid version of the same drawing is opaque (same canvas, so aligned).
function fillFromStencil(img, stencil) {
  const { width: W, height: H, data } = img.bitmap, m = stencil.bitmap.data;
  for (let p = 0; p < W * H; p++) {
    const ma = m[p * 4 + 3] / 255, a = data[p * 4 + 3] / 255;
    if (ma <= a) continue;
    for (let k = 0; k < 3; k++) data[p * 4 + k] = Math.round((data[p * 4 + k] * a + 255 * (ma - a)) / ma);
    data[p * 4 + 3] = Math.round(ma * 255);
  }
}

async function build(url, fill, stencilUrl) {
  const file = await fetchSource(url);
  const isSvg = /\.svg$/i.test(file) || fs.readFileSync(file, 'utf8').slice(0, 400).includes('<svg');
  let img = await Jimp.read(isSvg ? renderSvg(file) : fs.readFileSync(file));
  if (!isSvg) knockOutBackground(img);
  img.autocrop({ tolerance: 0.0005, cropOnlyFrames: false });
  if (stencilUrl) {
    const st = await Jimp.read(renderSvg(await fetchSource(stencilUrl)));
    st.autocrop({ tolerance: 0.0005, cropOnlyFrames: false });
    fillInside(st);
    st.resize(img.bitmap.width, img.bitmap.height, Jimp.RESIZE_BICUBIC);
    fillFromStencil(img, st);
  }
  if (fill) {
    // Room around the logo so the fill never mistakes the image border for part of the outline
    const pad = Math.round(Math.max(img.bitmap.width, img.bitmap.height) * ((FILL_RADIUS[fill] || 1 / 40) + 0.02));
    const roomy = new Jimp(img.bitmap.width + pad * 2, img.bitmap.height + pad * 2, 0x00000000);
    roomy.composite(img, pad, pad);
    fillInside(roomy, FILL_COLOR[fill], (FILL_RADIUS[fill] || 1 / 40) * img.bitmap.width / roomy.bitmap.width);
    roomy.autocrop({ tolerance: 0.0005, cropOnlyFrames: false });
    img = roomy;
  }
  const srcW = img.bitmap.width, srcH = img.bitmap.height;
  const box = SIZE - MARGIN * 2;
  const scale = Math.min(box / srcW, box / srcH);
  img.resize(Math.round(srcW * scale), Math.round(srcH * scale), Jimp.RESIZE_BICUBIC);
  const canvas = new Jimp(SIZE, SIZE, 0x00000000);
  canvas.composite(img, Math.round((SIZE - img.bitmap.width) / 2), Math.round((SIZE - img.bitmap.height) / 2));
  const buf = await canvas.getBufferAsync(Jimp.MIME_PNG);
  return { buf, isSvg, srcPx: Math.max(srcW, srcH) / (isSvg ? 4 : 1) * (isSvg ? 4 : 1), native: isSvg ? 'vector' : `${srcW}x${srcH}` };
}

(async () => {
  const finalPath = path.join(CACHE, 'logos_eras_final.json');
  const final = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
  const srcEras = JSON.parse(fs.readFileSync(path.join(CACHE, 'logos_eras.json'), 'utf8'));
  const swaps = [], report = [];
  for (const [tid, list] of Object.entries(final.primary)) {
    for (const e of list) {
      const key = `${tid}:${e.from}`;
      const s = (srcEras[tid] || []).find(x => x.from === e.from) || (srcEras[tid] || []).find(x => x.from <= e.from && x.to >= e.from);
      const url = OVERRIDE[key] || (s && s.src);
      if (!url) { report.push(`${key} no source, kept`); continue; }
      try {
        const stencil = STENCIL[key] && ((srcEras[tid] || []).find(x => `${tid}:${x.from}` === STENCIL[key]) || {}).src;
        const { buf, native } = await build(url, FILL.has(key) ? key : false, stencil);
        fs.writeFileSync(path.join(OUT_DIR, `${tid}_${e.from}.png`), buf);
        const uri = 'data:image/png;base64,' + buf.toString('base64');
        swaps.push([e.data, uri]);
        if (!DRY) e.data = uri;
        report.push(`${key} ${native}${FILL.has(key) ? ' filled' : ''}`);
      } catch (err) {
        report.push(`${key} FAILED ${err.message}, kept`);
      }
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'report.txt'), report.join('\n'));
  console.log(report.join('\n'));
  if (DRY) return;

  fs.writeFileSync(finalPath, JSON.stringify(final));
  const procPath = path.join(CACHE, 'logos_processed.json');
  const processed = JSON.parse(fs.readFileSync(procPath, 'utf8'));
  for (const k of Object.keys(processed)) for (const [a, b] of swaps) if (processed[k] === a) processed[k] = b;
  fs.writeFileSync(procPath, JSON.stringify(processed));
  const mPath = path.join(ROOT, 'NFL_Master_1966_2026.json');
  let master = fs.readFileSync(mPath, 'utf8');
  let n = 0;
  for (const [a, b] of swaps) { if (a === b) continue; const parts = master.split(a); n += parts.length - 1; master = parts.join(b); }
  fs.writeFileSync(mPath, master);
  console.log(`master: swapped ${n} logo copies`);
})();
