/**
 * rebuild_ratings.js - rebuilds every player's ratings, 1966-2026, from his real stats, in one consistent pass.
 * Replaces the older pipeline (Madden conversion for 2001+, value-score templates before that, then rescale and
 * receiver fixes).
 *
 * For each player-season:
 *  1. How good: an overall from Approximate Value per game (shrunk toward the position average for short seasons),
 *     ranked within his position that season, smoothed with the seasons around it, with honors as floors
 *     (MVP, Player of the Year, All-Pro, Pro Bowl), mapped onto a curve that leaves room at the top for stars.
 *     Seasons without a value score use the rank of his previous rating.
 *  2. What kind of player: each skill rating comes from his own stats compared with his position that season
 *     (yards per carry, catch rate, interceptions + passes defended, completion %, ...), also smoothed.
 *  3. The two are joined by shifting his skill ratings together until his overall at his position matches step 1,
 *     so his strengths and weaknesses stay. Off-position skills sit at the position's typical (low) level.
 * Height is kept (it comes from real heights); strength follows real weight.
 *
 * Usage: node --max-old-space-size=14000 src/rebuild_ratings.js   (backs up the master to _old/ first)
 */
const fs = require('fs');
const path = require('path');
const R = require('./ratings_engine');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'NFL_Master_1966_2026.json');
const KEYS = ['stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];
const MAIN = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

// Percentile within position-season -> overall. Stars get real separation from average starters.
const CURVE = [[0, 28], [0.2, 38], [0.5, 47], [0.75, 56], [0.9, 65], [0.96, 72], [0.985, 78], [0.995, 83], [1, 88]];
const curve = (p) => {
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, o1] = CURVE[i];
    if (p <= p1) { const [p0, o0] = CURVE[i - 1]; return o0 + (o1 - o0) * (p - p0) / (p1 - p0); }
  }
  return CURVE[CURVE.length - 1][1];
};
const SPREAD = 9; // rating points per standard deviation of a stat

