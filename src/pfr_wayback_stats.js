/**
 * pfr_wayback_stats.js - parses archived Pro-Football-Reference season stat pages
 * (data_cache/pfr_wayback/<season>_<category>.html) into Football GM stat fields.
 *
 * loadPfrSeasons() -> Map key `${season}|${playoffs}|${pfrId}|${team}` ->
 *   { season, playoffs, pfrId, name, age, pos, team, stats: {...} }
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data_cache', 'pfr_wayback');

const COLS = {
  games: 'gp', games_started: 'gs',
  pass_cmp: 'pssCmp', pass_att: 'pss', pass_yds: 'pssYds', pass_td: 'pssTD', pass_int: 'pssInt', pass_long: 'pssLng',
  pass_sacked: 'pssSk', pass_sacked_yds: 'pssSkYds',
  rush_att: 'rus', rush_yds: 'rusYds', rush_td: 'rusTD', rush_long: 'rusLng',
  targets: 'tgt', rec: 'rec', rec_yds: 'recYds', rec_td: 'recTD', rec_long: 'recLng',
  def_int: 'defInt', def_int_yds: 'defIntYds', def_int_td: 'defIntTD', def_int_long: 'defIntLng', pass_defended: 'defPssDef',
  fumbles_forced: 'defFmbFrc', fumbles_rec: 'defFmbRec', fumbles_rec_yds: 'defFmbYds', fumbles_rec_td: 'defFmbTD',
  sacks: 'defSk', safety_md: 'defSft', tackles_solo: 'defTckSolo', tackles_assists: 'defTckAst', tackles_loss: 'defTckLoss',
  fga1: 'fga0', fgm1: 'fg0', fga2: 'fga20', fgm2: 'fg20', fga3: 'fga30', fgm3: 'fg30', fga4: 'fga40', fgm4: 'fg40', fga5: 'fga50', fgm5: 'fg50',
  fg_long: 'fgLng', xpa: 'xpa', xpm: 'xp', kickoff: 'ko', kickoff_yds: 'koYds', kickoff_tb: 'koTB',
  punt: 'pnt', punt_yds: 'pntYds', punt_long: 'pntLng', punt_blocked: 'pntBlk', punt_tb: 'pntTB', punt_in_20: 'pntIn20',
  kick_ret: 'kr', kick_ret_yds: 'krYds', kick_ret_td: 'krTD', kick_ret_long: 'krLng',
  punt_ret: 'pr', punt_ret_yds: 'prYds', punt_ret_td: 'prTD', punt_ret_long: 'prLng'
};

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/[*+]/g, '').trim();
const toNum = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : undefined; };

function parsePage(html, category) {
  const out = [];
  const src = html.replace(/<!--/g, '').replace(/-->/g, '');
  const tableRe = /<table[^>]*id="([a-z_]+)"[^>]*>([\s\S]*?)<\/table>/g;
  let t;
  while ((t = tableRe.exec(src))) {
    const id = t[1];
    if (id !== category && id !== `${category}_post`) continue;
    const playoffs = id.endsWith('_post');
    // Older snapshots omit the closing </tbody>.
    const body = (t[2].split(/<tbody[^>]*>/)[1] || '').split('</tbody>')[0];
    for (const tr of body.split(/<\/tr>/)) {
      if (/class="[^"]*thead/.test(tr)) continue;
      const cells = {};
      let pfrId = (tr.match(/data-append-csv="([^"]+)"/) || [])[1];
      const cellRe = /<(?:td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:td|th)>/g;
      let c;
      while ((c = cellRe.exec(tr))) cells[c[1]] = c[2];
      // Older snapshot layout uses different column names.
      for (const [o, n] of [['player', 'name_display'], ['team', 'team_name_abbr'], ['g', 'games'], ['gs', 'games_started']]) if (cells[o] !== undefined && cells[n] === undefined) cells[n] = cells[o];
      if (!pfrId && cells.name_display) pfrId = (cells.name_display.match(/\/players\/[A-Z]\/([A-Za-z0-9.]+)\.htm/) || [])[1];
      const name = cells.name_display ? strip(cells.name_display) : '';
      const team = cells.team_name_abbr ? strip(cells.team_name_abbr) : '';
      if (!name || !team || /^\dTM$/.test(team) || /league/i.test(name)) continue;
      const stats = {};
      for (const [k, v] of Object.entries(cells)) {
        const key = COLS[k];
        const n = toNum(strip(v));
        if (key && n !== undefined) stats[key] = n;
      }
      if (cells.qb_rec) {
        const m = strip(cells.qb_rec).match(/^(\d+)-(\d+)-(\d+)$/);
        if (m) { stats.qbW = +m[1]; stats.qbL = +m[2]; stats.qbT = +m[3]; }
      }
      // Older seasons list only total field goals: put them in the middle distance bucket.
      if (category === 'kicking' && stats.fga0 === undefined && stats.fga20 === undefined) {
        const fga = toNum(strip(cells.fga || '')), fgm = toNum(strip(cells.fgm || ''));
        if (fga !== undefined) { stats.fga30 = fga; stats.fg30 = fgm || 0; }
      }
      if (category === 'defense' && stats.defTckSolo === undefined && cells.tackles_combined) {
        const tc = toNum(strip(cells.tackles_combined));
        if (tc !== undefined) stats.defTckSolo = tc;
      }
      out.push({ playoffs, pfrId: pfrId || name, name, age: toNum(strip(cells.age || '')), pos: strip(cells.pos || ''), team, stats });
    }
  }
  return out;
}

function loadPfrSeasons() {
  const merged = new Map();
  if (!fs.existsSync(DIR)) return merged;
  for (const f of fs.readdirSync(DIR)) {
    const m = f.match(/^(\d{4})(?:AFL)?_([a-z]+)\.html$/);
    if (!m) continue;
    const season = +m[1];
    for (const r of parsePage(fs.readFileSync(path.join(DIR, f), 'utf8'), m[2])) {
      const k = `${season}|${r.playoffs}|${r.pfrId}|${r.team}`;
      if (!merged.has(k)) merged.set(k, { season, playoffs: r.playoffs, pfrId: r.pfrId, name: r.name, age: r.age, pos: r.pos, team: r.team, stats: {} });
      const e = merged.get(k);
      if (!e.pos && r.pos) e.pos = r.pos;
      for (const [kk, v] of Object.entries(r.stats)) {
        if (kk === 'gp' || kk === 'gs') e.stats[kk] = Math.max(e.stats[kk] || 0, v);
        else if (e.stats[kk] === undefined) e.stats[kk] = v;
      }
    }
  }
  return merged;
}

module.exports = { loadPfrSeasons, parsePage };
