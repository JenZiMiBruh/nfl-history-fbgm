/**
 * season_slicer.js - turns the master league (NFL_Master_1966_2026.json) into a
 * Football GM league file that starts at any season 1966-2026.
 *
 * Shared by nfl_season_selector.html (browser) and the CLI below (Node):
 *   node --max-old-space-size=12000 src/season_slicer.js --season 1986 --phase regular   (the 1985-86 season)
 *
 * phase: "preseason" (FBGM phase 0) | "regular" (phase 1, real schedule, week 1)
 *        | "live" (2026 only: the master as-is, the live season with real results so far)
 * week:  with phase "regular", start at that week (1999+): earlier weeks are played from real games
 *        (opts.weekly = data_cache/weekly/<season>.json; CLI: --week 9)
 */
(function (root) {
  'use strict';

  // Start points, like Basketball GM's real-player leagues. The last three start after season S has really been played:
  //   playoffs       regular season done (real records, stats, standings), no games left: the playoffs are next
  //   afterplayoffs  playoffs done too (real champion, awards), heading into the draft
  //   draft          draft day, with the real draft order
  const PHASES = { preseason: 0, regular: 1, playoffs: 1, afterplayoffs: 4, draft: 5 };
  const PHASE_LABELS = { preseason: 'Preseason', regular: 'Regular Season', playoffs: 'Playoffs', afterplayoffs: 'After Playoffs', draft: 'Draft' };

  const DEPTH_POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'KR', 'PR'];
  /** Football GM depth chart: every roster player at every slot, best rating first. */
  function buildDepth(roster) {
    const depth = {};
    for (const pos of DEPTH_POS) {
      depth[pos] = roster.map(p => ({ pid: p.pid, v: ovrAt(p.ratings[p.ratings.length - 1] || {}, pos), own: (p.ratings[p.ratings.length - 1] || {}).pos === pos }))
        .sort((a, b) => (b.own - a.own) * (pos === 'KR' || pos === 'PR' ? 0 : 1) || b.v - a.v).map(x => x.pid);
    }
    return depth;
  }

  /**
   * Scale each team's contracts so payroll fits under the cap with room to sign players
   * (about 92% of the cap), keeping each player's pay relative to his teammates. Without
   * this, teams start over a hard cap and good free agents never get signed.
   */
  function fitPayrolls(players, rules) {
    const target = rules.salaryCap * 0.92;
    const byTeam = {};
    for (const p of players) if (p.tid >= 0 && p.contract) (byTeam[p.tid] = byTeam[p.tid] || []).push(p);
    for (const roster of Object.values(byTeam)) {
      const total = roster.reduce((a, p) => a + p.contract.amount, 0);
      if (total <= target) continue;
      const atMin = roster.filter(p => p.contract.amount <= rules.minContract);
      const rest = roster.filter(p => p.contract.amount > rules.minContract);
      const room = target - atMin.length * rules.minContract;
      const restTotal = rest.reduce((a, p) => a + p.contract.amount, 0);
      const k = restTotal > 0 ? Math.max(0, room) / restTotal : 1;
      for (const p of rest) p.contract = Object.assign({}, p.contract, { amount: Math.max(rules.minContract, Math.round(p.contract.amount * k)) });
    }
  }

  // Real traded picks up to a date (master.pickTrades): each pick moves from the team giving it. A team holding several
  // in a round gives the one the trade's pick number points to if known, then its own. A pick that can't be placed
  // (a compensatory pick) moves nothing. firstSeason: earlier drafts are already real.
  function applyPickTrades(draftPicks, trades, date, firstSeason) {
    const original = new Map(); // season|round|number -> the original team of a pick, once a trade has moved it
    for (const [when, season, round, from, to, number] of trades || []) {
      if (when > date || season < firstSeason) continue;
      const held = draftPicks.filter(p => p.season === season && p.round === round && p.tid === from);
      if (!held.length) continue;
      const key = season + '|' + round + '|' + number;
      const known = number ? original.get(key) : undefined;
      const pick = held.find(p => p.originalTid === known) || held.find(p => p.originalTid === from) || held[0];
      if (number && known === undefined) original.set(key, pick.originalTid);
      pick.tid = to;
    }
  }

  function hashInt(n) { let x = (n * 2654435761) >>> 0; x ^= x >>> 13; return x >>> 0; }

  /**
   * @param master  parsed master league object (left unmodified)
   * @param E       nfl_eras module
   * @param opts    { season, phase, schedules, hofYears, logos }
   */
const RATING_KEYS = ['hgt', 'stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];
  // The slim selector master stores per-position overalls as lists in master.ratingPos order
  let RATING_POS = null;
  const ovrAt = (r, pos) => (Array.isArray(r.ovrs) ? r.ovrs[RATING_POS.indexOf(pos)] : (r.ovrs || {})[pos]) || 0;

  function sliceLeague(master, E, opts) {
    const S = opts.season;
    RATING_POS = master.ratingPos || null;
    const phaseName = opts.phase;
    if (opts.logos) E.setLogos(opts.logos, opts.logosProcessed, opts.logoEras);
    // The live file is the master itself, renamed by end year (2026-27 -> 2027). The master is shifted in place to
    // save memory (it is 300+ MB) and flagged, then shifted back before any other season is sliced from it.
    if (master.__shifted) { shiftSeasons(master, -1); delete master.__shifted; }
    if (phaseName === 'live') {
      if (S !== 2026) throw new Error('Live mode is only available for 2026.');
      shiftSeasons(master, 1);
      Object.defineProperty(master, '__shifted', { value: true, configurable: true, enumerable: false });
      master.meta = Object.assign({}, master.meta, { name: 'NFL 2026-27 (Live, ' + (opts.live ? 'through Week ' + opts.live.lastWeek : 'this week') + ')' });
      master.gameAttributes.realPlayerDeterminism = 1;
      master.gameAttributes.useRealSchedules = true;
      return master;
    }
    const P = PHASES[phaseName];
    if (P === undefined) throw new Error('Unknown phase ' + phaseName);
    // How much of season S has really happened: 0 nothing, 1 regular season, 2 regular season and playoffs
    const DONE = phaseName === 'playoffs' ? 1 : (phaseName === 'afterplayoffs' || phaseName === 'draft') ? 2 : 0;
    const keepStat = s => s.season < S || (DONE && s.season === S && (DONE === 2 || !s.playoffs));
    // Start at week W of the regular season (seasons with weekly data): weeks 1..W-1 are already played, from real games
    const W = phaseName === 'regular' && opts.week > 1 && opts.weekly ? opts.week : 0;
    const wkGames = W ? opts.weekly.games.filter(g => g[0] < W) : [];
    const wkLines = (W && opts.weekly.lines) || {};
    // Before 1999 there are no game-by-game player stats: each player's season so far is estimated from his real
    // season totals, scaled by how much of his team's season has been played
    const ESTIMATE = !!W && !opts.weekly.lines;
    const teamPlayed = {}, teamTotal = {}, teamSumEst = {};
    if (W) for (const [day, h, a] of opts.weekly.games) for (const t of [h, a]) {
      teamTotal[t] = (teamTotal[t] || 0) + 1;
      if (day < W) teamPlayed[t] = (teamPlayed[t] || 0) + 1;
    }
    // Each team's starting quarterback per game: the passer with the most attempts
    const qbStart = new Set();
    if (W) {
      const top = new Map();
      for (const [pid, ls] of Object.entries(wkLines)) for (const [day, tid, l] of ls) if (day < W && l.pss > (top.get(day + '|' + tid)?.pss || 0)) top.set(day + '|' + tid, { pid, pss: l.pss });
      for (const [k, v] of top) qbStart.add(v.pid + '|' + k);
    }
    const rules = E.getRules(S);
    const align = E.getAlignment(S);
    const hofYears = opts.hofYears || {};

    // ------------------------------------------------------------------ players
    const players = [];
    const rosterByTid = {};
    for (const src of master.players) {
      const reg = (src.stats || []).filter(s => !s.playoffs);
      if (!reg.length && !(src.ratings || []).length) continue;
      const seasons = reg.map(s => s.season);
      // Draft prospects (no NFL seasons yet) debut the season after their draft year
      const debut = seasons.length ? Math.min(...seasons)
        : src.tid === -2 && src.draft ? src.draft.year + 1 : Math.min(...src.ratings.map(r => r.season));
      const last = seasons.length ? Math.max(...seasons) : debut;
      const p = Object.assign({}, src);
      // Real ratings for later seasons, followed by the NFL history mod as the league is simmed.
      const realRatings = {};
      for (const r of src.ratings || []) {
        if (r.season <= S) continue;
        const row = {};
        for (const k of RATING_KEYS) if (typeof r[k] === 'number') row[k] = r[k];
        realRatings[r.season] = row;
      }
      if (Object.keys(realRatings).length) p.realRatings = realRatings; else delete p.realRatings;
      // The team he really played for in each later season (first team that season), for the mod's real retirements
      // and historical rosters. A season missing from the list is a season he didn't play.
      const realTeams = {};
      // His real jersey number each later season, and moves during a season: after N games with his first team he
      // joins the next one (mid-season trades and signings).
      const realJerseys = {};
      const realMoves = [];
      const bySeason = new Map();
      for (const st of src.stats || []) {
        if (st.playoffs || st.season <= S) continue;
        if (realTeams[st.season] === undefined) realTeams[st.season] = st.tid;
        if (st.jerseyNumber !== undefined && realJerseys[st.season] === undefined) realJerseys[st.season] = String(st.jerseyNumber);
        if (!bySeason.has(st.season)) bySeason.set(st.season, []);
        bySeason.get(st.season).push(st);
      }
      for (const [season, rows] of bySeason) {
        let games = 0;
        for (let i = 0; i < rows.length - 1; i++) {
          games += rows[i].gp || 0;
          if (rows[i + 1].tid !== rows[i].tid) realMoves.push({ season, afterGames: games, tid: rows[i + 1].tid, jerseyNumber: rows[i + 1].jerseyNumber !== undefined ? String(rows[i + 1].jerseyNumber) : undefined });
        }
      }
      for (const r of src.ratings || []) {
        if (r.season > S && realTeams[r.season] === undefined) realTeams[r.season] = -1;
      }
      if (Object.keys(realJerseys).length) p.realJerseys = realJerseys; else delete p.realJerseys;
      if (realMoves.length) p.realMoves = realMoves; else delete p.realMoves;
      // Kept even when empty: an empty list means his real career ends here.
      p.realTeams = realTeams;
      p.injury = { type: 'Healthy', gamesRemaining: 0 };
      delete p.gamesUntilTradable;
      delete p.realDeals;
      delete p.draftRow;
      delete p.weekRatings;

      if (debut > S) {
        // Future player: draft prospect in the class drafted after season debut-1.
        // rated by where he really went in the draft (draft_ratings.js); his real ratings take over in his first season
        const r0 = (opts.realDraftRatings !== false && src.draftRow) || src.ratings.find(r => r.season === debut) || src.ratings[0];
        p.tid = -2;
        p.ratings = [Object.assign({}, r0, { season: debut - 1 })];
        p.stats = []; p.awards = []; p.transactions = []; p.salaries = []; p.statsTids = []; p.injuries = []; delete p.diedYear;
        p.draft = Object.assign({}, src.draft, { year: debut - 1, round: 0, pick: 0, tid: -1, originalTid: -1 });
        // Where he was really drafted, so the NFL history mod can have that team pick him.
        if (src.draft && src.draft.round > 0 && src.draft.tid >= 0) p.realDraft = { year: debut - 1, round: src.draft.round, pick: src.draft.pick, tid: src.draft.tid };
        else delete p.realDraft;
        p.contract = { amount: rules.minContract, exp: debut + 2 };
        delete p.retiredYear;
        if (realJerseys[debut] !== undefined) p.jerseyNumber = realJerseys[debut]; else delete p.jerseyNumber;
        p.hof = false;
        players.push(p);
        continue;
      }

      const rowsS = reg.filter(s => s.season === S);
      p.stats = (src.stats || []).filter(keepStat);
      p.awards = (src.awards || []).filter(a => a.season < S || (DONE === 2 && a.season === S));
      p.transactions = (src.transactions || []).filter(t => t.season < S || (t.season === S && (DONE || (t.phase !== undefined && t.phase <= P))));
      p.salaries = (src.salaries || []).filter(s => s.season <= S);
      p.injuries = (src.injuries || []).filter(i => i.season < S || (DONE && i.season === S));
      if (p.diedYear !== undefined && p.diedYear >= S) delete p.diedYear;
      p.ratings = src.ratings.filter(r => r.season <= S);
      if (!p.ratings.length) p.ratings = [Object.assign({}, src.ratings[0], { season: S })];
      // Starting partway through the live season: the ratings he had going into that week (week_ratings.js)
      if (W && src.weekRatings) {
        const wk = Object.keys(src.weekRatings).map(Number).filter(w => w <= W).sort((a, b) => a - b).pop();
        const i = p.ratings.findIndex(r => r.season === S);
        if (wk && i >= 0) p.ratings = p.ratings.slice(0, i).concat([Object.assign({}, src.weekRatings[wk], { season: S })], p.ratings.slice(i + 1));
      }
      p.statsTids = [...new Set(p.stats.map(s => s.tid))];
      delete p.retiredYear;
      p.hof = !!(hofYears[p.pid] && hofYears[p.pid] <= S);

      const played = W ? (wkLines[src.pid] || []).filter(x => x[0] < W) : [];
      if (ESTIMATE && rowsS.length) {
        // His real season, cut to the games played so far: his teams in order, each row scaled by the games it covers
        const totalGp = rowsS.reduce((a, r) => a + (r.gp || 0), 0);
        const first = rowsS[0].tid;
        let left = Math.round(totalGp * (teamPlayed[first] || 0) / (teamTotal[first] || 1));
        for (const r of rowsS) {
          if (left <= 0 || !r.gp) break;
          const take = Math.min(r.gp, left), k = take / r.gp;
          left -= take;
          const row = {};
          for (const [key, v] of Object.entries(r)) row[key] = typeof v === 'number' && !['season', 'tid', 'jerseyNumber', 'yearsWithTeam'].includes(key) && !key.endsWith('Lng') ? Math.round(v * k) : v;
          row.gp = take;
          p.stats.push(row);
          const t = teamSumEst[r.tid] = teamSumEst[r.tid] || {};
          for (const [key, v] of Object.entries(row)) if (typeof v === 'number' && !['season', 'tid', 'jerseyNumber', 'yearsWithTeam', 'gp', 'gs', 'min'].includes(key)) t[key] = key.endsWith('Lng') ? Math.max(t[key] || 0, v) : (t[key] || 0) + v;
        }
        p.statsTids = [...new Set(p.stats.map(st => st.tid))];
      }
      if (played.length) {
        // His season so far, one row per team in the order he played for them, summed from his real games
        const tmpl = (src.stats || []).find(st => !st.playoffs) || {};
        const byTid = new Map();
        for (const [day, tid, l] of played.slice().sort((a, b) => a[0] - b[0])) {
          if (!byTid.has(tid)) {
            const row = {};
            for (const k of Object.keys(tmpl)) row[k] = typeof tmpl[k] === 'number' ? 0 : tmpl[k];
            const real = rowsS.find(r => r.tid === tid);
            byTid.set(tid, Object.assign(row, { season: S, playoffs: false, tid, jerseyNumber: real?.jerseyNumber ?? src.jerseyNumber, yearsWithTeam: real?.yearsWithTeam ?? 1 }));
          }
          const row = byTid.get(tid);
          for (const [k, v] of Object.entries(l)) row[k] = k.endsWith('Lng') ? Math.max(row[k] || 0, v) : (row[k] || 0) + v;
          row.gp = (row.gp || 0) + 1;
          if (qbStart.has(src.pid + '|' + day + '|' + tid)) { row.gs = (row.gs || 0) + 1; }
        }
        p.stats.push(...byTid.values());
        p.statsTids = [...new Set(p.stats.map(s => s.tid))];
      }
      if (rowsS.length) {
        // Starting team = first team listed that season (later rows are mid-season moves); at week W, his team by then
        const row = rowsS[0];
        p.tid = played.length ? played.slice().sort((a, b) => b[0] - a[0])[0][1] : row.tid;
        if (row.jerseyNumber) p.jerseyNumber = row.jerseyNumber;
        // For the roster limit: his games for the team he starts with, plus a little for games elsewhere (a tie-breaker).
        // Counting the whole season let a player traded away after two games (Karl Kirby, 1969 Vikings) outrank a
        // regular who spent the season there (Jim Lindsey)
        const total = rowsS.reduce((a, s) => a + (s.gp || 0), 0);
        const own = rowsS.filter(s => s.tid === p.tid).reduce((a, s) => a + (s.gp || 0), 0);
        p._gp = own + 0.1 * (total - own);
        // At week W the roster limit favors who was really there: played before and after W comes first, and someone
        // whose games were all far from W comes last. (No lines at all, like linemen, keeps his season's games.)
        if (W && wkLines[src.pid]) {
          const ls = wkLines[src.pid];
          if (ls.some(x => x[0] < W) && ls.some(x => x[0] >= W)) p._gp += 100;
          else if (!ls.some(x => Math.abs(x[0] - W) <= 2)) p._gp *= 0.25;
        }
        p._ovr = p.ratings[p.ratings.length - 1].ovr;
        (rosterByTid[p.tid] = rosterByTid[p.tid] || []).push(p);
      } else if (last < S) {
        p.tid = -3;
        p.retiredYear = last + 1;
      } else {
        p.tid = -1; // between stints: free agent
      }

      // Contract for the starting season.
      if (p.tid >= -1) {
        const sal = (src.salaries || []).find(s => s.season === S);
        const ovr = p.ratings[p.ratings.length - 1].ovr;
        const scaled = Math.round(rules.minContract + Math.max(0, ovr - 45) / 45 * (rules.maxContract - rules.minContract) * 0.6);
        const amount = Math.max(rules.minContract, Math.min(rules.maxContract, sal ? sal.amount : scaled));
        const yearsLeft = Math.min(Math.max(last - S, 0), 1 + (hashInt(p.pid + S) % 4));
        // The real deal in force that season (real_contracts.js), the latest signed when an extension overlaps the old one
        const deal = (src.realDeals || []).filter(([a, b]) => a <= S && b >= S).pop();
        const realExp = deal ? Math.min(deal[1], S + 4) : 0;
        p.contract = { amount, exp: realExp || S + yearsLeft };
      } else {
        p.contract = { amount: rules.minContract, exp: Math.max(S - 1, last) };
      }
      // Starting after the playoffs: players whose real career ended this season have retired
      if (DONE === 2 && p.tid >= -1 && last <= S && !(src.ratings || []).some(r => r.season > S)) {
        p.tid = -3; p.retiredYear = S;
      }
      players.push(p);
    }

    // The live season at week W: every team's real roster and injuries going into that week (build_weekly.js), instead
    // of the trim below. Players on no roster that week are free agents; the roster limit fits the biggest real roster.
    let liveRosterMax = 0;
    const wkRosters = W && S >= 2026 && opts.weekly && opts.weekly.rosters;
    if (wkRosters) {
      // each team's latest roster at or before week W: a team on its bye has no roster that week (the 2026 Chiefs in week 5)
      const latest = {};
      for (const d of Object.keys(wkRosters).map(Number).filter(d => d <= W)) for (const r of wkRosters[d]) latest[r[1]] = Math.max(latest[r[1]] || 0, d);
      const on = new Map();
      for (const d of Object.keys(wkRosters).map(Number)) for (const r of wkRosters[d]) if (latest[r[1]] === d) on.set(r[0], r);
      if (on.size) {
        const count = {};
        for (const p of players) {
          if (p.tid < -1) continue;
          const r = on.get(p.pid);
          if (!r) { if (p.tid >= 0) p.tid = -1; continue; }
          p.tid = r[1];
          p.injury = r[2] ? { type: r[2], gamesRemaining: r[3] } : { type: 'Healthy', gamesRemaining: 0 };
          count[r[1]] = (count[r[1]] || 0) + 1;
        }
        liveRosterMax = Math.max(0, ...Object.values(count));
        for (const k of Object.keys(rosterByTid)) delete rosterByTid[k];
      }
    }
    // Era roster limit: extras (fewest games, then lowest OVR) start as free agents. Each position keeps its minimum
    // first (the best by the same order), so a season with dozens of extra players can't squeeze out a position: in
    // 1987 the strike's replacement players outnumbered the injured quarterbacks' games, and teams had no quarterback.
    // (only what a lineup needs: in early eras position players kicked and punted and players covered several
    // positions, so bigger minimums kept barely-used backups over real regulars, like Joe Marconi on the 1966 Bears)
    // Defensive backs count as one group: older data labels most of them CB, so a safety minimum kept 0-game backups.
    const MIN_AT = { QB: 2, RB: 1, WR: 2, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4 };
    const minGroup = pos => (pos === 'CB' || pos === 'S' ? 'DB' : pos);
    for (const tid of Object.keys(rosterByTid)) {
      const roster = rosterByTid[tid];
      if (roster.length > rules.maxRosterSize) {
        roster.sort((a, b) => (b._gp - a._gp) || (b._ovr - a._ovr));
        const keep = new Set();
        for (const [pos, n] of Object.entries(MIN_AT)) roster.filter(p => minGroup(p.ratings[p.ratings.length - 1].pos) === pos).slice(0, n).forEach(p => keep.add(p));
        for (const p of roster) if (keep.size < rules.maxRosterSize) keep.add(p);
        for (const p of roster) if (!keep.has(p)) p.tid = -1;
      }
    }
    for (const p of players) { delete p._gp; delete p._ovr; }

    // Phone-friendly: a much smaller league for low-end phones. Keeps everyone still playing, free agents, every future
    // draft class (the real drafts keep coming as the league is simmed), players retired within the last 10 seasons,
    // Hall of Famers, and anyone the awards, All-Star and retired-number pages point to; long-retired role players are
    // left out.
    // Past seasons show the team's current logo instead of a copy of each era's (see the teams below).
    if (opts.lite) {
      const keep = new Set();
      for (const a of master.awards || []) if (a.season < S) for (const aw of a.awards || []) for (const w of [aw.winner].flat(3)) if (w && w.pid !== undefined) keep.add(w.pid);
      for (const a of master.allStars || []) if (a.season < S) for (const t of a.teams || []) for (const w of t) if (w && w.pid !== undefined) keep.add(w.pid);
      for (const t of master.teams) for (const j of t.retiredJerseyNumbers || []) if (j.pid !== undefined) keep.add(j.pid);
      const before = players.length;
      for (let i = players.length - 1; i >= 0; i--) {
        const p = players[i];
        if (p.tid === -2) continue; // every future draft class
        if (p.tid !== -3 || p.hof || keep.has(p.pid) || (p.retiredYear !== undefined && p.retiredYear >= S - 10)) continue;
        players.splice(i, 1);
      }
      // Family links only to players still in the league (a dropped father would be a link to nobody)
      const kept = new Set(players.map(p => p.pid));
      for (const p of players) if (p.relatives) { p.relatives = p.relatives.filter(r => kept.has(r.pid)); if (!p.relatives.length) delete p.relatives; }
      if (typeof console !== 'undefined') console.log('phone-friendly: kept ' + players.length + ' of ' + before + ' players');
    }
    fitPayrolls(players, rules);

    // -------------------------------------------------------------------- teams
    // Standings after weeks 1..W-1: overall, home/away, division and conference records, points, streak, last ten
    const rec = {};
    const blankRec = () => ({ gp: 0, gpHome: 0, won: 0, lost: 0, tied: 0, otl: 0, wonHome: 0, lostHome: 0, tiedHome: 0, otlHome: 0, wonAway: 0, lostAway: 0, tiedAway: 0, otlAway: 0,
      wonDiv: 0, lostDiv: 0, tiedDiv: 0, otlDiv: 0, wonConf: 0, lostConf: 0, tiedConf: 0, otlConf: 0, pts: 0, oppPts: 0, lastTen: [], streak: 0 });
    for (const [, h, a, hp, ap] of wkGames.slice().sort((x, y) => x[0] - y[0])) {
      for (const [me, opp, pf, pa, home] of [[h, a, hp, ap, true], [a, h, ap, hp, false]]) {
        const r = rec[me] = rec[me] || blankRec();
        const res = pf > pa ? 'won' : pf < pa ? 'lost' : 'tied';
        r.gp++; if (home) r.gpHome++;
        r[res]++; r[res + (home ? 'Home' : 'Away')]++;
        if (align.teamDiv[me] && align.teamDiv[opp]) {
          if (align.teamDiv[me].did === align.teamDiv[opp].did) r[res + 'Div']++;
          if (align.teamDiv[me].cid === align.teamDiv[opp].cid) r[res + 'Conf']++;
        }
        r.pts += pf; r.oppPts += pa;
        // Football GM's codes: 1 won, 0 lost, -1 tied
        r.lastTen = [res === 'won' ? 1 : res === 'lost' ? 0 : -1, ...r.lastTen].slice(0, 10);
        r.streak = res === 'won' ? (r.streak > 0 ? r.streak + 1 : 1) : res === 'lost' ? (r.streak < 0 ? r.streak - 1 : -1) : 0;
      }
    }
    // Team totals so far: the sum of its players' real lines
    const teamSum = ESTIMATE ? teamSumEst : {};
    for (const ls of Object.values(wkLines)) for (const [day, tid, l] of ls) {
      if (day >= W) continue;
      const t = teamSum[tid] = teamSum[tid] || {};
      for (const [k, v] of Object.entries(l)) t[k] = k.endsWith('Lng') ? Math.max(t[k] || 0, v) : (t[k] || 0) + v;
    }
    const teams = master.teams.map(src => {
      const b = E.getTeamBranding(src.tid, S);
      const a = align.teamDiv[src.tid];
      const t = Object.assign({}, src, {
        region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall, colors: b.colors, jersey: b.jersey,
        pop: b.pop, stadiumCapacity: b.stadiumCapacity, cid: a.cid, did: a.did, disabled: b.disabled
      });
      // srID would make Football GM replace this branding with its own built-in team info.
      delete t.srID;
      t.depth = buildDepth(players.filter(p => p.tid === src.tid)); delete t.keepRosterSorted;
      t.seasons = (src.seasons || []).filter(s => s.season < S).map(s => {
        const sb = E.getTeamBranding(src.tid, s.season);
        return Object.assign({}, s, { region: sb.region, name: sb.name, abbrev: sb.abbrev, imgURL: sb.imgURL, imgURLSmall: sb.imgURLSmall, colors: sb.colors, jersey: sb.jersey });
      });
      const realS = DONE ? (src.seasons || []).find(s => s.season === S) : null;
      if (!b.disabled && realS) {
        // The season really played: real record and standings (and playoff result once the playoffs are done)
        t.seasons.push(Object.assign({}, realS, { region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall,
          colors: b.colors, jersey: b.jersey, cid: a.cid, did: a.did, playoffRoundsWon: DONE === 2 ? realS.playoffRoundsWon : -1 }));
      } else if (!b.disabled) {
        t.seasons.push({ tid: src.tid, cid: a.cid, did: a.did, region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall,
          colors: b.colors, jersey: b.jersey, pop: b.pop, stadiumCapacity: b.stadiumCapacity, season: S, gp: 0, gpHome: 0, att: 0, cash: 25000,
          won: 0, lost: 0, tied: 0, otl: 0, wonHome: 0, lostHome: 0, tiedHome: 0, otlHome: 0, wonAway: 0, lostAway: 0, tiedAway: 0, otlAway: 0,
          wonDiv: 0, lostDiv: 0, tiedDiv: 0, otlDiv: 0, wonConf: 0, lostConf: 0, tiedConf: 0, otlConf: 0, pts: 0, oppPts: 0, lastTen: [], streak: 0, playoffRoundsWon: -1 });
        if (rec[src.tid]) Object.assign(t.seasons[t.seasons.length - 1], rec[src.tid]);
      }
      if (opts.lite) for (const ts of t.seasons) if (ts.season < S) { delete ts.imgURL; delete ts.imgURLSmall; }
      t.stats = (src.stats || []).filter(keepStat);
      if (W && rec[src.tid] && !b.disabled) {
        const tmpl = (src.stats || []).find(st => !st.playoffs) || {};
        const row = {};
        for (const k of Object.keys(tmpl)) row[k] = typeof tmpl[k] === 'number' ? 0 : tmpl[k];
        Object.assign(row, { season: S, playoffs: false, tid: src.tid }, teamSum[src.tid] || {}, { gp: rec[src.tid].gp, pts: rec[src.tid].pts, oppPts: rec[src.tid].oppPts });
        t.stats.push(row);
      }
      t.retiredJerseyNumbers = (src.retiredJerseyNumbers || []).filter(j => j.seasonRetired < S);
      return t;
    });

    // ----------------------------------------------------------- game attributes
    const timeline = (fn) => {
      const out = []; let prev;
      for (let y = Math.min(E.FIRST_SEASON, S); y <= S; y++) {
        const v = fn(y);
        if (JSON.stringify(v) !== JSON.stringify(prev)) out.push({ start: out.length ? y : null, value: v });
        prev = v;
      }
      return out;
    };
    const ga = Object.assign({}, master.gameAttributes, {
      season: S, phase: P, startingSeason: E.FIRST_SEASON,
      numGames: timeline(y => E.getRules(y).numGames),
      numGamesPlayoffSeries: timeline(y => E.getRules(y).numGamesPlayoffSeries),
      numPlayoffByes: timeline(y => E.getRules(y).numPlayoffByes),
      confs: timeline(y => E.getAlignment(y).confs),
      divs: timeline(y => E.getAlignment(y).divs),
      numDraftRounds: rules.numDraftRounds, maxRosterSize: rules.maxRosterSize, minRosterSize: rules.minRosterSize, salaryCap: rules.salaryCap, salaryCapType: rules.salaryCapType,
      minPayroll: rules.minPayroll, minContract: rules.minContract, maxContract: rules.maxContract,
      leagueName: `NFL ${S}`
    });
    // Every other rule (overtime, two-point tries, kickoffs, schedule shape, rookie deals) at its season-S value.
    const timed = new Set(['numGames', 'numGamesPlayoffSeries', 'numPlayoffByes', 'maxOvertimes']);
    for (const k of E.RULE_KEYS) if (!timed.has(k)) ga[k] = rules[k];
    if (liveRosterMax) ga.maxRosterSize = Math.max(ga.maxRosterSize, liveRosterMax); // the live season's real rosters fit
    ga.maxOvertimes = timeline(y => E.getRules(y).maxOvertimes);
    ga.overtimeLengthPlayoffs = rules.overtimeLengthPlayoffs;
    delete ga.userTid; delete ga.userTids;
    // Real schedules from season S on ([home, away, week]), used by the NFL history mod, including the strike-shortened 1982 and 1987 seasons.
    ga.realPlayerDeterminism = 1;
    ga.useRealSchedules = true;
    // Last season with real data: after it, real retirements and historical rosters leave players to the game.
    ga.nflRealDataLastSeason = E.LAST_SEASON;
    // Real jersey retirements after the start season, applied by the mod on schedule (Fitzgerald's #11, 2026); the
    // game's own invented retirements are off.
    ga.aiJerseyRetirement = false;
    ga.nflRetiredNumbers = [];
    for (const src of master.teams) for (const j of src.retiredJerseyNumbers || []) if (j.seasonRetired >= S) ga.nflRetiredNumbers.push(Object.assign({ tid: src.tid }, j));
    if (opts.schedules) {
      ga.realSchedules = {};
      for (const [season, games] of Object.entries(opts.schedules)) {
        if (+season < S) continue;
        ga.realSchedules[season] = games.map(g => [g.homeTid, g.awayTid, g.day]);
      }
    }

    // ------------------------------------------------------------- draft picks
    const draftPicks = [];
    let dpid = 0;
    // After the playoffs, this season's draft uses the real order: every real pick, held by the team that made it
    // (pick numbers are within the round, as Football GM stores them)
    const realOrder = DONE === 2 ? master.players.filter(p => p.draft && p.draft.year === S && p.draft.round > 0 && p.draft.pick > 0 && p.draft.tid >= 0 && !teams[p.draft.tid].disabled)
      .map(p => ({ round: p.draft.round, inRound: p.draft.pick, tid: p.draft.tid })).sort((a, b) => a.round - b.round || a.inRound - b.inRound) : [];
    if (realOrder.length) {
      const inRound = {};
      for (const r of realOrder) {
        if (r.round > rules.numDraftRounds) continue;
        inRound[r.round] = (inRound[r.round] || 0) + 1;
        draftPicks.push({ dpid: dpid++, tid: r.tid, originalTid: r.tid, round: r.round, pick: phaseName === 'draft' ? inRound[r.round] : 0, season: S });
      }
    }
    for (let season = realOrder.length ? S + 1 : S; season <= S + 3; season++) {
      for (const t of teams) {
        if (!E.isActive(t.tid, Math.min(season, 2026))) continue;
        for (let round = 1; round <= rules.numDraftRounds; round++) draftPicks.push({ dpid: dpid++, tid: t.tid, originalTid: t.tid, round, pick: 0, season });
      }
    }

    // ---------------------------------------------------------------- schedule
    let schedule = [];
    const real = opts.schedules && opts.schedules[S];
    if (P === PHASES.regular && !DONE && real) {
      schedule = real.filter(g => !teams[g.homeTid].disabled && !teams[g.awayTid].disabled && (!W || g.day >= W)).map((g, gid) => ({ gid, day: g.day, homeTid: g.homeTid, awayTid: g.awayTid }));
    }

    // ---------------------------------------------------------- scheduled events
    // Names match without case or a suffix (Jr., Sr., II), on both the event and the player side
    const nameKey = n => n.toLowerCase().replace(/[.,]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').trim();
    const srcByPid = new Map(master.players.map(p => [p.pid, p]));
    const pidByName = new Map();
    for (const p of players) {
      const k = nameKey(`${p.firstName} ${p.lastName}`);
      if (!pidByName.has(k)) pidByName.set(k, []);
      pidByName.get(k).push(p);
    }
    // An event's player: same name, born within a year, the closest birth year first, then the one whose career is
    // nearest the event's season (two receivers named Steve Smith were born in 1979; the 2017 retirement is the one
    // who played until 2016, not the one with a 2002 season)
    const careerGap = (pid, season) => {
      const src = srcByPid.get(pid);
      const ys = (src && src.stats || []).filter(s => !s.playoffs).map(s => s.season);
      if (!ys.length || season === undefined) return Infinity;
      return season < Math.min(...ys) ? Math.min(...ys) - season : season > Math.max(...ys) ? season - Math.max(...ys) : 0;
    };
    const resolvePid = (name, born, season) => {
      const key = nameKey(name);
      const c = (pidByName.get(key) || []).filter(p => !born || Math.abs(p.born.year - born) <= 1)
        .sort((x, y) => Math.abs(x.born.year - born) - Math.abs(y.born.year - born) || careerGap(x.pid, season) - careerGap(y.pid, season));
      return c.length ? c[0].pid : undefined;
    };
    // Expansion drafts and contractions happen right after the playoffs (phase 4). A league starting at that moment or at
    // the draft would miss them, so they fire at the next phase instead (Panthers and Jaguars from After Playoffs 1994).
    const scheduledEvents = (P >= 4 ? E.buildScheduledEvents(S, 3, resolvePid).filter(e => !(e.season === S && e.phase <= P && !['expansionDraft', 'contraction'].includes(e.type)))
      .map(e => (e.season === S && e.phase <= P ? Object.assign({}, e, { phase: P + 1 }) : e)) : E.buildScheduledEvents(S, P, resolvePid));
    // A league starting at week W of the regular season has already passed this season's week-1 suspensions, so the
    // games still to serve start out as an absence (Josh Gordon from week 3 of 2014: 8 of his 10 games left)
    if (W) {
      for (const e of E.buildScheduledEvents(S, 0, resolvePid)) {
        const s = e.info && e.info.nflSuspension;
        if (!s || e.season !== S || e.phase !== PHASES.regular) continue;
        const p = players.find(x => x.pid === s.pid);
        const left = s.games - (W - 1);
        if (p && p.tid >= 0 && left > 0) p.injury = { type: s.reason, gamesRemaining: Math.max(left, (p.injury && p.injury.gamesRemaining) || 0) };
      }
    }

    // The games already played, so the schedule shows them: box scores where they exist (the live season), otherwise
    // the real score from the weekly data (no player lines)
    const playedGames = () => {
      if (!W && !DONE) return [];
      const boxes = (master.games || []).filter(g => g.season === S && (!W || g.day < W));
      if (boxes.length || !opts.weekly) return boxes;
      const record = {};
      return opts.weekly.games.filter(g => !W || g[0] < W).map(([day, h, a, hp, ap], i) => {
        const teams = [[h, hp, ap], [a, ap, hp]].map(([tid, pts, opp]) => {
          const r = record[tid] = record[tid] || { won: 0, lost: 0, tied: 0 };
          if (pts > opp) r.won++; else if (pts < opp) r.lost++; else r.tied++;
          return { tid, pts, ptsQtrs: [], players: [], won: r.won, lost: r.lost, tied: r.tied };
        });
        const win = hp >= ap ? teams[0] : teams[1], lose = win === teams[0] ? teams[1] : teams[0];
        return { gid: 900000 + i, day, att: 0, clutchPlays: [], season: S, numPeriods: 4, overtimes: 0, won: { tid: win.tid, pts: win.pts }, lost: { tid: lose.tid, pts: lose.pts }, scoringSummary: [], teams };
      });
    };
    // The date this league starts, for real traded picks
    const startDate = phaseName === 'draft' ? (S + 1) + '-05-01' : phaseName === 'afterplayoffs' ? (S + 1) + '-02-20' : phaseName === 'playoffs' ? (S + 1) + '-01-05'
      : W ? new Date(Date.UTC(S, 8, 5 + 7 * (W - 1))).toISOString().slice(0, 10) : S + '-08-31';
    applyPickTrades(draftPicks, master.pickTrades, startDate, realOrder.length ? S + 1 : S);
    const league = {
      version: master.version,
      startingSeason: E.FIRST_SEASON,
      meta: { name: `NFL ${S}-${String(S + 1).slice(2)} (${W ? 'Week ' + W : PHASE_LABELS[phaseName] || phaseName})` },
      gameAttributes: ga,
      teams,
      players,
      draftPicks,
      schedule,
      scheduledEvents,
      awards: (master.awards || []).filter(a => a.season < S || (DONE === 2 && a.season === S)),
      // Pro Bowl rosters: only seasons with both rosters filled in (Football GM's All-Star History page reads each team's captain)
      allStars: (master.allStars || []).filter(a => (a.season < S || (DONE && a.season === S)) && (a.teams || []).length === 2 && a.teams.every(t => t.length >= 5)),
      playoffSeries: (master.playoffSeries || []).filter(s => s.season < S || (DONE === 2 && s.season === S)),
      // (a Playoffs start hasn't seen this season's Super Bowl or awards yet)
      events: (master.events || []).filter(e => e.season < S || (DONE && e.season === S && (DONE === 2 || !['champion', 'award'].includes(e.type)))),
      // Real head-to-head records for the seasons already played (this season's once its games are done)
      headToHeads: (master.headToHeads || []).filter(h => h.season < S || (DONE && h.season === S))
        .map(h => h.season === S && DONE !== 2 ? { ...h, playoffs: {} } : h)
        .concat(W ? [weekHeadToHead(S, wkGames)] : []),
      releasedPlayers: [],
      // Box scores of the weeks already played, where they exist (the live season: build_live_games.js)
      games: playedGames()
    };
    shiftSeasons(league, 1, true);
    // From the slim selector master (zero stats left out): toJsonChunks puts the zeros back while writing
    if (master.statKeys) league.__statKeys = master.statKeys; // plain fields, so a copy ({...league}) keeps them: without them the file goes out unexpanded and every game ends 0-0
    if (master.ratingPos) league.__ratingPos = master.ratingPos;
    return league;
  }

  /**
   * Names each season by the year it ends, the way Basketball GM does: the 2008-09 season becomes 2009,
   * so the draft held after it is the 2009 draft, and the season that starts in fall 2026 is 2027.
   * The master and nfl_eras keep the NFL's own naming (the year a season starts); this is applied last.
   * Birth years stay real, so ages are as of the year a season ends.
   */
  /** Head-to-head records from a list of [day, homeTid, awayTid, homePts, awayPts] games. */
  function weekHeadToHead(season, games) {
    const regularSeason = {};
    for (const [, h, a, hp, ap] of games) {
      const [x, y, px, py] = h < a ? [h, a, hp, ap] : [a, h, ap, hp];
      const r = (regularSeason[x] = regularSeason[x] || {})[y] = regularSeason[x][y] || { won: 0, lost: 0, tied: 0, otl: 0, otw: 0, pts: 0, oppPts: 0 };
      if (px > py) r.won++; else if (px < py) r.lost++; else r.tied++;
      r.pts += px; r.oppPts += py;
    }
    return { season, regularSeason, playoffs: {} };
  }

  // copy: change copies, never the objects themselves. A sliced league shares its stat lines, ratings, awards and more
  // with the master; shifting those in place moved the master a season too, so the next league built in the same
  // session came out a season off. (In place is for the live file, which is the master itself.)
  function shiftSeasons(league, d, copy) {
    const bump = (o, k) => { if (o && typeof o[k] === 'number' && Number.isFinite(o[k])) o[k] += d; };
    const one = (o, k) => { if (!copy || !o || typeof o[k] !== 'number' || !Number.isFinite(o[k])) { bump(o, k); return o; } return Object.assign({}, o, { [k]: o[k] + d }); };
    const all = (arr, ...ks) => { if (!arr) return arr; if (!copy) { for (const x of arr) for (const k of ks) bump(x, k); return arr; } return arr.map(x => { let y = x; for (const k of ks) if (y && typeof y[k] === 'number' && Number.isFinite(y[k])) { if (y === x) y = Object.assign({}, x); y[k] += d; } return y; }); };
    const rekey = (obj) => { const out = {}; for (const [k, v] of Object.entries(obj || {})) out[/^\d{4}$/.test(k) ? String(+k + d) : k] = v; return out; };

    bump(league, 'startingSeason');
    if (copy) league.gameAttributes = Object.assign({}, league.gameAttributes);
    const ga = league.gameAttributes;
    bump(ga, 'season'); bump(ga, 'startingSeason'); bump(ga, 'nflRealDataLastSeason');
    if (ga.nflRetiredNumbers) ga.nflRetiredNumbers = all(ga.nflRetiredNumbers, 'seasonRetired', 'seasonTeamInfo');
    for (const [k, v] of Object.entries(ga)) if (Array.isArray(v)) ga[k] = all(v, 'start');
    if (ga.realSchedules) ga.realSchedules = rekey(ga.realSchedules);

    for (const t of league.teams) {
      t.seasons = all(t.seasons, 'season'); t.stats = all(t.stats, 'season');
      t.retiredJerseyNumbers = all(t.retiredJerseyNumbers, 'seasonRetired', 'seasonTeamInfo');
    }
    for (const p of [...league.players, ...(league.releasedPlayers || [])]) {
      for (const k of ['stats', 'ratings', 'awards', 'transactions', 'salaries', 'injuries']) if (p[k]) p[k] = all(p[k], 'season');
      p.contract = one(p.contract, 'exp'); p.draft = one(p.draft, 'year'); p.realDraft = one(p.realDraft, 'year'); bump(p, 'retiredYear'); bump(p, 'diedYear');
      if (p.realRatings) p.realRatings = rekey(p.realRatings);
      if (p.realTeams) p.realTeams = rekey(p.realTeams);
      if (p.realJerseys) p.realJerseys = rekey(p.realJerseys);
      if (p.realMoves) p.realMoves = all(p.realMoves, 'season');
    }
    for (const k of ['draftPicks', 'scheduledEvents', 'awards', 'allStars', 'playoffSeries', 'events', 'headToHeads', 'games']) if (league[k]) league[k] = all(league[k], 'season');
  }

  /** Serialize in chunks so very large leagues don't need one giant string. */
  function toJsonChunks(league) {
    const parts = ['{'];
    // Stat lines from the slim master get their zero fields back here, one player at a time, so the full-size
    // lines never all sit in memory at once
    const keys = league.__statKeys;
    const filled = (rows, list) => (rows || []).map(r => { const o = {}; for (const k of list) o[k] = 0; return Object.assign(o, r); });
    const rp = league.__ratingPos;
    const expand = (ratings) => !rp ? ratings : (ratings || []).map(r => {
      const o = Object.assign({}, r);
      for (const k of ['ovrs', 'pots']) if (Array.isArray(r[k])) o[k] = Object.fromEntries(rp.map((q, i) => [q, r[k][i]]));
      return o;
    });
    // realDeals and weekRatings are the master's own (real_contracts.js, week_ratings.js): never in a league file
    const write = (k, x) => k === 'players' && (x.realDeals || x.weekRatings || x.draftRow) ? write(k, Object.assign({}, x, { realDeals: undefined, weekRatings: undefined, draftRow: undefined }))
      : !keys ? JSON.stringify(x)
      : k === 'players' ? JSON.stringify(Object.assign({}, x, { stats: filled(x.stats, keys.player), ratings: expand(x.ratings) }))
      : k === 'teams' ? JSON.stringify(Object.assign({}, x, { stats: filled(x.stats, keys.team) }))
      : JSON.stringify(x);
    Object.keys(league).filter(k => !k.startsWith('__') && k !== 'pickTrades').forEach((k, i) => {
      parts.push((i ? ',' : '') + JSON.stringify(k) + ':');
      const v = league[k];
      if (k === 'teams' && keys) parts.push('[' + v.map(x => write(k, x)).join(',') + ']');
      else if (Array.isArray(v) && v.length > 500) {
        parts.push('[');
        for (let j = 0; j < v.length; j += 500) parts.push((j ? ',' : '') + v.slice(j, j + 500).map(x => write(k, x)).join(','));
        parts.push(']');
      } else parts.push(JSON.stringify(v));
    });
    parts.push('}');
    return parts;
  }

  // ------------------------------------------------------- event descriptions
  // For the event checklists in the selector and the mod's season picker. Events here come from a sliced
  // league, so their seasons are end-year names; nfl_eras is looked up with the season's start year.
  const EVENT_CATEGORIES = [
    ['rules', 'Rule changes'], ['realignment', 'Realignment'], ['expansion', 'Expansion and folding'],
    ['relocation', 'Relocations and renames'], ['branding', 'Logos, colors, jerseys, markets'],
    ['retire', 'Retirements'], ['comeback', 'Comebacks'], ['suspension', 'Suspensions']
  ];
  function eventCategory(e) {
    if (e.type === 'gameAttributes') return e.info.nflSuspension ? 'suspension' : 'rules';
    if (e.type === 'confsDivs') return 'realignment';
    if (e.type === 'contraction' && e.info.nflRelocateTo) return 'relocation';
    if (e.type === 'expansionDraft' || e.type === 'contraction') return 'expansion';
    if (e.type === 'teamInfo') return e.info.region || e.info.name ? 'relocation' : 'branding';
    if (e.type === 'retirePlayer') return 'retire';
    if (e.type === 'unretirePlayer') return 'comeback';
    return 'rules';
  }
  function describeEvent(e, E, nameByPid) {
    const i = e.info;
    const y = e.season - 1;
    const team = (tid) => { const b = E.getTeamBranding(tid, y); return b.region + ' ' + b.name; };
    if (e.type === 'teamInfo') {
      const before = E.getTeamBranding(i.tid, y - 1);
      const what = [i.imgURL && 'logo', i.colors && 'colors', i.jersey && 'jersey', i.pop && 'market size', i.stadiumCapacity && 'stadium'].filter(Boolean);
      const move = i.region || i.name ? before.region + ' ' + before.name + ' become the ' + team(i.tid) : team(i.tid);
      return move + (what.length ? (i.region || i.name ? ' (also ' : ': ') + what.join(', ') + (i.region || i.name ? ')' : '') : '');
    }
    if (e.type === 'expansionDraft') return 'Expansion draft: ' + i.teams.map(t => t.region + ' ' + t.name).join(', ');
    if (e.type === 'contraction' && i.nflRelocateTo) return team(i.tid) + ' move to ' + i.nflRelocateTo.region + ' as the ' + i.nflRelocateTo.name + ' (players and picks go with them)';
    if (e.type === 'contraction') return team(i.tid) + ' suspend operations';
    if (e.type === 'confsDivs') return 'Realignment: ' + i.confs.map(c => c.name).join(' / ') + ', ' + i.divs.length + ' divisions';
    if (e.type === 'gameAttributes' && i.nflSuspension) {
      const n = (nameByPid && nameByPid[i.nflSuspension.pid]) || 'Player ' + i.nflSuspension.pid;
      return n + ': ' + i.nflSuspension.reason + ', ' + i.nflSuspension.games + ' games';
    }
    if (e.type === 'gameAttributes') return 'Rules: ' + Object.entries(i).map(([k, v]) => k + ' ' + (Array.isArray(v) ? '[' + v + ']' : v)).join(', ');
    const name = (nameByPid && nameByPid[i.pid]) || 'Player ' + i.pid;
    if (e.type === 'retirePlayer') return name + ' ' + (i.reason || 'retires');
    if (e.type === 'unretirePlayer') return name + ' ' + (i.reason || 'comes out of retirement') + (i.tid !== undefined ? ' (' + team(i.tid) + ')' : '');
    return e.type;
  }
  // Keep only the chosen events (ids), renumbered.
  function keepEvents(league, keepIds) {
    const keep = new Set(keepIds);
    league.scheduledEvents = league.scheduledEvents.filter(e => keep.has(e.id)).map((e, n) => Object.assign({}, e, { id: n + 1 }));
    return league;
  }

  const api = { applyPickTrades, sliceLeague, shiftSeasons, toJsonChunks, buildDepth, fitPayrolls, PHASES, PHASE_LABELS, EVENT_CATEGORIES, eventCategory, describeEvent, keepEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SEASON_SLICER = api;

  // ------------------------------------------------------------------ CLI
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);
    const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
    // --season is the year the season ends (2009 = the 2008-09 season), matching the generated files.
    const seasonName = parseInt(arg('season', '1967'), 10);
    const season = seasonName - 1;
    const phase = arg('phase', 'regular');
    const week = parseInt(arg('week', '0'), 10);
    const lite = args.includes('--lite');
    const ROOT = path.join(__dirname, '..');
    const E = require('./nfl_eras');
    const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8'));
    const master = read(arg('master', 'NFL_Master_1966_2026.json'));
    const out = sliceLeague(master, E, {
      season, phase, week, lite, weekly: week > 1 && fs.existsSync(path.join(ROOT, `data_cache/weekly/${season}.json`)) ? read(`data_cache/weekly/${season}.json`) : undefined,
      schedules: read('data_cache/real_schedules.json'), hofYears: read('data_cache/hof_years.json'),
      logos: fs.existsSync(path.join(ROOT, 'data_cache/logos.json')) ? read('data_cache/logos.json') : {},
      logosProcessed: fs.existsSync(path.join(ROOT, 'data_cache/logos_processed.json')) ? read('data_cache/logos_processed.json') : {},
      logoEras: fs.existsSync(path.join(ROOT, 'data_cache/logos_eras_final.json')) ? read('data_cache/logos_eras_final.json') : null
    });
    const file = arg('out', path.join(ROOT, `NFL_${seasonName}_${week > 1 ? 'week' + week : phase}_FBGM.json`));
    fs.writeFileSync(file, toJsonChunks(out).join(''));
    console.log('wrote', file, 'players', out.players.length, 'events', out.scheduledEvents.length);
  }
})(typeof window !== 'undefined' ? window : globalThis);