// ---- stat drivers: per position, which stats drive which skill ratings ([value, volume], sign via weight)
const per = (a, b) => (b > 0 ? a / b : undefined);
const DRIVERS = {
  QB: (s) => ({
    cmpPct: [per(s.pssCmp, s.pss), s.pss], intPct: [per(s.pssInt, s.pss), s.pss], tdPct: [per(s.pssTD, s.pss), s.pss],
    ypa: [per(s.pssYds, s.pss), s.pss], ypc: [per(s.pssYds, s.pssCmp), s.pssCmp], skPct: [per(s.pssSk, s.pss + s.pssSk), s.pss],
    rushPg: [per(s.rusYds, s.gp), s.gp], fmbPt: [s.fmbData ? per(s.fmb, s.pss + s.rus) : undefined, s.pss]
  }),
  RB: (s) => ({
    ypc: [per(s.rusYds, s.rus), s.rus], rushPg: [per(s.rusYds, s.gp), s.gp], tdRate: [per(s.rusTD, s.rus), s.rus],
    recPg: [per(s.rec, s.gp), s.gp], catchPct: [per(s.rec, s.tgt), s.tgt], fmbPt: [s.fmbData ? per(s.fmb, s.rus + s.rec) : undefined, s.rus]
  }),
  WR: (s) => ({
    recPg: [per(s.rec, s.gp), s.gp], ydsPg: [per(s.recYds, s.gp), s.gp], ypr: [per(s.recYds, s.rec), s.rec],
    catchPct: [per(s.rec, s.tgt), s.tgt], tdPg: [per(s.recTD, s.gp), s.gp], fmbPt: [s.fmbData ? per(s.fmb, s.rec + s.rus) : undefined, s.rec]
  }),
  DL: (s) => ({ skPg: [per(s.defSk, s.gp), s.gp], tckPg: [s.tckData ? per(s.tck, s.gp) : undefined, s.gp], ffPg: [per(s.defFmbFrc, s.gp), s.gp] }),
  LB: (s) => ({ skPg: [per(s.defSk, s.gp), s.gp], tckPg: [s.tckData ? per(s.tck, s.gp) : undefined, s.gp], covPg: [per(s.cov, s.gp), s.gp] }),
  CB: (s) => ({ covPg: [per(s.cov, s.gp), s.gp], tckPg: [s.tckData ? per(s.tck, s.gp) : undefined, s.gp] }),
  K: (s) => ({ fgPct: [per(s.fg, s.fga), s.fga], longPct: [per(s.fg50, s.fga50), s.fga50], longPg: [per(s.fg50, s.gp), s.gp], xpPct: [per(s.xp, s.xpa), s.xpa] }),
  P: (s) => ({ ypp: [per(s.pntYds, s.pnt), s.pnt], in20: [per(s.pntIn20, s.pnt), s.pnt] })
};
DRIVERS.TE = DRIVERS.WR;
DRIVERS.S = DRIVERS.CB;
// Volume a stat needs to count fully (and to be in the season's average)
const QUAL = { QB: 150, RB: 60, WR: 20, TE: 20, DL: 8, LB: 8, CB: 8, S: 8, K: 10, P: 20 };
const QUAL_BY_DRIVER = { catchPct: 30, ypr: 15, longPct: 3, xpPct: 10, ypc: 50 };
// skill rating -> [driver, weight]
const SKILLS = {
  QB: { tha: [['cmpPct', 2], ['intPct', -1]], thp: [['ypa', 1], ['ypc', 1]], thv: [['tdPct', 1], ['intPct', -1], ['skPct', -1]], elu: [['rushPg', 1]], spd: [['rushPg', 0.7]], bsc: [['fmbPt', -1]] },
  RB: { spd: [['ypc', 1], ['rushPg', 0.5]], elu: [['ypc', 1], ['rushPg', 1]], stre: [['tdRate', 1]], bsc: [['fmbPt', -1]], hnd: [['catchPct', 1], ['recPg', 1]], rtr: [['recPg', 1]] },
  WR: { hnd: [['catchPct', 1.5], ['recPg', 0.5]], rtr: [['recPg', 1], ['ydsPg', 1]], spd: [['ypr', 1], ['tdPg', 0.3]], elu: [['ypr', 0.5]], bsc: [['fmbPt', -1]] },
  DL: { prs: [['skPg', 2], ['ffPg', 0.5]], rns: [['tckPg', 1]], tck: [['tckPg', 1]] },
  LB: { tck: [['tckPg', 2]], rns: [['tckPg', 1]], prs: [['skPg', 1]], pcv: [['covPg', 1]] },
  CB: { pcv: [['covPg', 2]], tck: [['tckPg', 0.5]], spd: [['covPg', 0.5]] },
  S: { pcv: [['covPg', 1.5]], tck: [['tckPg', 1]], spd: [['covPg', 0.3]] },
  K: { kac: [['fgPct', 2], ['xpPct', 1]], kpw: [['longPct', 1], ['longPg', 1]] },
  P: { ppw: [['ypp', 1]], pac: [['in20', 1], ['ypp', 0.3]] }
};
SKILLS.TE = SKILLS.WR;
// Ratings that make up each position's overall: these move together to reach the target overall
const POS_SKILLS = {
  QB: ['tha', 'thp', 'thv', 'elu', 'spd', 'stre', 'bsc'], RB: ['spd', 'elu', 'stre', 'bsc', 'hnd', 'rtr', 'pbk', 'rbk'],
  WR: ['hnd', 'rtr', 'spd', 'elu', 'stre', 'bsc'], TE: ['hnd', 'rtr', 'pbk', 'rbk', 'stre', 'spd'], OL: ['pbk', 'rbk', 'stre', 'spd'],
  DL: ['prs', 'rns', 'tck', 'stre', 'spd'], LB: ['prs', 'rns', 'pcv', 'tck', 'stre', 'spd'], CB: ['pcv', 'spd'],
  S: ['pcv', 'tck', 'spd', 'stre'], K: ['kpw', 'kac'], P: ['ppw', 'pac']
};

