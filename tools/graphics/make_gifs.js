/**
 * make_gifs.js - animated README images captured from the team explorer (site/) with headless Chrome.
 *   assets/gifs/looks.gif   every logo and jersey, flipping through franchises
 *   assets/gifs/draft.gif   the real 2027 / 2028 / 2029 classes and a few positions
 * Needs the explorer served at BASE (any static server on the repo folder) and the jimp + gifenc packages.
 *
 * Usage: node tools/graphics/make_gifs.js <jimp module> <gifenc module> <chrome.exe> [base=http://localhost:3997/site/]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Jimp = require(process.argv[2]);
const { GIFEncoder, quantize, applyPalette } = require(process.argv[3]);
const CHROME = process.argv[4];
const BASE = process.argv[5] || 'http://localhost:3997/site/';
const OUT = path.join(__dirname, '..', '..', 'assets', 'gifs');
fs.mkdirSync(OUT, { recursive: true });

function shot(query, w, h) {
  const file = path.join(os.tmpdir(), `gif_frame_${Date.now()}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=12000',
    `--window-size=${w},${h}`, `--screenshot=${file}`, BASE + '?' + query], { stdio: 'ignore' });
  return file;
}

async function gif(name, frames, w, h, width, delay) {
  const enc = GIFEncoder();
  for (const q of frames) {
    const img = await Jimp.read(shot(q, w, h));
    img.resize(width, Jimp.AUTO);
    const { data, width: W, height: H } = img.bitmap;
    const palette = quantize(data, 256);
    enc.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
    process.stdout.write('.');
  }
  enc.finish();
  fs.writeFileSync(path.join(OUT, name), enc.bytes());
  console.log(` ${name} ${(fs.statSync(path.join(OUT, name)).size / 1e6).toFixed(1)} MB`);
}

(async () => {
  // Franchises whose looks fit two rows: Bucs, Titans, Bengals, Patriots, Broncos, Seahawks, Commanders, Chargers
  await gif('looks.gif', [29, 30, 6, 21, 9, 28, 31, 17].map(t => `shot=looks&teams=${t}`), 1100, 900, 880, 1700);
  await gif('draft.gif', ['dyear=2027', 'dyear=2027&dpos=QB', 'dyear=2028', 'dyear=2028&dpos=WR', 'dyear=2029', 'dyear=2029&dpos=DL']
    .map(q => `shot=draft&${q}`), 1100, 900, 880, 1800);
})();
