/**
 * wiki_player_stats.js - parses the regular-season "career statistics" wikitables of a
 * Wikipedia player article into per-season Football GM stat fields.
 *
 * parseCareerStats(wikitext) -> [{ season, team, stats: { gp, gs, pss, pssYds, ... } }]
 */

// Wikitable cell -> plain text.
function cellText(c) {
  let s = c;
  const bar = s.match(/^\s*(?:(?:style|class|rowspan|colspan|align|bgcolor|data-sort-value)\s*=\s*("[^"]*"|[^|\s]*)\s*)+\|(?!\|)/i);
  if (bar) s = s.slice(bar[0].length);
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/\{\{abbr\|([^|}]*)\|[^}]*\}\}/gi, '$1');
  s = s.replace(/\{\{(?:nowrap|small|sort|sortname)\|([^}]*)\}\}/gi, (m, x) => x.split('|').pop());
  s = s.replace(/\{\{[^}]*\}\}/g, '');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/[*†‡^#]/g, '');
  return s.trim();
}
const spanOf = (c, k) => { const m = c.match(new RegExp(k + '\\s*=\\s*"?(\\d+)', 'i')); return m ? parseInt(m[1], 10) : 1; };
const toNum = (s) => {
  if (s === undefined) return undefined;
  const t = String(s).replace(/,/g, '').replace(/[−–—]/g, '-').replace(/t$/i, '').trim();
  if (t === '' || t === '-' || /^-+$/.test(t)) return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
};

// (group, label) -> FBGM stat key
function mapColumn(group, label) {
  const g = group.toLowerCase(), l = label.toLowerCase().replace(/\s+/g, '');
  if (/^gp$|^g$|^games$/.test(l) && (g === '' || /game/.test(g))) return 'gp';
  if (/^gs$/.test(l)) return 'gs';
  if (/pass/.test(g)) return { cmp: 'pssCmp', comp: 'pssCmp', att: 'pss', yds: 'pssYds', td: 'pssTD', int: 'pssInt', lng: 'pssLng', sck: 'pssSk', sk: 'pssSk', sacked: 'pssSk', sckyds: 'pssSkYds', ydslost: 'pssSkYds' }[l];
  if (/rush/.test(g)) return { att: 'rus', car: 'rus', yds: 'rusYds', td: 'rusTD', lng: 'rusLng' }[l];
  if (/receiv/.test(g)) return { rec: 'rec', tgt: 'tgt', yds: 'recYds', td: 'recTD', lng: 'recLng' }[l];
  if (/kick\s*ret|kickoff\s*ret/.test(g)) return { ret: 'kr', att: 'kr', no: 'kr', kr: 'kr', yds: 'krYds', td: 'krTD', lng: 'krLng' }[l];
  if (/punt\s*ret/.test(g)) return { ret: 'pr', att: 'pr', no: 'pr', pr: 'pr', yds: 'prYds', td: 'prTD', lng: 'prLng' }[l];
  if (/intercept/.test(g)) return { int: 'defInt', yds: 'defIntYds', td: 'defIntTD', lng: 'defIntLng', pd: 'defPssDef' }[l];
  if (/fumble/.test(g)) return { fum: 'fmb', fmb: 'fmb', lost: 'fmbLost', ff: 'defFmbFrc', fr: 'defFmbRec', yds: 'defFmbYds', td: 'defFmbTD' }[l];
  if (/tackl|defen/.test(g)) return { solo: 'defTckSolo', ast: 'defTckAst', sck: 'defSk', sacks: 'defSk', sk: 'defSk', ff: 'defFmbFrc', fr: 'defFmbRec', pd: 'defPssDef', int: 'defInt', sfty: 'defSft', tfl: 'defTckLoss' }[l];
  if (/^sacks?$|^sck$/.test(l) && g === '') return 'defSk';
  if (/field\s*goal|kicking|^fg/.test(g)) return { fgm: '_fgm', fga: '_fga', lng: 'fgLng', xpm: 'xp', xpa: 'xpa' }[l];
  if (/extra|^pat|^xp/.test(g)) return { xpm: 'xp', xpa: 'xpa', m: 'xp', a: 'xpa', made: 'xp', att: 'xpa' }[l];
  if (/punt/.test(g)) return { punts: 'pnt', pnt: 'pnt', no: 'pnt', att: 'pnt', yds: 'pntYds', lng: 'pntLng', in20: 'pntIn20', tb: 'pntTB', blk: 'pntBlk' }[l];
  if (g === '') return { fgm: '_fgm', fga: '_fga', xpm: 'xp', xpa: 'xpa', int: 'defInt' }[l];
  return undefined;
}

