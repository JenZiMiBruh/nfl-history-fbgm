/**
 * fetch_pfr_wayback.js - downloads Internet Archive (Wayback Machine) snapshots of
 * Pro-Football-Reference season stat pages for 1966-1998. Only archive.org is
 * contacted; Pro-Football-Reference's own servers are never requested.
 *
 * Output: data_cache/pfr_wayback/<season>_<category>.html
 * Usage:  node src/fetch_pfr_wayback.js [firstSeason] [lastSeason] [--afl]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'data_cache', 'pfr_wayback');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const CATEGORIES = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'returns'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url, redirects = 5) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      const enc = res.headers['content-encoding'];
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress())
        : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', () => resolve({ status: 0, body: '' }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

// Most recent successful captures via the CDX index (the "available" API misses many).
async function snapshotUrls(pageUrl) {
  const bare = pageUrl.replace(/^https?:\/\/(www\.)?/, '');
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(bare)}&output=json&filter=statuscode:200&limit=-3&fl=timestamp,original`);
    if (r.status === 200) {
      try {
        const rows = JSON.parse(r.body || '[]').slice(1).reverse();
        // "id_" returns the original page without the Wayback toolbar.
        return rows.map(([ts, orig]) => `https://web.archive.org/web/${ts}id_/${orig}`);
      } catch (e) { /* retry */ }
    }
    await sleep(10000 * (attempt + 1));
  }
  return [];
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const first = parseInt(process.argv[2] || '1966', 10), last = parseInt(process.argv[3] || '1998', 10);
  // --afl: the AFL's own season pages (1966-1969 are separate leagues on Pro-Football-Reference).
  const league = process.argv.includes('--afl') ? '_AFL' : '';
  let ok = 0, missing = [];
  for (let y = first; y <= last; y++) {
    for (const cat of CATEGORIES) {
      const file = path.join(OUT, `${y}${league.replace('_', '')}_${cat}.html`);
      if (fs.existsSync(file) && fs.statSync(file).size > 20000) continue;
      const page = `https://www.pro-football-reference.com/years/${y}${league}/${cat}.htm`;
      const snaps = await snapshotUrls(page);
      await sleep(1500);
      let saved = false;
      for (const snap of snaps) {
        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
          const r = await get(snap);
          if (r.status === 200 && r.body.includes('stats_table')) { fs.writeFileSync(file, r.body); saved = true; ok++; }
          else await sleep(10000 * (attempt + 1));
        }
        if (saved) break;
      }
      if (!saved) missing.push(`${y} ${cat}`);
      await sleep(2500);
    }
    console.log(`${y} done (${ok} pages saved, ${missing.length} missing)`);
  }
  if (missing.length) console.log('missing:', missing.join(', '));
}

main();
