/**
 * Football GM Ratings, OVR, Potential, and Skills Engine + Madden Converter
 * Ported directly from Football GM worker.js (v74)
 */

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'KR', 'PR'];
const MAIN_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P']);
const SPECIAL_POSITIONS = new Set(['KR', 'PR']);

function normalizePos(rawPos) {
  const p = String(rawPos || '').trim().toUpperCase();
  if (!p) return 'WR';
  if (p === 'QB') return 'QB';
  if (['RB', 'HB', 'FB', 'TB', 'LH', 'RH', 'BB', 'B'].includes(p)) return 'RB';
  if (['WR', 'FL', 'SE', 'SWR'].includes(p)) return 'WR';
  if (['TE', 'H-B'].includes(p)) return 'TE';
  if (['OL', 'OT', 'LT', 'RT', 'T', 'OG', 'LG', 'RG', 'G', 'C', 'LS'].includes(p)) return 'OL';
  if (['DL', 'DE', 'DT', 'NT', 'LE', 'RE', 'LDE', 'RDE', 'LDT', 'RDT', 'DG', 'MG', 'EDGE', 'REDG', 'LEDG', 'DI', 'ED'].includes(p)) return 'DL';
  if (['LB', 'ILB', 'MLB', 'OLB', 'LOLB', 'ROLB', 'LILB', 'RILB', 'SAM', 'MIKE', 'WILL', 'LLB', 'RLB'].includes(p)) return 'LB';
  if (['CB', 'LCB', 'RCB', 'DB'].includes(p)) return 'CB';
  if (['S', 'FS', 'SS', 'SAF', 'DS'].includes(p)) return 'S';
  if (['K', 'PK'].includes(p)) return 'K';
  if (['P'].includes(p)) return 'P';
  if (['KR', 'PR', 'RET'].includes(p)) return 'WR';
  return 'WR';
}