function parseTable(lines) {
  // Header rows: build a grid honoring rowspan/colspan.
  const headerRows = [];
  const dataRows = [];
  let cur = null;
  // Only the leading all-"!" rows are headers; a trailing all-"!" totals row is data.
  const push = (row) => { (row.header && !dataRows.length ? headerRows : dataRows).push(row); };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|-')) { if (cur) push(cur); cur = null; continue; }
    if (line.startsWith('!') || line.startsWith('|')) {
      if (!cur) cur = { header: true, cells: [] };
      const isHead = line.startsWith('!');
      const parts = line.slice(1).split(isHead ? /!!|\|\|/ : /\|\|/);
      for (const p of parts) cur.cells.push({ head: isHead, raw: p });
      if (!isHead) cur.header = false;
    }
  }
  if (cur) push(cur);
  if (!headerRows.length) return [];
  const grid = [];
  headerRows.forEach((row, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const cell of row.cells) {
      while (grid[r][c] !== undefined) c++;
      const cs = spanOf(cell.raw, 'colspan'), rs = spanOf(cell.raw, 'rowspan');
      const txt = cellText(cell.raw);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        grid[r + dr] = grid[r + dr] || [];
        grid[r + dr][c + dc] = { txt, top: dr === 0, span: cs };
      }
      c += cs;
    }
  });
  const width = Math.max(...grid.map(r => r.length));
  const cols = [];
  for (let c = 0; c < width; c++) {
    const parts = grid.map(r => r[c]).filter(Boolean);
    const label = parts.length ? parts[parts.length - 1].txt : '';
    const group = parts.length > 1 && parts[0].span > 1 ? parts[0].txt : (parts.length > 1 ? parts[0].txt : '');
    cols.push({ group: group === label ? '' : group, label });
  }
  const yearCol = cols.findIndex(c => /^(year|season)$/i.test(c.label));
  const teamCol = cols.findIndex(c => /^(team|tm|club)$/i.test(c.label));
  if (yearCol < 0) return [];
  const out = [];
  for (const row of dataRows) {
    const vals = row.cells.map(c => cellText(c.raw));
    const season = parseInt(vals[yearCol], 10);
    if (!(season >= 1940 && season <= 2030)) continue;
    const stats = {};
    cols.forEach((col, i) => {
      const key = mapColumn(col.group, col.label);
      const v = toNum(vals[i]);
      if (key && v !== undefined && stats[key] === undefined) stats[key] = v;
    });
    out.push({ season, team: teamCol >= 0 ? vals[teamCol] : '', stats });
  }
  return out;
}

function parseCareerStats(wt) {
  if (!wt) return [];
  const start = wt.search(/==+\s*(NFL\s+|AFL\s+|Professional\s+)?(career\s+)?statistics\s*==+|==+\s*(NFL|AFL|Pro)\s+career\s+stat/i);
  if (start < 0) return [];
  let body = wt.slice(start);
  const next = body.slice(3).search(/\n==[^=]/);
  if (next >= 0) body = body.slice(0, next + 3);
  // Drop postseason sections.
  body = body.replace(/===+\s*(post\s*season|playoffs?)[\s\S]*?(?=\n===|\n==[^=]|$)/gi, '');
  const rows = [];
  const re = /\{\|[\s\S]*?\n\|\}/g;
  let m;
  while ((m = re.exec(body))) rows.push(...parseTable(m[0].split('\n').slice(1, -1)));
  // Merge rows from separate tables (e.g. passing table + rushing table) by season+team.
  const merged = new Map();
  for (const r of rows) {
    const k = `${r.season}|${r.team}`;
    if (!merged.has(k)) merged.set(k, { season: r.season, team: r.team, stats: {} });
    const s = merged.get(k).stats;
    for (const [kk, v] of Object.entries(r.stats)) if (s[kk] === undefined) s[kk] = v;
  }
  for (const r of merged.values()) {
    if (r.stats._fgm !== undefined) { r.stats.fg30 = r.stats._fgm; r.stats.fga30 = r.stats._fga || r.stats._fgm; }
    delete r.stats._fgm; delete r.stats._fga;
  }
  return [...merged.values()].filter(r => Object.keys(r.stats).length > 1);
}

module.exports = { parseCareerStats };
