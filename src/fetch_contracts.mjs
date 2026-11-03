// fetch_contracts.mjs - downloads OverTheCap's contracts from nflverse and writes data_cache/historical_contracts.csv
// for real_contracts.js. nflverse's CSV copy stopped updating in 2022; the parquet file is current, so it is read here
// and written out as CSV with the columns real_contracts.js uses.
// Needs: npm i hyparquet@1.10.0 hyparquet-compressors@1.1.1
// Usage: node src/fetch_contracts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet';
const COLS = ['player', 'position', 'team', 'is_active', 'year_signed', 'years', 'value', 'apy', 'guaranteed', 'draft_year', 'date_of_birth', 'otc_id'];

const res = await fetch(URL, { headers: { 'User-Agent': 'NFLHistoryFBGM/1.0' } });
if (!res.ok) throw new Error('HTTP ' + res.status);
const rows = await parquetReadObjects({ file: await res.arrayBuffer(), columns: COLS, compressors });
const cell = v => {
  const s = v == null ? 'NA' : typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
fs.writeFileSync(path.join(ROOT, 'data_cache', 'historical_contracts.csv'), COLS.join(',') + '\n' + rows.map(r => COLS.map(c => cell(r[c])).join(',')).join('\n') + '\n');
const last = Math.max(...rows.map(r => +r.year_signed || 0));
console.log(`historical_contracts.csv: ${rows.length} contracts, signed through ${last}`);
