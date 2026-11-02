/**
 * pfr_pages.js - parses archived Pro-Football-Reference roster, draft and team pages
 * (data_cache/pfr_wayback/{rosters,draft,teams}).
 *   loadRosters() -> [{ season, code, pfrId, name, number, age, pos, g, gs, hgt, weight, college, born, av }]
 *   loadDrafts()  -> [{ year, league, round, overall, code, pfrId, name, pos, college }]
 *   loadTeamStats() -> Map `${season}|${code}` -> { team: {...}, opp: {...} }
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'data_cache', 'pfr_wayback');
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/[*+]/g, '').trim();
const toNum = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : undefined; };

function tableRows(html, id) {
  const src = html.replace(/<!--/g, '').replace(/-->/g, '');
  const m = src.match(new RegExp(`<table[^>]*id="${id}"[^>]*>([\\s\\S]*?)</table>`));
  if (!m) return [];
  const body = (m[1].split(/<tbody[^>]*>/)[1] || '').split('</tbody>')[0];
  const rows = [];
  for (const tr of body.split(/<\/tr>/)) {
    if (/class="[^"]*thead/.test(tr)) continue;
    const cells = {};
    const re = /<(?:td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:td|th)>/g;
    let c;
    while ((c = re.exec(tr))) cells[c[1]] = c[2];
    const id2 = (tr.match(/data-append-csv="([^"]+)"/) || [])[1] || ((cells.player || '').match(/\/players\/[A-Z]\/([A-Za-z0-9.]+)\.htm/) || [])[1];
    if (Object.keys(cells).length) rows.push({ cells, pfrId: id2 });
  }
  return rows;
}

function loadRosters() {
  const dir = path.join(BASE, 'rosters');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{4})_([a-z]{3})\.html$/);
    if (!m) continue;
    for (const { cells, pfrId } of tableRows(fs.readFileSync(path.join(dir, f), 'utf8'), 'roster')) {
      const name = strip(cells.player);
      if (!name || name === 'Player') continue;
      const h = strip(cells.height).match(/^(\d+)-(\d+)$/);
      const bd = strip(cells.birth_date_mod).match(/(\d+)\/(\d+)\/(\d{4})/);
      out.push({
        season: +m[1], code: m[2], pfrId: pfrId || name, name, number: strip(cells.uniform_number), age: toNum(strip(cells.age)),
        pos: strip(cells.pos), g: toNum(strip(cells.g)), gs: toNum(strip(cells.gs)), hgt: h ? +h[1] * 12 + +h[2] : undefined,
        weight: toNum(strip(cells.weight)), college: strip(cells.college_id), born: bd ? +bd[3] : undefined, av: toNum(strip(cells.av))
      });
    }
  }
  return out;
}

function loadDrafts() {
  const dir = path.join(BASE, 'draft');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{4})(AFL)?\.html$/);
    if (!m) continue;
    for (const { cells, pfrId } of tableRows(fs.readFileSync(path.join(dir, f), 'utf8'), 'drafts')) {
      const name = strip(cells.player).replace(/\s+HOF$/, '');
      const round = toNum(strip(cells.draft_round)), overall = toNum(strip(cells.draft_pick));
      if (!name || !round) continue;
      out.push({ year: +m[1], league: m[2] ? 'AFL' : 'NFL', round, overall, code: strip(cells.team), pfrId: pfrId || name, name,
        pos: strip(cells.pos), college: strip(cells.college_id) });
    }
  }
  return out;
}

// Team page "team_stats" table: one row for the team, one for opponents.
const TEAM_COLS = { points: 'pts', pass_cmp: 'pssCmp', pass_att: 'pss', pass_yds: 'pssYds', pass_td: 'pssTD', pass_int: 'pssInt',
  rush_att: 'rus', rush_yds: 'rusYds', rush_td: 'rusTD', fumbles_lost: 'fmbLost', penalties: 'pen', penalties_yds: 'penYds',
  pass_sacked: 'pssSk', pass_sacked_yds: 'pssSkYds' };
function loadTeamStats() {
  const dir = path.join(BASE, 'teams');
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{4})_([a-z]{3})\.html$/);
    if (!m) continue;
    const res = {};
    for (const { cells } of tableRows(fs.readFileSync(path.join(dir, f), 'utf8'), 'team_stats')) {
      const who = strip(cells.player);
      const key = /opp/i.test(who) ? 'opp' : /team/i.test(who) ? 'team' : null;
      if (!key) continue;
      const o = {};
      for (const [k, v] of Object.entries(cells)) if (TEAM_COLS[k]) { const n = toNum(strip(v)); if (n !== undefined) o[TEAM_COLS[k]] = n; }
      res[key] = o;
    }
    if (res.team || res.opp) out.set(`${m[1]}|${m[2]}`, res);
  }
  return out;
}

module.exports = { loadRosters, loadDrafts, loadTeamStats };
