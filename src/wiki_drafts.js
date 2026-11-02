/**
 * Parses Wikipedia "YYYY NFL draft" / "YYYY AFL draft" wikitext (data_cache/drafts)
 * into { year, league, round, pick, team, name, pos, college } rows.
 */
const fs = require('fs');
const path = require('path');

const DRAFT_DIR = path.join(__dirname, '..', 'data_cache', 'drafts');

function linkText(s) {
  // [[Target|Label]] -> Label, [[Target]] -> Target
  return s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
}

function cleanCell(c) {
  let s = c;
  // Drop leading cell attributes: `style="..."|value` or `bgcolor=#fff|value`
  const attr = s.match(/^\s*(?:[a-z-]+\s*=\s*("[^"]*"|[^|\s]*)\s*)+\|(?!\|)/i);
  if (attr && !s.trim().startsWith('[[')) s = s.slice(attr[0].length);
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>.*?<\/ref>/g, '');
  s = s.replace(/\{\{sortname\|([^|}]*)\|([^|}]*)(\|[^}]*)?\}\}/gi, '$1 $2');
  s = s.replace(/\{\{(?:sort|sortname|nowrap|nfl\s*team|cfb\s*link)[^|}]*\|([^}]*)\}\}/gi, (m, inner) => inner.split('|').pop());
  s = s.replace(/\{\{[^}]*\}\}/g, '');
  s = linkText(s);
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/[*†‡^#§¤]/g, '');
  return s.trim();
}

// Newer pages: {{NFLDraft-row|round=1|picknum=1|team=...|first=Earl|last=Campbell|position=...|college=...}}
function parseDraftRowTemplates(wt, year, league) {
  const rows = [];
  const re = /\{\{\s*NFLDraft-row([\s\S]*?)\}\}\s*(?=\n|$)/g;
  let m;
  while ((m = re.exec(wt))) {
    const body = m[1].replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
    const f = {};
    for (const part of body.split('|')) {
      const eq = part.indexOf('=');
      if (eq > 0) f[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    }
    const name = [f.first, f.last].filter(Boolean).join(' ') || cleanCell(f.player || '');
    if (!name || !f.team) continue;
    rows.push({ year, league, round: parseInt(f.round, 10) || 0, pick: parseInt(f.picknum, 10) || 0, team: cleanCell(f.team),
      name, pos: cleanCell(f.position || ''), college: cleanCell(f.collegelink || f.college || '') });
  }
  return rows;
}

function parseDraftWikitext(wt, year, league) {
  const tpl = parseDraftRowTemplates(wt, year, league);
  const rows = [];
  const lines = wt.split('\n');
  let header = null;
  let round = null;
  let cells = [];
  const flush = () => {
    if (!header || cells.length < 3) { cells = []; return; }
    const get = (k) => (header[k] !== undefined ? cells[header[k]] : undefined);
    const name = get('player');
    const team = get('team');
    if (!name || !team || /^\d+$/.test(name)) { cells = []; return; }
    const pickRaw = get('pick');
    const rndRaw = get('round');
    const r = parseInt(rndRaw, 10) || round;
    const pick = parseInt(pickRaw, 10) || 0;
    if (r) rows.push({ year, league, round: r, pick, team, name: name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), pos: get('pos') || '', college: get('college') || '' });
    cells = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const rm = line.match(/^=+\s*Round\s+(\d+)/i);
    if (rm) { flush(); round = parseInt(rm[1], 10); continue; }
    if (line.startsWith('{|')) { flush(); header = null; continue; }
    if (line.startsWith('|}')) { flush(); continue; }
    if (line.startsWith('!')) {
      const hs = line.replace(/^!/, '').split(/!!|\|\|/).map(h => cleanCell(h.includes('|') && !h.includes('[[') ? h.split('|').pop() : h).toLowerCase());
      const h = header && header._building ? header : { _building: true, _n: 0 };
      for (const x of hs) {
        const i = h._n++;
        if (/rnd|round/.test(x) && h.round === undefined) h.round = i;
        else if (/pick|overall|no\.|#/.test(x) && h.pick === undefined) h.pick = i;
        else if (/team|club/.test(x) && h.team === undefined) h.team = i;
        else if (/player|name/.test(x) && h.player === undefined) h.player = i;
        else if (/pos/.test(x) && h.pos === undefined) h.pos = i;
        else if (/college|school/.test(x) && h.college === undefined) h.college = i;
      }
      header = h;
      continue;
    }
    if (line.startsWith('|-')) { flush(); if (header) header._building = false; continue; }
    if (line.startsWith('|') && header) {
      header._building = false;
      for (const c of line.slice(1).split('||')) cells.push(cleanCell(c));
    }
  }
  flush();
  return tpl.length > rows.length ? tpl : rows;
}

function loadWikiDrafts() {
  const out = [];
  if (!fs.existsSync(DRAFT_DIR)) return out;
  for (const f of fs.readdirSync(DRAFT_DIR)) {
    const m = f.match(/^wiki_(\d{4})_(NFL|AFL)_draft\.json$/);
    if (!m) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, f), 'utf8')); } catch (e) { continue; }
    const wt = j && j.parse && j.parse.wikitext && j.parse.wikitext['*'];
    if (!wt) continue;
    out.push(...parseDraftWikitext(wt, parseInt(m[1], 10), m[2]));
  }
  return out;
}

module.exports = { loadWikiDrafts, parseDraftWikitext };