// ------------------------------------------------------------------ load
const master = JSON.parse(fs.readFileSync(FILE, 'utf8'));
fs.mkdirSync(path.join(ROOT, '_old'), { recursive: true });
fs.copyFileSync(FILE, path.join(ROOT, '_old', 'NFL_Master_before_ratings_rebuild.json'));

// Honors -> percentile floors
const floors = new Map(); // `${pid}|${season}` -> floor
const floor = (pid, season, f) => { const k = pid + '|' + season; floors.set(k, Math.max(floors.get(k) || 0, f)); };
for (const a of master.awards || []) for (const aw of a.awards || []) {
  const w = aw.winner;
  if (aw.name === 'Most Valuable Player') for (const x of w) floor(x.pid, a.season, 0.998);
  else if (/Player of the Year/.test(aw.name) && !/Rookie|Comeback/.test(aw.name)) for (const x of w) floor(x.pid, a.season, 0.995);
  else if (aw.name === 'All-League' && Array.isArray(w)) {
    (w[0] || []).forEach(x => floor(x.pid, a.season, 0.99));
    (w[1] || []).forEach(x => floor(x.pid, a.season, 0.975));
  }
}
for (const p of master.players) for (const a of p.awards || []) if (a.type === 'All-Star') floor(p.pid, a.season, 0.95);

// Season totals (regular season, all teams)
const SUM = ['gp', 'gs', 'pss', 'pssCmp', 'pssYds', 'pssTD', 'pssInt', 'pssSk', 'rus', 'rusYds', 'rusTD', 'rec', 'tgt', 'recYds', 'recTD', 'fmb', 'defSk', 'defInt', 'defPssDef', 'defFmbFrc', 'defTckSolo', 'defTckAst', 'fg0', 'fga0', 'fg20', 'fga20', 'fg30', 'fga30', 'fg40', 'fga40', 'fg50', 'fga50', 'xp', 'xpa', 'pnt', 'pntYds', 'pntIn20'];
function seasonTotals(p) {
  const by = new Map();
  for (const s of p.stats || []) {
    if (s.playoffs) continue;
    let t = by.get(s.season);
    if (!t) { t = { av: undefined }; for (const k of SUM) t[k] = 0; by.set(s.season, t); }
    for (const k of SUM) t[k] += s[k] || 0;
    if (typeof s.av === 'number') t.av = (t.av || 0) + s.av;
  }
  for (const [season, t] of by) {
    t.fg = t.fg0 + t.fg20 + t.fg30 + t.fg40 + t.fg50;
    t.fga = t.fga0 + t.fga20 + t.fga30 + t.fga40 + t.fga50;
    t.tck = t.defTckSolo + 0.5 * t.defTckAst;
    t.cov = 2 * t.defInt + (season >= 1999 ? t.defPssDef : 0);
    t.tckData = season >= 1994;
    t.fmbData = season >= 1994;
  }
  return by;
}

// ------------------------------------------------------------------ gather rows
const rows = []; // { p, r, pos, season, t }
const totalsByPid = new Map();
for (const p of master.players) {
  const tot = seasonTotals(p);
  totalsByPid.set(p.pid, tot);
  for (const r of p.ratings || []) {
    const pos = MAIN.includes(r.pos) ? r.pos : (MAIN.includes(p.pos) ? p.pos : 'WR');
    rows.push({ p, r, pos, season: r.season, t: tot.get(r.season), oldOvr: r.ovr ?? 0 });
  }
}
const groups = new Map(); // `${season}|${pos}` -> rows
for (const row of rows) {
  const k = row.season + '|' + row.pos;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(row);
}

