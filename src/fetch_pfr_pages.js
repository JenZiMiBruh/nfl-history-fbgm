/**
 * fetch_pfr_pages.js - downloads more Internet Archive snapshots of Pro-Football-Reference
 * pages (archive.org only), resuming where it left off:
 *   draft    /years/<y>/draft.htm and /years/<y>_AFL/draft.htm   -> data_cache/pfr_wayback/draft/
 *   rosters  /teams/<code>/<y>_roster.htm                        -> data_cache/pfr_wayback/rosters/
 *   teams    /teams/<code>/<y>.htm (team and opponent stats)       -> data_cache/pfr_wayback/teams/
 * Usage: node src/fetch_pfr_pages.js draft rosters teams
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const E = require('./nfl_eras');

const BASE = path.join(__dirname, '..', 'data_cache', 'pfr_wayback');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Pro-Football-Reference franchise codes by our tid.
const PFR_CODE = ['crd', 'atl', 'rav', 'buf', 'car', 'chi', 'cin', 'cle', 'dal', 'den', 'det', 'gnb', 'htx', 'clt', 'jax', 'kan', 'rai', 'sdg', 'ram',
  'mia', 'min', 'nwe', 'nor', 'nyg', 'nyj', 'phi', 'pit', 'sfo', 'sea', 'tam', 'oti', 'was'];

function get(url, redirects = 5) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      const enc = res.headers['content-encoding'];
      const s = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      s.on('data', c => chunks.push(c));
      s.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      s.on('error', () => resolve({ status: 0, body: '' }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

async function snapshots(pagePath) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('pro-football-reference.com' + pagePath)}&output=json&filter=statuscode:200&limit=-3&fl=timestamp,original`);
    if (r.status === 200) {
      try { return JSON.parse(r.body || '[]').slice(1).reverse().map(([ts, o]) => `https://web.archive.org/web/${ts}id_/${o}`); } catch (e) { /* retry */ }
    }
    await sleep(10000 * (attempt + 1));
  }
  return [];
}

function pageList(mode) {
  const out = [];
  for (let y = 1966; y <= 1998; y++) {
    if (mode === 'draft') {
      out.push({ p: `/years/${y}/draft.htm`, f: `${y}.html` });
      if (y <= 1969) out.push({ p: `/years/${y}_AFL/draft.htm`, f: `${y}AFL.html` });
      continue;
    }
    for (let tid = 0; tid < 32; tid++) {
      if (!E.isActive(tid, y)) continue;
      const code = PFR_CODE[tid];
      out.push({ p: mode === 'rosters' ? `/teams/${code}/${y}_roster.htm` : `/teams/${code}/${y}.htm`, f: `${y}_${code}.html` });
    }
  }
  return out;
}

async function run(mode) {
  const dir = path.join(BASE, mode);
  fs.mkdirSync(dir, { recursive: true });
  const pages = pageList(mode);
  let ok = 0, missing = 0, n = 0;
  for (const { p, f } of pages) {
    n++;
    const file = path.join(dir, f);
    if (fs.existsSync(file)) continue;
    const snaps = await snapshots(p);
    await sleep(1500);
    let saved = false;
    for (const s of snaps) {
      for (let attempt = 0; attempt < 3 && !saved; attempt++) {
        const r = await get(s);
        if (r.status === 200 && r.body.includes('<table')) { fs.writeFileSync(file, r.body); saved = true; }
        else await sleep(10000 * (attempt + 1));
      }
      if (saved) break;
    }
    if (saved) ok++; else missing++;
    if (n % 50 === 0) console.log(`${mode}: ${n}/${pages.length} (${ok} saved, ${missing} not archived)`);
    await sleep(2500);
  }
  console.log(`${mode} done: ${ok} saved, ${missing} not archived`);
}

(async () => { for (const mode of process.argv.slice(2)) await run(mode); })();