function bound(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function inchesToHgtRating(inches) {
  const h = Number(inches) || 73;
  return bound(Math.round((100 * (h - 64)) / 18), 0, 100);
}

// Exact composite definitions from worker.js (Se / ie)
const COMPOSITES = {
  passingAccuracy: { ratings: ['tha', 'hgt'], weights: [1, 0.2], skill: { label: 'Pa', cutoff: 0.71 } },
  passingDeep: { ratings: ['thp', 'tha', 'hgt'], weights: [1, 0.1, 0.2], skill: { label: 'Pd', cutoff: 0.71 } },
  passingVision: { ratings: ['thv', 'hgt'], weights: [1, 0.5], skill: { label: 'Ps', cutoff: 0.61 } },
  athleticism: { ratings: ['stre', 'spd', 'hgt'], weights: [1, 1, 0.2], skill: { label: 'A', cutoff: 0.61 } },
  rushing: { ratings: ['stre', 'spd', 'elu'], weights: [0.5, 1, 1], skill: { label: 'X', cutoff: 0.55 } },
  catching: { ratings: ['hgt', 'hnd'], weights: [0.2, 1], skill: { label: 'H', cutoff: 0.73 } },
  gettingOpen: { ratings: ['hgt', 'spd', 'rtr', 'hnd'], weights: [1, 0.25, 2, 1] },
  speed: { ratings: ['spd'], weights: [1] },
  passBlocking: { ratings: ['hgt', 'stre', 'spd', 'pbk'], weights: [0.5, 1, 0.2, 1], skill: { label: 'Bp', cutoff: 0.63 } },
  runBlocking: { ratings: ['hgt', 'stre', 'spd', 'rbk'], weights: [0.5, 1, 0.4, 1], skill: { label: 'Br', cutoff: 0.61 } },
  passRushing: { ratings: ['hgt', 'stre', 'spd', 'prs', 'tck'], weights: [1, 1, 0.5, 1, 0.25], skill: { label: 'PR', cutoff: 0.63 } },
  runStopping: { ratings: ['hgt', 'stre', 'spd', 'rns', 'tck'], weights: [0.5, 1, 0.5, 1, 0.4], skill: { label: 'RS', cutoff: 0.61 } },
  passCoverage: { ratings: ['hgt', 'spd', 'pcv'], weights: [0.1, 1, 1], skill: { label: 'L', cutoff: 0.72 } },
  tackling: { ratings: ['spd', 'stre', 'tck'], weights: [1, 1, 2.5] },
  avoidingSacks: { ratings: ['thv', 'elu', 'stre'], weights: [1, 1, 0.25] },
  ballSecurity: { ratings: ['bsc', 'stre'], weights: [1, 0.2] },
  endurance: { ratings: [50, 'endu'], weights: [1, 1] },
  kickingPower: { ratings: ['kpw'], weights: [1] },
  kickingAccuracy: { ratings: ['kac'], weights: [1] },
  puntingPower: { ratings: ['ppw'], weights: [1] },
  puntingAccuracy: { ratings: ['pac'], weights: [1] }
};

// Exact position OVR weights from worker.js (jC)
const POS_WEIGHTS = {
  QB: { passingAccuracy: [3, 1], passingDeep: [3, 1], passingVision: [3, 1], athleticism: [1, 1], rushing: [1, 1], avoidingSacks: [1, 1], ballSecurity: [1, 1], constant0: [-1.25, 1] },
  RB: { rushing: [10, 1], catching: [2, 1], gettingOpen: [1, 1], passBlocking: [1, 1], runBlocking: [1, 1], ballSecurity: [1, 1], constant0: [-1.25, 1] },
  WR: { catching: [5, 1], gettingOpen: [5, 1], rushing: [1, 1], ballSecurity: [1, 1], constant0: [1.25, 1] },
  TE: { catching: [2, 1], gettingOpen: [2, 1], passBlocking: [2, 1], runBlocking: [2, 1], constant0: [-0.525, 1] },
  OL: { passBlocking: [3, 1], runBlocking: [3, 1], constant0: [0.75, 1] },
  DL: { passRushing: [5, 1], runStopping: [5, 1], tackling: [1, 1], constant0: [0.25, 1] },
  LB: { passRushing: [2, 1], runStopping: [2, 1], passCoverage: [1, 1], tackling: [4, 1], constant0: [-0.75, 1] },
  CB: { passCoverage: [4.2, 1], constant0: [1, 1] },
  S: { passCoverage: [2, 1], tackling: [1, 1], constant0: [0.1, 1] },
  K: { kickingPower: [1, 1], kickingAccuracy: [1, 1] },
  P: { puntingPower: [1, 1], puntingAccuracy: [1, 1] },
  KR: { speed: [4, 1], rushing: [-0.5, 1], ballSecurity: [1, 1] },
  PR: { speed: [4, 1], rushing: [-0.5, 1], ballSecurity: [2, 1] }
};

function calcComposite(ratingsObj, ratingKeys, weights) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < ratingKeys.length; i++) {
    const k = ratingKeys[i];
    const val = typeof k === 'number' ? k : (ratingsObj[k] ?? 50);
    const w = weights?.[i] ?? 1;
    num += val * w;
    den += 100 * w;
  }
  return bound(num / den, 0, 1);
}

// Exact NC(e, t) function from worker.js
function computeOvr(ratingsObj, targetPos) {
  const pos = targetPos || ratingsObj.pos || 'WR';
  const def = POS_WEIGHTS[pos];
  if (!def) return 40;

  let r = 0;
  let sumCoeffs = 0;
  for (const [compName, [coeff, power]] of Object.entries(def)) {
    const powerFactor = 100 / Math.pow(100, power);
    let compVal = 0;
    if (compName !== 'constant0') {
      const comp = COMPOSITES[compName];
      compVal = calcComposite(ratingsObj, comp.ratings, comp.weights);
    }
    r += coeff * powerFactor * Math.pow(compVal, power);
    sumCoeffs += coeff;
  }
  r /= sumCoeffs;
  r *= 100;

  let adj = 0;
  if (r >= 68) adj = 15;
  else if (r >= 62) adj = 5 + (r - 62) * (10 / 6);
  else if (r >= 59) adj = (r - 59) * (5 / 3);
  else if (r >= 52) adj = -5 + (r - 52) * (5 / 7);
  else if (r >= 40) adj = -15 + (r - 40) * (10 / 12);
  else adj = -15;

  let ovr = bound(Math.round(r + adj), 0, 100);
  if (pos === 'K' || pos === 'P') {
    ovr = Math.round(ovr * 0.75);
  }
  if (ratingsObj.pos === 'QB' && (pos === 'KR' || pos === 'PR')) {
    ovr = Math.round(ovr * 0.5);
  }
  return ovr;
}