// Templates: typical value of every rating at each position (2001-2025 rows), for off-position ratings
const tmpl = {};
for (const pos of MAIN) {
  tmpl[pos] = {};
  const list = rows.filter(x => x.pos === pos && x.season >= 2001 && x.season <= 2025);
  for (const k of KEYS) {
    const vals = list.map(x => x.r[k]).filter(v => typeof v === 'number').sort((a, b) => a - b);
    tmpl[pos][k] = vals.length ? vals[Math.floor(vals.length / 2)] : 40;
  }
}
const weightMean = {};
for (const pos of MAIN) {
  const ws = rows.filter(x => x.pos === pos && x.p.weight).map(x => x.p.weight);
  weightMean[pos] = ws.reduce((a, b) => a + b, 0) / Math.max(1, ws.length);
}

// ------------------------------------------------------------------ step 1: how good (percentile)
for (const [, list] of groups) {
  const withGp = list.filter(x => x.t && x.t.gp > 0);
  const avRows = withGp.filter(x => typeof x.t.av === 'number');
  const prior = avRows.reduce((a, x) => a + x.t.av, 0) / Math.max(1, avRows.reduce((a, x) => a + x.t.gp, 0));
  for (const x of avRows) x.avpg = (x.t.av + prior * 4) / (x.t.gp + 4);
  const rankOf = (arr, key) => {
    const sorted = arr.slice().sort((a, b) => a[key] - b[key]);
    const n = sorted.length;
    sorted.forEach((x, i) => { x['p_' + key] = n > 1 ? i / (n - 1) : 0.5; });
  };
  rankOf(avRows, 'avpg');
  rankOf(list, 'oldOvr');
  for (const x of list) {
    if (x.p_avpg !== undefined) x.pct = 0.75 * x.p_avpg + 0.25 * x.p_oldOvr;
    else if (x.t && x.t.gp > 0) x.pct = x.p_oldOvr;
    else x.pct = undefined; // no games this season: filled from his other seasons below
  }
}
// Smooth across each player's seasons, apply honors, fill seasons without games
const byPlayer = new Map();
for (const row of rows) {
  if (!byPlayer.has(row.p.pid)) byPlayer.set(row.p.pid, []);
  byPlayer.get(row.p.pid).push(row);
}
for (const [pid, list] of byPlayer) {
  list.sort((a, b) => a.season - b.season);
  const raw = list.map(x => x.pct);
  list.forEach((x, i) => {
    if (raw[i] === undefined) return;
    let sum = raw[i] * 0.6, w = 0.6;
    if (raw[i - 1] !== undefined) { sum += raw[i - 1] * 0.2; w += 0.2; }
    if (raw[i + 1] !== undefined) { sum += raw[i + 1] * 0.2; w += 0.2; }
    x.ps = Math.max(sum / w, floors.get(pid + '|' + x.season) || 0);
  });
  // Seasons with no games: nearest real season, minus a little per year past 30
  list.forEach((x, i) => {
    if (x.ps !== undefined) return;
    let best;
    for (let d = 1; d < list.length && best === undefined; d++) {
      if (list[i - d]?.ps !== undefined) best = list[i - d].ps;
      else if (list[i + d]?.ps !== undefined) best = list[i + d].ps;
    }
    const age = x.season - (x.p.born?.year ?? x.season - 25);
    x.ps = Math.max(0, (best ?? 0.3) - (age > 30 ? 0.03 * (age - 30) : 0));
  });
}

