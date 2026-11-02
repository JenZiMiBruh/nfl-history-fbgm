/**
 * fetch_logos.js - resolves historical team logo files on Wikipedia / Wikimedia
 * Commons to hotlinkable PNG URLs and writes data_cache/logos.json, keyed by the
 * logo ids used in nfl_eras.js. Ids that cannot be resolved are left out, and
 * nfl_eras.js falls back to the franchise's current logo for them.
 *
 * Wikimedia rate-limits aggressively, so requests are spaced out and retried.
 * Usage: node src/fetch_logos.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'data_cache', 'logos.json');
const UA = 'NFLHistoryFBGM/1.0 (personal offline football sim project; node)';
const NFLVERSE = (a) => `https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/squared_logos/${a}.png`;

// logo id -> candidate files ([site, File name]) in priority order, or a direct URL.
const CANDIDATES = {
  IND_1953: [['en', 'Baltimore_Colts_logo_1961-1978.gif']],
  HOU_1960: [['commons', 'Houston_Oilers_logo.png']],
  LA_1951: [['commons', 'Los_Angeles_Rams_Logo.png']],
  NO_1967: [['commons', 'New_Orleans_Saints_logo_1967-1999.gif']],
  BUF_1962: [['commons', 'Buffalo_Bills_classic_logo.svg']],
  BUF_1974: [['commons', 'Buffalo_Bills_logo_1974-present.png']],
  BUF_2002: [['commons', 'Buffalo_Bills_logo_1974-present.png']],
  NE_1961: { url: 'https://upload.wikimedia.org/wikipedia/en/0/0b/New_England_Patriots_logo_old.svg' },
  NYG_1976: { url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Giants_1976-1999.png' },
  ARI_2005: [['commons', 'Arizona_Cardinals_logo_(2005).png']],
  OAK_1964: { url: NFLVERSE('OAK') },
  SD_1961: { url: NFLVERSE('SD') },
  SD_1974: { url: NFLVERSE('SD') },
  SD_1988: { url: NFLVERSE('SD') },
  SD_2007: { url: NFLVERSE('SD') },
  WAS_1972: { url: NFLVERSE('WAS') }
};

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveFile(site, file) {
  const host = site === 'commons' ? 'commons.wikimedia.org' : 'en.wikipedia.org';
  const url = `https://${host}/w/api.php?action=query&titles=File:${encodeURIComponent(file)}&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await get(url);
    if (r.status === 200) {
      try {
        const pages = JSON.parse(r.body).query.pages;
        const info = Object.values(pages)[0].imageinfo;
        if (info && info[0]) return info[0].thumburl || info[0].url;
        return null;
      } catch (e) { /* rate-limit text, retry */ }
    }
    await sleep(15000 * (attempt + 1));
  }
  return null;
}

async function main() {
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (const [id, cand] of Object.entries(CANDIDATES)) {
    if (out[id]) continue;
    if (cand.url) { out[id] = cand.url; continue; }
    for (const [site, file] of cand) {
      const u = await resolveFile(site, file);
      await sleep(4000);
      if (u) { out[id] = u.split('?')[0]; console.log(id, out[id]); break; }
    }
    if (!out[id]) console.log(id, 'unresolved');
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('logos resolved:', Object.keys(out).length);
}

main();