// Exact Potential estimator from worker.js (VC)
const POT_COEFFS = {
  CB: { intercept: 41.22339, age: -1.55671, ovr: 1.73043, interaction: -0.02711 },
  DL: { intercept: 50.39196, age: -1.91082, ovr: 2.00579, interaction: -0.03759 },
  K: { intercept: 35.997, age: -1.349, ovr: 1.834, interaction: -0.032 },
  KR: { intercept: 39.62046, age: -1.47839, ovr: 1.67194, interaction: -0.02539 },
  LB: { intercept: 36.72401, age: -1.37224, ovr: 1.91346, interaction: -0.03444 },
  OL: { intercept: 38.22024, age: -1.44549, ovr: 2.13113, interaction: -0.04226 },
  P: { intercept: 36.09308, age: -1.3511, ovr: 1.90802, interaction: -0.03557 },
  PR: { intercept: 38.16013, age: -1.42061, ovr: 1.93835, interaction: -0.03559 },
  QB: { intercept: 47.34247, age: -1.78499, ovr: 2.12059, interaction: -0.04236 },
  RB: { intercept: 18.70945, age: -0.69679, ovr: 2.40819, interaction: -0.05307 },
  S: { intercept: 42.84427, age: -1.62036, ovr: 1.99803, interaction: -0.03686 },
  TE: { intercept: 28.15031, age: -1.05288, ovr: 2.27735, interaction: -0.04792 },
  WR: { intercept: 46.83016, age: -1.75311, ovr: 1.76216, interaction: -0.02886 }
};

function computePot(ovr, age, pos, peakOvr = 0) {
  const effAge = bound(age || 24, 20, 45);
  if (effAge >= 29) {
    return Math.max(ovr, peakOvr);
  }
  const c = POT_COEFFS[pos] || POT_COEFFS.WR;
  let est = c.intercept + c.age * effAge + c.ovr * ovr + c.interaction * effAge * ovr;
  if (pos === 'K' || pos === 'P') {
    est = Math.min(75, est);
  }
  const pot = bound(Math.round(est), ovr, 99);
  return Math.max(pot, peakOvr, ovr);
}

// Exact RC(e) skill badge calculator from worker.js
function computeSkills(ratingsObj) {
  const skills = [];
  for (const comp of Object.values(COMPOSITES)) {
    if (comp.skill) {
      const val = calcComposite(ratingsObj, comp.ratings, comp.weights);
      const cutoff = comp.skill.cutoff ?? 0.61;
      if (val > cutoff) {
        skills.push(comp.skill.label);
      }
    }
  }
  skills.sort();
  return skills;
}

function finalizeRatingObject(rawRatings, pos, season, age, peakOvr = 0) {
  const r = { ...rawRatings, pos, season };
  const RATING_KEYS = [
    'hgt', 'stre', 'spd', 'endu',
    'thv', 'thp', 'tha',
    'bsc', 'elu', 'rtr', 'hnd',
    'rbk', 'pbk',
    'pcv', 'tck', 'prs', 'rns',
    'kpw', 'kac', 'ppw', 'pac'
  ];
  for (const k of RATING_KEYS) {
    r[k] = bound(Math.round(Number(r[k]) || 25), 0, 100);
  }

  const ovrs = {};
  const pots = {};
  for (const p of POSITIONS) {
    ovrs[p] = computeOvr(r, p);
    pots[p] = computePot(ovrs[p], age, p, p === pos ? peakOvr : 0);
  }
  r.ovrs = ovrs;
  r.pots = pots;
  r.ovr = ovrs[pos];
  r.pot = pots[pos];
  r.fuzz = 0;
  r.skills = computeSkills(r);
  return r;
}