// ------------------------------------------------------------------ step 2: what kind (stat profile)
for (const [key, list] of groups) {
  const pos = key.split('|')[1];
  const drive = DRIVERS[pos];
  if (!drive) continue;
  for (const x of list) x.d = x.t && x.t.gp > 0 ? drive(x.t) : {};
  const names = new Set(list.flatMap(x => Object.keys(x.d)));
  for (const name of names) {
    const q = QUAL_BY_DRIVER[name] ?? QUAL[pos];
    const vals = list.map(x => x.d[name]).filter(v => v && v[0] !== undefined && v[1] >= q).map(v => v[0]);
    if (vals.length < 5) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    for (const x of list) {
      const v = x.d[name];
      if (!v || v[0] === undefined || !(v[1] > 0)) continue;
      const z = Math.max(-3, Math.min(3, (v[0] - mean) / sd));
      (x.z = x.z || {})[name] = z * v[1] / (v[1] + q); // low volume counts less
    }
  }
  for (const x of list) {
    x.raw = {};
    for (const [skill, parts] of Object.entries(SKILLS[pos] || {})) {
      let sum = 0, w = 0;
      for (const [name, weight] of parts) {
        if (x.z?.[name] === undefined) continue;
        sum += x.z[name] * weight; w += Math.abs(weight);
      }
      if (w > 0) x.raw[skill] = sum / w;
    }
  }
}
// Smooth each skill across the player's seasons
for (const [, list] of byPlayer) {
  list.forEach((x, i) => {
    x.rawS = {};
    for (const skill of Object.keys(x.raw || {})) {
      let sum = x.raw[skill] * 0.5, w = 0.5;
      for (const j of [i - 1, i + 1]) {
        const y = list[j];
        if (y && y.pos === x.pos && y.raw?.[skill] !== undefined) { sum += y.raw[skill] * 0.25; w += 0.25; }
      }
      x.rawS[skill] = sum / w;
    }
    // Seasons without stats keep the profile of his nearest season at the same position
    if (!Object.keys(x.rawS).length) {
      const near = list.filter(y => y !== x && y.pos === x.pos && y.raw && Object.keys(y.raw).length)
        .sort((a, b) => Math.abs(a.season - x.season) - Math.abs(b.season - x.season))[0];
      if (near) x.rawS = { ...near.raw };
    }
  });
}

// ------------------------------------------------------------------ step 3: join and solve
const clamp = (v) => Math.max(1, Math.min(99, Math.round(v)));
let n = 0;
for (const x of rows) {
  const { p, r, pos } = x;
  const target = pos === 'K' || pos === 'P' ? curve(x.ps) / 0.75 : curve(x.ps);
  const base = { hgt: r.hgt };
  for (const k of KEYS) base[k] = tmpl[pos][k];
  if (p.weight) base.stre = tmpl[pos].stre + (p.weight - weightMean[pos]) * 0.4;
  for (const [skill, raw] of Object.entries(x.rawS || {})) base[skill] = tmpl[pos][skill] + SPREAD * raw;
  const skills = POS_SKILLS[pos];
  const build = (shift) => {
    const out = { ...base };
    for (const k of KEYS) out[k] = clamp(base[k] + (skills.includes(k) ? shift : 0));
    out.hgt = r.hgt;
    return out;
  };
  let lo = -70, hi = 70;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (R.computeOvr(build(mid), pos) < Math.min(99, target)) lo = mid; else hi = mid;
  }
  const out = build((lo + hi) / 2);
  for (const k of KEYS) r[k] = out[k];
  r.pos = pos;
  r.ovrs = {};
  for (const q of R.POSITIONS) r.ovrs[q] = R.computeOvr(r, q);
  r.ovr = r.ovrs[pos];
  const age = r.season - (p.born?.year ?? r.season - 25);
  r.pots = {};
  for (const q of R.POSITIONS) r.pots[q] = R.computePot(r.ovrs[q], age, q);
  r.pot = Math.max(r.ovr, R.computePot(r.ovr, age, pos));
  r.skills = R.computeSkills({ ...r, pos });
  if (++n % 20000 === 0) console.log('  rows', n);
}

fs.writeFileSync(FILE, JSON.stringify(master));
// Older one-time steps are replaced by this rebuild: mark them done for this master so they don't run on top of it
const stat = fs.statSync(FILE);
for (const mark of ['ratings_rescaled.json', 'receiver_ratings_fixed.json']) {
  fs.writeFileSync(path.join(ROOT, 'data_cache', mark), JSON.stringify({ mtimeMs: stat.mtimeMs }));
}
console.log('rebuilt rating rows:', n);
