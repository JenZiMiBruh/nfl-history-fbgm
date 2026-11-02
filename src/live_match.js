/**
 * live_match.js - shared by the live update and the box-score builder: matches an nflverse weekly stat row to a
 * player in the master, and turns the row into a Football GM stat line.
 */
const norm = s => String(s || '').toLowerCase().replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').replace(/[^a-z]/g, '');
const num = v => +v || 0;

function makeFinder(m, SEASON) {
  const byName = new Map();
  for (const p of m.players) { if (p.tid < -1) continue; const k = norm(`${p.firstName} ${p.lastName}`); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
  const byLast = new Map();
  for (const p of m.players) { if (p.tid < -1) continue; const k = norm(p.lastName); if (!byLast.has(k)) byLast.set(k, []); byLast.get(k).push(p); }
  const active = p => (p.stats || []).some(s => s.season >= SEASON - 2);
  const find = (r, tid) => {
    const c = (byName.get(norm(r.player_display_name)) || []).filter(active);
    if (c.length) return c.sort((x, y) => (y.tid === tid) - (x.tid === tid))[0];
    // nicknames and suffixes (Pat Surtain II, Daxton/Dax Hill): same team, same last name, same first initial
    const parts = String(r.player_display_name).replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' ');
    const last = (byLast.get(norm(parts.slice(-1)[0])) || []).filter(active);
    const onTeam = last.filter(p => p.tid === tid);
    if (onTeam.length === 1) return onTeam[0];
    // anywhere in the league (a player the last build couldn't place): same last name and first initial, one match only
    const initial = (onTeam.length ? onTeam : last).filter(p => String(p.firstName)[0].toLowerCase() === parts[0][0].toLowerCase());
    return initial.length === 1 ? initial[0] : null;
  };
  return find;
}

const ADD = {
  pssCmp: 'completions', pss: 'attempts', pssYds: 'passing_yards', pssTD: 'passing_tds', pssInt: 'passing_interceptions', pssSk: 'sacks_suffered', pssSkYds: 'sack_yards_lost',
  rus: 'carries', rusYds: 'rushing_yards', rusTD: 'rushing_tds', rec: 'receptions', tgt: 'targets', recYds: 'receiving_yards', recTD: 'receiving_tds',
  fmb: 'fumbles_total', fmbLost: 'fumbles_lost_total', defTckSolo: 'def_tackles_solo', defTckLoss: 'def_tackles_for_loss', defSk: 'def_sacks',
  defInt: 'def_interceptions', defIntYds: 'def_interception_yards', defPssDef: 'def_pass_defended', defFmbFrc: 'def_fumbles_forced', defSft: 'def_safeties',
  defFmbRec: 'fumble_recovery_opp', pr: 'punt_returns', prYds: 'punt_return_yards', kr: 'kickoff_returns', krYds: 'kickoff_return_yards',
  xp: 'pat_made', xpa: 'pat_att', pnt: 'pt_att', pntYds: 'pt_yards', pntIn20: 'pt_inside_20', pntTB: 'pt_touchback',
};
const FG = [['fg0', '0_19'], ['fg20', '20_29'], ['fg30', '30_39'], ['fg40', '40_49'], ['fg50', '50_59']];

function statLine(r) {
  const line = {};
  for (const [k, col] of Object.entries(ADD)) line[k] = num(r[col]);
  line.defTckAst = num(r.def_tackle_assists) + num(r.def_tackles_with_assist);
  for (const [k, band] of FG) {
    const made = num(r[`fg_made_${band}`]) + (k === 'fg50' ? num(r.fg_made_60_) : 0);
    const missed = num(r[`fg_missed_${band}`]) + (k === 'fg50' ? num(r.fg_missed_60_) : 0);
    line[k] = made; line['fga' + k.slice(2)] = made + missed;
  }
  return line;
}

module.exports = { norm, num, makeFinder, statLine, ADD, FG };