/**
 * Target FBGM OVR given a Madden OVR (0-99).
 * Calibrated to Football GM's official scale:
 * - 99 Madden -> 90 FBGM (All-time great / MVP peak)
 * - 95 Madden -> 83 FBGM (MVP candidate)
 * - 90 Madden -> 75 FBGM (First-team All-Pro)
 * - 85 Madden -> 67 FBGM (Pro Bowl)
 * - 80 Madden -> 59 FBGM (Solid Starter)
 * - 75 Madden -> 52 FBGM (Average Starter)
 * - 70 Madden -> 46 FBGM (Backup / Rotational)
 * - 65 Madden -> 41 FBGM (Depth / Special Teams)
 * - 60 Madden -> 36 FBGM (Fringe)
 */
function maddenOvrToTargetFbgmOvr(maddenOvr, pos) {
  const m = bound(Number(maddenOvr) || 68, 40, 99);
  let target;
  if (m >= 95) target = 83 + ((m - 95) / 4) * 8;        // 95->83, 99->91
  else if (m >= 90) target = 75 + ((m - 90) / 5) * 8;   // 90->75, 95->83
  else if (m >= 80) target = 59 + ((m - 80) / 10) * 16; // 80->59, 90->75
  else if (m >= 70) target = 46 + ((m - 70) / 10) * 13; // 70->46, 80->59
  else if (m >= 60) target = 36 + ((m - 60) / 10) * 10; // 60->36, 70->46
  else target = 24 + ((m - 40) / 20) * 12;              // 40->24, 60->36

  if (pos === 'K' || pos === 'P') {
    // K/P OVRs are scaled by 0.75 in FBGM, so top K/P are ~65-72 OVR
    target = Math.round(target * 0.77);
  }
  return bound(Math.round(target), 20, 94);
}

/**
 * Scale a 0-99 Madden sub-rating to Football GM's 0-100 scale.
 * In Madden, active position ratings cluster around 70-95; in FBGM they cluster around 45-85.
 */
function scaleSubRating(val, fallback = 45, minFloor = 10) {
  const v = Number(val);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  // Piecewise linear mapping from Madden [40..99] -> FBGM [18..92]
  if (v >= 90) return bound(Math.round(74 + ((v - 90) / 9) * 20), minFloor, 98);
  if (v >= 75) return bound(Math.round(52 + ((v - 75) / 15) * 22), minFloor, 98);
  if (v >= 55) return bound(Math.round(30 + ((v - 55) / 20) * 22), minFloor, 98);
  return bound(Math.round(10 + (v / 55) * 20), minFloor, 98);
}

// Primary skill keys that drive each position's OVR in FBGM (preserving true physical speed/height)
const POS_PRIMARY_ATTRS = {
  QB: ['tha', 'thp', 'thv', 'bsc'],
  RB: ['elu', 'bsc', 'hnd', 'rtr', 'rbk', 'pbk'],
  WR: ['hnd', 'rtr', 'elu', 'bsc'],
  TE: ['hnd', 'rtr', 'pbk', 'rbk'],
  OL: ['pbk', 'rbk', 'stre'],
  DL: ['prs', 'rns', 'tck', 'stre'],
  LB: ['tck', 'rns', 'prs', 'pcv'],
  CB: ['pcv'],
  S: ['pcv', 'tck'],
  K: ['kpw', 'kac'],
  P: ['ppw', 'pac']
};

/**
 * Convert a Madden row (either 2001-2025 processed CSV or 2026 Madden 27 CSV)
 * into a calibrated 21-attribute FBGM ratings object.
 */
