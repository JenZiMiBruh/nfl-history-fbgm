/**
 * live_match.js - shared by the live update and the box-score builder: matches an nflverse weekly stat row to a
 * player in the master, and turns the row into a Football GM stat line.
 */
// accents come off first (Audric Estimé is Estime in the master)
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').replace(/[^a-z]/g, '');
const num = v => +v || 0;

function makeFinder(m, SEASON) {
  const byName = new Map();
  for (const p of m.players) { if (p.tid < -1) continue; const k = norm(`${p.firstName} ${p.lastName}`); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
  const byLast = new Map();
  for (const p of m.players) { if (p.tid < -1) continue; const k = norm(p.lastName); if (!byLast.has(k)) byLast.set(k, []); byLast.get(k).push(p); }
  // recent stats, or rated for this season or last (a rookie on injured reserve who hasn't played yet)
  const active = p => (p.stats || []).some(s => s.season >= SEASON - 2) || (p.ratings || []).some(r => r.season >= SEASON - 1);
  // Two current players can share a name and birth year (Spencer Brown the Bills tackle and Spencer Brown the running
  // back; Michael Carter the safety and the running back). Preferring whoever is already on that team kept a wrong
  // match forever, so the source row's college, position and birth year decide first.
  const GROUP = { QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', T: 'OL', G: 'OL', C: 'OL', OT: 'OL', OG: 'OL', OL: 'OL', IOL: 'OL',
    DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB', CB: 'CB', DB: 'CB', S: 'S', SS: 'S', FS: 'S', SAF: 'S', K: 'K', PK: 'K', P: 'P' };
  const score = (p, r, tid) => {
    let s = 0;
    if (r.college && p.college && norm(r.college) === norm(p.college)) s += 4;
    const g = GROUP[String(r.position || r.depth_chart_position || '').toUpperCase()];
    const mine = (p.ratings || []).length ? p.ratings[p.ratings.length - 1].pos : p.pos;
    if (g && mine && (g === mine || (g === 'CB' && mine === 'S') || (g === 'S' && mine === 'CB') || (g === 'DL' && mine === 'LB'))) s += 3;
    const by = +(String(r.birth_date || '').slice(0, 4));
    if (by && p.born && p.born.year === by) s += 1;
    if ((p.stats || []).some(st => st.season === SEASON && st.tid === tid)) s += 1;
    if (p.tid === tid) s += 0.5;
    return s;
  };
  const find = (r, tid) => {
    const c = (byName.get(norm(r.player_display_name)) || []).filter(active);
    if (c.length) return c.length === 1 ? c[0] : c.slice().sort((x, y) => score(y, r, tid) - score(x, r, tid))[0];
    // nicknames and suffixes (Pat Surtain II, Daxton/Dax Hill): same team, same last name, same first initial
    const parts = String(r.player_display_name).replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' ');
    // (the first initial always has to match: "Chris Brooks" on the Packers is Christopher Brooks, not Karl Brooks)
    const last = (byLast.get(norm(parts.slice(-1)[0])) || []).filter(active)
      .filter(p => String(p.firstName)[0].toLowerCase() === parts[0][0].toLowerCase());
    const onTeam = last.filter(p => p.tid === tid || (p.stats || []).some(st => st.season === SEASON && st.tid === tid));
    if (onTeam.length === 1) return onTeam[0];
    if (onTeam.length > 1) return onTeam.slice().sort((x, y) => score(y, r, tid) - score(x, r, tid))[0];
    // anywhere in the league (a player the last build couldn't place): one match only
    if (last.length === 1) return last[0];
    // a nickname with a different first letter (Sauce Gardner is Ahmad, Riq Woolen is Tariq): the one player with that
    // last name on the team, or among several, the one from the same college
    const sameLast = (byLast.get(norm(parts.slice(-1)[0])) || []).filter(active)
      .filter(p => p.tid === tid || (p.stats || []).some(st => st.season === SEASON && st.tid === tid));
    if (sameLast.length === 1) return sameLast[0];
    const college = sameLast.filter(p => r.college && p.college && norm(r.college) === norm(p.college));
    return college.length === 1 ? college[0] : null;
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
