/**
 * fetch_logopedia.js - complete, dated primary-logo histories for every franchise from
 * Logopedia (logos.fandom.com). Team pages are read from Internet Archive snapshots
 * (the live site sits behind a bot check); images come from Fandom's image server as
 * 256px PNGs, are made transparent where needed, and are embedded as data URIs.
 *
 * Output: data_cache/logopedia/pages/*.html (cached pages) and
 *         data_cache/logos_eras.json  { tid: [{ from, to, src, data }] }
 * Usage: node src/fetch_logopedia.js <path to jimp module>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const Jimp = require(process.argv[2] || 'jimp');
const CACHE = path.join(__dirname, '..', 'data_cache');
const PAGES_DIR = path.join(CACHE, 'logopedia', 'pages');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
// Logopedia page titles per tid (current name first; older identities that have their own page after).
const PAGES = {
  0: ['Arizona_Cardinals'], 1: ['Atlanta_Falcons'], 2: ['Baltimore_Ravens'], 3: ['Buffalo_Bills'], 4: ['Carolina_Panthers'], 5: ['Chicago_Bears'],
  6: ['Cincinnati_Bengals'], 7: ['Cleveland_Browns'], 8: ['Dallas_Cowboys'], 9: ['Denver_Broncos'], 10: ['Detroit_Lions'], 11: ['Green_Bay_Packers'],
  12: ['Houston_Texans'], 13: ['Indianapolis_Colts'], 14: ['Jacksonville_Jaguars'], 15: ['Kansas_City_Chiefs'], 16: ['Las_Vegas_Raiders', 'Oakland_Raiders'],
  17: ['Los_Angeles_Chargers', 'San_Diego_Chargers'], 18: ['Los_Angeles_Rams', 'St._Louis_Rams'], 19: ['Miami_Dolphins'], 20: ['Minnesota_Vikings'],
  21: ['New_England_Patriots'], 22: ['New_Orleans_Saints'], 23: ['New_York_Giants'], 24: ['New_York_Jets'], 25: ['Philadelphia_Eagles'],
  26: ['Pittsburgh_Steelers'], 27: ['San_Francisco_49ers'], 28: ['Seattle_Seahawks'], 29: ['Tampa_Bay_Buccaneers'], 30: ['Tennessee_Titans', 'Houston_Oilers'],
  31: ['Washington_Commanders', 'Washington_Redskins', 'Washington_Football_Team']
};
const SKIP = /InfoWhite|SVG_needed|NFL\.svg|Site-|Wordmark|wordmark|anniversary|_\d+th_|Playoff|Super_Bowl|helmet|Helmet|uniform/i;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url, redirects = 5) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1)); }
      const enc = res.headers['content-encoding'];
      const s = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      s.on('data', c => chunks.push(c));
      s.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      s.on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }));
    }).on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }));
  });
}

async function archivedPage(title) {
  const file = path.join(PAGES_DIR, title + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('logos.fandom.com/wiki/' + title)}&output=json&filter=statuscode:200&fl=timestamp,original&limit=-1`);
    let rows = [];
    try { rows = JSON.parse(r.buf.toString() || '[]').slice(1); } catch (e) { await sleep(10000); continue; }
    if (!rows.length) return null;
    const [ts, orig] = rows[rows.length - 1];
    const p = await get(`https://web.archive.org/web/${ts}id_/${orig}`);
    if (p.status === 200) { fs.writeFileSync(file, p.buf); return p.buf.toString(); }
    await sleep(10000);
  }
  return null;
}

// Era headings ("1966–1973", "2018–present") each followed by that era's primary logo.
function parseEras(html) {
  const eras = [];
  const re = /<h[234][^>]*>([\s\S]*?)<\/h[234]>|<img[^>]*?data-image-key="([^"]+)"[^>]*>/g;
  let m, cur = null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/&#8211;|&ndash;/g, '–');
      const y = t.match(/(\d{4})\s*[–\-—]\s*(\d{4}|present|Present)/) || t.match(/^\s*(\d{4})\s*$/);
      cur = y ? { from: +y[1], to: y[2] ? (/\d/.test(y[2]) ? +y[2] : 2026) : +y[1], src: null } : null;
      if (cur) eras.push(cur);
      continue;
    }
    if (!cur || cur.src) continue;
    const key = m[2];
    if (SKIP.test(key)) continue;
    const tag = m[0];
    const u = (tag.match(/(?:data-src|src)="(https:\/\/static\.wikia\.nocookie\.net\/logopedia\/images\/[^"]+?\/revision\/latest)/) || [])[1];
    if (u) cur.src = u;
  }
  return eras.filter(e => e.src);
}

function clearBackground(img) {
  const { width: w, height: h, data } = img.bitmap;
  if (data[3] < 255 || data[data.length - 1] < 255) return; // already transparent
  const bg = [data[0], data[1], data[2]];
  const seen = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) >= 60) continue;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

(async () => {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  const outFile = path.join(CACHE, 'logos_eras.json');
  const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  for (const [tid, titles] of Object.entries(PAGES)) {
    if (out[tid] && out[tid].length) continue;
    const eras = [];
    for (const t of titles) {
      const html = await archivedPage(t);
      await sleep(2000);
      if (!html) continue;
      for (const e of parseEras(html)) if (!eras.some(x => x.from === e.from && x.to === e.to)) eras.push(e);
    }
    eras.sort((a, b) => a.from - b.from);
    for (const e of eras) {
      if (e.to < 1966) continue;
      const r = await get(e.src + '/scale-to-width-down/256?format=png');
      await sleep(800);
      if (r.status !== 200) continue;
      try {
        const img = await Jimp.read(r.buf);
        img.scaleToFit(200, 200);
        clearBackground(img);
        e.data = await img.getBase64Async(Jimp.MIME_PNG);
      } catch (err) { /* unreadable image */ }
    }
    out[tid] = eras.filter(e => e.data && e.to >= 1966);
    console.log(tid, titles[0], out[tid].map(e => `${e.from}-${e.to}`).join(' '));
    fs.writeFileSync(outFile, JSON.stringify(out));
  }
  console.log('done');
})();