function convertMaddenRowToFbgm(mRow, pos, heightInches, season, age) {
  const hgt = inchesToHgtRating(heightInches || mRow.height || mRow.height_inches || 73);

  // Extract normalized Madden fields across both CSV schemas
  const getM = (...keys) => {
    for (const k of keys) {
      if (mRow[k] !== undefined && mRow[k] !== '' && mRow[k] !== null) {
        const n = parseFloat(mRow[k]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 0;
  };

  const mOvr = getM('overallrating', 'overall') || 70;
  const spdM = getM('speed', 'speed_rating') || 75;
  const accM = getM('acceleration', 'accel_rating') || spdM;
  const agiM = getM('agility', 'agility_rating') || spdM;
  const strM = getM('strength', 'strength_rating') || 70;
  const staM = getM('stamina', 'stamina_rating') || 80;
  const tghM = getM('toughness', 'tough_rating') || 78;
  const awrM = getM('awareness', 'awareness_rating') || mOvr;
  const prcM = getM('playrecognition', 'play_rec_rating') || awrM;

  // Passing
  const thpM = getM('throwpower', 'throw_power_rating') || (pos === 'QB' ? mOvr + 5 : 25);
  const tasM = getM('throwaccuracyshort', 'throw_acc_short_rating');
  const tamM = getM('throwaccuracymid', 'throw_acc_mid_rating');
  const tadM = getM('throwaccuracydeep', 'throw_acc_deep_rating');
  const thaRaw = (tasM && tamM && tadM)
    ? (0.4 * tasM + 0.35 * tamM + 0.25 * tadM)
    : (tasM || (pos === 'QB' ? mOvr : 20));
  const tupM = getM('throw_under_pressure_rating', 'playaction', 'play_action_rating') || awrM;
  const thvRaw = pos === 'QB' ? (0.65 * awrM + 0.35 * tupM) : (0.5 * awrM + 0.5 * thpM * 0.4);

  // Rushing & Ball Security
  const carM = getM('carrying', 'carry_rating') || 65;
  const bcvM = getM('ballcarriervision', 'bcv_rating') || carM;
  const jukM = getM('jukemove', 'juke_move_rating') || agiM;
  const spnM = getM('spinmove', 'spin_move_rating') || agiM;
  const btkM = getM('break_tackle_rating', 'trucking', 'truck_rating', 'stiffarm', 'stiff_arm_rating') || agiM;
  const codM = getM('changeofdirection', 'change_of_direction_rating') || agiM;

  // Receiving & Route Running
  const cthM = getM('catching', 'catch_rating') || 55;
  const citM = getM('catchintraffic', 'cit_rating') || cthM;
  const spcM = getM('spectacularcatch', 'spec_catch_rating') || cthM;
  const srrM = getM('shortrouterunning', 'route_run_short_rating');
  const mrrM = getM('midrouterunning', 'route_run_med_rating');
  const drrM = getM('deeprouterunning', 'route_run_deep_rating');
  const relM = getM('release', 'release_rating') || cthM;
  const rtrRaw = (srrM || mrrM || drrM)
    ? (0.4 * (srrM || mrrM || drrM) + 0.35 * (mrrM || srrM || drrM) + 0.25 * (drrM || mrrM || srrM))
    : (['WR', 'TE', 'RB'].includes(pos) ? (0.7 * cthM + 0.3 * agiM) : 25);

  // Blocking
  const rbkM = getM('runblocking', 'run_block_rating') || (pos === 'OL' ? mOvr : 35);
  const pbkM = getM('passblocking', 'pass_block_rating') || (pos === 'OL' ? mOvr : 35);
  const iblM = getM('impactblocking', 'impact_block_rating') || rbkM;

  // Defense
  const mcvM = getM('mancoverage', 'man_cover_rating');
  const zcvM = getM('zonecoverage', 'zone_cover_rating');
  const prsCovM = getM('press', 'press_rating') || mcvM || zcvM;
  const pcvRaw = (mcvM || zcvM)
    ? (0.45 * Math.max(mcvM, zcvM) + 0.35 * ((mcvM + zcvM) / (mcvM && zcvM ? 2 : 1)) + 0.2 * (prcM || awrM))
    : (['CB', 'S', 'LB'].includes(pos) ? mOvr : 20);

  const tckM = getM('tackle', 'tackle_rating') || (['DL', 'LB', 'S', 'CB'].includes(pos) ? mOvr : 30);
  const powM = getM('hitpower', 'hit_power_rating') || tckM;
  const purM = getM('pursuit', 'pursuit_rating') || tckM;

  const pmvM = getM('power_moves_rating');
  const fmvM = getM('finesse_moves_rating');
  const bshM = getM('block_shed_rating') || (['DL', 'LB'].includes(pos) ? (0.6 * strM + 0.4 * tckM) : 25);

  const prsRaw = (pmvM || fmvM)
    ? (0.65 * Math.max(pmvM, fmvM) + 0.35 * ((pmvM + fmvM) / (pmvM && fmvM ? 2 : 1)))
    : (['DL', 'LB'].includes(pos) ? (0.45 * mOvr + 0.3 * strM + 0.25 * spdM) : 20);

  const rnsRaw = ['DL', 'LB', 'S'].includes(pos)
    ? (0.45 * bshM + 0.35 * tckM + 0.2 * (prcM || awrM))
    : 22;

  // Special Teams
  const kpwM = getM('kickpower', 'kick_power_rating') || (pos === 'K' || pos === 'P' ? mOvr + 8 : 20);
  const kacM = getM('kickaccuracy', 'kick_acc_rating') || (pos === 'K' || pos === 'P' ? mOvr + 5 : 20);

  const raw = {
    hgt,
    stre: scaleSubRating(strM, 50),
    spd: scaleSubRating(0.7 * spdM + 0.3 * accM, 50),
    endu: scaleSubRating(0.6 * staM + 0.4 * tghM, 55),
    thv: pos === 'QB' ? scaleSubRating(thvRaw, 55) : scaleSubRating(thvRaw, 20, 10),
    thp: pos === 'QB' ? scaleSubRating(thpM, 60) : scaleSubRating(thpM, 20, 10),
    tha: pos === 'QB' ? scaleSubRating(thaRaw, 55) : scaleSubRating(thaRaw, 18, 10),
    bsc: scaleSubRating(0.65 * carM + 0.35 * bcvM, 50),
    elu: scaleSubRating(0.35 * agiM + 0.25 * jukM + 0.2 * codM + 0.2 * btkM, 45),
    rtr: ['WR', 'TE', 'RB'].includes(pos) ? scaleSubRating(0.8 * rtrRaw + 0.2 * relM, 50) : scaleSubRating(rtrRaw, 20, 10),
    hnd: ['WR', 'TE', 'RB'].includes(pos) ? scaleSubRating(0.5 * cthM + 0.3 * citM + 0.2 * spcM, 52) : scaleSubRating(cthM, 30, 10),
    rbk: ['OL', 'TE', 'RB'].includes(pos) ? scaleSubRating(0.75 * rbkM + 0.25 * iblM, 52) : scaleSubRating(rbkM, 25, 10),
    pbk: ['OL', 'TE', 'RB'].includes(pos) ? scaleSubRating(pbkM, 52) : scaleSubRating(pbkM, 25, 10),
    pcv: ['CB', 'S', 'LB'].includes(pos) ? scaleSubRating(pcvRaw, 52) : scaleSubRating(pcvRaw, 20, 10),
    tck: ['DL', 'LB', 'CB', 'S'].includes(pos) ? scaleSubRating(0.5 * tckM + 0.25 * purM + 0.25 * powM, 52) : scaleSubRating(tckM, 25, 10),
    prs: ['DL', 'LB'].includes(pos) ? scaleSubRating(prsRaw, 50) : scaleSubRating(prsRaw, 20, 10),
    rns: ['DL', 'LB', 'S'].includes(pos) ? scaleSubRating(rnsRaw, 50) : scaleSubRating(rnsRaw, 20, 10),
    kpw: pos === 'K' ? scaleSubRating(kpwM, 65) : (pos === 'P' ? scaleSubRating(kpwM * 0.8, 45) : 15),
    kac: pos === 'K' ? scaleSubRating(kacM, 65) : (pos === 'P' ? scaleSubRating(kacM * 0.8, 45) : 15),
    ppw: pos === 'P' ? scaleSubRating(kpwM, 65) : (pos === 'K' ? scaleSubRating(kpwM * 0.8, 45) : 15),
    pac: pos === 'P' ? scaleSubRating(kacM, 65) : (pos === 'K' ? scaleSubRating(kacM * 0.8, 45) : 15)
  };

  // Calibrate primary position attributes so computeOvr(raw, pos) matches target FBGM OVR within 1 point
  const targetOvr = maddenOvrToTargetFbgmOvr(mOvr, pos);
  const primKeys = POS_PRIMARY_ATTRS[pos] || ['spd', 'stre'];

  for (let iter = 0; iter < 12; iter++) {
    const curOvr = computeOvr({ ...raw, pos }, pos);
    const diff = targetOvr - curOvr;
    if (Math.abs(diff) <= 1) break;
    const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.45));
    for (const k of primKeys) {
      raw[k] = bound(raw[k] + step, 15, 98);
    }
  }

  return finalizeRatingObject(raw, pos, season, age);
}

/**
 * Generate a ratings object for a season without a direct Madden row
 * by either adapting a nearby season's rating object or synthesizing from PFR Approximate Value (AV) / stats.
 */
function generateRatingFromBaseOrAV(baseRating, pos, heightInches, season, age, av = null, gp = 0, gs = 0, draftRound = 0) {
  let targetOvr;
  const baseOvr = baseRating ? (baseRating.ovr || baseRating.overall || 50) : null;

  if (baseRating) {
    const ageDiff = season - (baseRating.season || season);
    const peakAge = pos === 'RB' ? 25 : (pos === 'QB' ? 29 : 27);
    const distFromPeak = Math.max(0, (age || 25) - peakAge);
    // Superstars (baseOvr >= 85) decline much more slowly than replacement-level players
    const declineRate = baseOvr >= 85 ? 0.75 : (baseOvr >= 75 ? 1.0 : 1.5);
    const agePenalty = Math.round(Math.max(0, distFromPeak - 2) * declineRate);
    const yearsPenalty = Math.round(Math.max(0, ageDiff - 1) * 1.0);
    const adaptedBase = bound(baseOvr - agePenalty - yearsPenalty, 42, 92);

    if (season === 2026) {
      // Mid-season 2026: stats/AV are partial, so trust adapted base rating
      targetOvr = adaptedBase;
    } else if (av !== null && av !== undefined && av !== '' && Number(av) > 0) {
      const avNum = Number(av);
      let avOvr;
      if (avNum >= 18) avOvr = 84 + Math.min(8, Math.round((avNum - 18) * 1.2));
      else if (avNum >= 12) avOvr = 70 + Math.round(((avNum - 12) / 6) * 14);
      else if (avNum >= 6) avOvr = 54 + Math.round(((avNum - 6) / 6) * 16);
      else if (avNum >= 2) avOvr = 44 + Math.round(((avNum - 2) / 4) * 10);
      else avOvr = 38 + avNum * 2;

      // Blend AV with base: AV can raise or lower rating, but doesn't crater a star in an injury season
      targetOvr = Math.max(adaptedBase - 4, Math.min(adaptedBase + 5, Math.round(0.6 * adaptedBase + 0.4 * avOvr)));
    } else {
      targetOvr = adaptedBase;
    }
  } else if (av !== null && av !== undefined && av !== '') {
    const avNum = Number(av) || 0;
    // PFR single-season AV scale: 18+ MVP (85+ OVR), 14+ All-Pro (76+ OVR), 10+ Pro Bowl (66+ OVR), 6+ Starter (55+ OVR), 2+ Backup (45 OVR)
    if (avNum >= 18) targetOvr = 84 + Math.min(8, Math.round((avNum - 18) * 1.2));
    else if (avNum >= 12) targetOvr = 70 + Math.round(((avNum - 12) / 6) * 14);
    else if (avNum >= 6) targetOvr = 54 + Math.round(((avNum - 6) / 6) * 16);
    else if (avNum >= 2) targetOvr = 44 + Math.round(((avNum - 2) / 4) * 10);
    else targetOvr = 38 + avNum * 2;
  } else {
    // Estimate from games started / games played / draft pedigree
    if (gs >= 12) targetOvr = 56;
    else if (gs >= 6 || gp >= 14) targetOvr = 49;
    else if (gp >= 4) targetOvr = 43;
    else if (draftRound === 1) targetOvr = 52;
    else if (draftRound === 2 || draftRound === 3) targetOvr = 46;
    else targetOvr = 39;
  }

  if (pos === 'K' || pos === 'P') {
    targetOvr = Math.min(72, Math.round(targetOvr * 0.85));
  }

  // Blend with baseRating if present so a veteran keeps their archetype & physical profile
  if (baseRating) {
    const raw = {};
    const RATING_KEYS = [
      'hgt', 'stre', 'spd', 'endu',
      'thv', 'thp', 'tha',
      'bsc', 'elu', 'rtr', 'hnd',
      'rbk', 'pbk',
      'pcv', 'tck', 'prs', 'rns',
      'kpw', 'kac', 'ppw', 'pac'
    ];
    for (const k of RATING_KEYS) raw[k] = baseRating[k] ?? 40;
    raw.hgt = inchesToHgtRating(heightInches || 73);

    const blendedTarget = targetOvr;
    const primKeys = POS_PRIMARY_ATTRS[pos] || ['spd', 'stre'];
    for (let iter = 0; iter < 12; iter++) {
      const curOvr = computeOvr({ ...raw, pos }, pos);
      const diff = blendedTarget - curOvr;
      if (Math.abs(diff) <= 1) break;
      const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.45));
      for (const k of primKeys) {
        raw[k] = bound(raw[k] + step, 15, 98);
      }
    }
    return finalizeRatingObject(raw, pos, season, age);
  }

  // Construct fresh position-archetype ratings when no Madden row exists
  const hgt = inchesToHgtRating(heightInches || 73);
  const raw = {
    hgt,
    stre: ['OL', 'DL', 'LB', 'TE'].includes(pos) ? 62 : 48,
    spd: ['CB', 'WR', 'RB', 'S'].includes(pos) ? 66 : (['OL', 'K', 'P'].includes(pos) ? 38 : 54),
    endu: 60,
    thv: pos === 'QB' ? 58 : 20,
    thp: pos === 'QB' ? 62 : 20,
    tha: pos === 'QB' ? 58 : 18,
    bsc: ['RB', 'WR', 'QB', 'TE'].includes(pos) ? 56 : 35,
    elu: ['RB', 'WR', 'CB'].includes(pos) ? 58 : 35,
    rtr: ['WR', 'TE', 'RB'].includes(pos) ? 56 : 20,
    hnd: ['WR', 'TE', 'RB', 'CB', 'S'].includes(pos) ? 56 : 28,
    rbk: ['OL', 'TE', 'RB'].includes(pos) ? 58 : 22,
    pbk: ['OL', 'TE', 'RB'].includes(pos) ? 58 : 22,
    pcv: ['CB', 'S', 'LB'].includes(pos) ? 58 : 20,
    tck: ['DL', 'LB', 'CB', 'S'].includes(pos) ? 58 : 25,
    prs: ['DL', 'LB'].includes(pos) ? 56 : 20,
    rns: ['DL', 'LB', 'S'].includes(pos) ? 56 : 20,
    kpw: pos === 'K' ? 68 : 15,
    kac: pos === 'K' ? 68 : 15,
    ppw: pos === 'P' ? 68 : 15,
    pac: pos === 'P' ? 68 : 15
  };

  const primKeys = POS_PRIMARY_ATTRS[pos] || ['spd', 'stre'];
  for (let iter = 0; iter < 14; iter++) {
    const curOvr = computeOvr({ ...raw, pos }, pos);
    const diff = targetOvr - curOvr;
    if (Math.abs(diff) <= 1) break;
    const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.45));
    for (const k of primKeys) {
      raw[k] = bound(raw[k] + step, 15, 98);
    }
  }
  return finalizeRatingObject(raw, pos, season, age);
}

module.exports = {
  POSITIONS,
  MAIN_POSITIONS,
  SPECIAL_POSITIONS,
  normalizePos,
  inchesToHgtRating,
  computeOvr,
  computePot,
  computeSkills,
  finalizeRatingObject,
  convertMaddenRowToFbgm,
  generateRatingFromBaseOrAV
};
