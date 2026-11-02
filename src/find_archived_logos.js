/**
 * find_archived_logos.js - finds historical NFL logo images that Wikipedia used to
 * host (since removed) but the Internet Archive preserved. Scans archived copies of
 * team articles from 2005-2012, collects logo image URLs, checks which images the
 * archive captured, and downloads them for review.
 *
 * Output: data_cache/archived_logos/candidates.json and image files for review.
 * Usage: node src/find_archived_logos.js [Page1,Page2,...] [year1,year2,...]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'data_cache', 'archived_logos');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PAGES = ['Arizona_Cardinals', 'St._Louis_Cardinals_(NFL)', 'Phoenix_Cardinals', 'Atlanta_Falcons', 'Baltimore_Ravens', 'Buffalo_Bills',
  'Carolina_Panthers', 'Chicago_Bears', 'Cincinnati_Bengals', 'Cleveland_Browns', 'Dallas_Cowboys', 'Denver_Broncos', 'Detroit_Lions',
  'Green_Bay_Packers', 'Houston_Texans', 'Indianapolis_Colts', 'Baltimore_Colts', 'Jacksonville_Jaguars', 'Kansas_City_Chiefs', 'Oakland_Raiders',
  'San_Diego_Chargers', 'St._Louis_Rams', 'Los_Angeles_Rams', 'Miami_Dolphins', 'Minnesota_Vikings', 'New_England_Patriots', 'Boston_Patriots',
  'New_Orleans_Saints', 'New_York_Giants', 'New_York_Jets', 'Philadelphia_Eagles', 'Pittsburgh_Steelers', 'San_Francisco_49ers', 'Seattle_Seahawks',
  'Tampa_Bay_Buccaneers', 'Tennessee_Titans', 'Houston_Oilers', 'Washington_Redskins', 'Logos_and_uniforms_of_the_Denver_Broncos',
  'Logos_and_uniforms_of_the_Philadelphia_Eagles', 'Logos_and_uniforms_of_the_New_York_Jets', 'Logos_and_uniforms_of_the_Pittsburgh_Steelers',
  'List_of_NFL_team_logos'];
const YEARS = process.argv[3] ? process.argv[3].split(',').map(Number) : [2005, 2007, 2009, 2011];
const PAGE_LIST = process.argv[2] ? process.argv[2].split(',') : PAGES;

function get(url, redirects = 5) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      const enc = res.headers['content-encoding'];
      const s = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      s.on('data', c => chunks.push(c));
      s.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), type: res.headers['content-type'] || '' }));
      s.on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }));
    }).on('error', () => resolve({ status: 0, buf: Buffer.alloc(0) }));
  });
}
async function cdx(url, extra = '') {
  const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&fl=timestamp,original${extra}`);
  try { return JSON.parse(r.buf.toString() || '[]').slice(1); } catch (e) { return []; }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const found = new Map(); // image path -> { pages:Set, years:Set }
  for (const page of PAGE_LIST) {
    for (const y of YEARS) {
      const snaps = await cdx(`en.wikipedia.org/wiki/${page}`, `&from=${y}&to=${y}&limit=1`);
      await sleep(1200);
      if (!snaps.length) continue;
      const [ts, orig] = snaps[0];
      const r = await get(`https://web.archive.org/web/${ts}id_/${orig}`);
      await sleep(1500);
      const html = r.buf.toString();
      const re = /upload\.wikimedia\.org\/wikipedia\/(?:en|commons)\/[^"'\s)]+/g;
      let m;
      while ((m = re.exec(html))) {
        const u = m[0].replace(/&amp;/g, '&');
        const file = decodeURIComponent(u.split('/').pop());
        if (!/logo|old|helmet|wordmark|emblem|primary/i.test(file) || /flag|icon|stub|commons-logo|wiki|disambig|question/i.test(file)) continue;
        if (!found.has(u)) found.set(u, { pages: new Set(), years: new Set() });
        found.get(u).pages.add(page); found.get(u).years.add(y);
      }
    }
    console.log(page, 'candidates so far', found.size);
  }
  // Keep only images the archive captured; download one copy of each for review.
  const out = [];
  let i = 0;
  for (const [u, info] of found) {
    const snaps = await cdx(u, '&limit=1');
    await sleep(1000);
    if (!snaps.length) continue;
    const [ts, orig] = snaps[0];
    const archived = `https://web.archive.org/web/${ts}im_/${orig}`;
    const r = await get(archived.replace('im_/', 'id_/'));
    await sleep(1000);
    if (r.status !== 200 || r.buf.length < 200) continue;
    const ext = (orig.match(/\.(png|gif|jpe?g|svg)(?:\.png)?$/i) || [, 'png'])[1].toLowerCase();
    const local = `${process.argv[2] ? 'b' : 'logo'}_${String(++i).padStart(3, '0')}.${ext === 'svg' ? 'png' : ext}`;
    fs.writeFileSync(path.join(OUT, local), r.buf);
    out.push({ local, file: decodeURIComponent(orig.split('/').pop()), archived, pages: [...info.pages], years: [...info.years] });
  }
  fs.writeFileSync(path.join(OUT, process.argv[2] ? 'candidates2.json' : 'candidates.json'), JSON.stringify(out, null, 1));
  console.log('archived logo images:', out.length);
}

main();
